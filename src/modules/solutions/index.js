// 方案评分与引用系统 - API路由
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 中间件
const { authenticateToken } = require('../auth');
const { requireMember } = require('../aiGatekeeper');

// ========================================
// 方案CRUD
// ========================================

/**
 * 创建方案
 * POST /api/solutions
 */
router.post('/', authenticateToken, requireMember, async (req, res) => {
  try {
    const {
      taskId,
      title,
      problemDefinition,
      solutionContent,
      codeSnippet,
      attachments,
      manualTags,
      difficultyLevel,
      status
    } = req.body;

    // 验证必填字段
    if (!title || !problemDefinition || !solutionContent) {
      return res.status(400).json({
        success: false,
        message: '标题、问题定义和解决方案内容为必填项'
      });
    }

    // 创建方案
    const solution = await prisma.solution.create({
      data: {
        authorId: req.userId,
        taskId: taskId || null,
        title,
        problemDefinition,
        solutionContent,
        codeSnippet: codeSnippet || null,
        attachments: attachments || [],
        manualTags: manualTags || [],
        difficultyLevel: difficultyLevel || null,
        status: status || 'draft',
        autoTags: [] // TODO: 后续添加AI自动标签生成
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            serialNumber: true
          }
        },
        task: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    // 如果发布（非草稿），奖励积分
    if (status === 'published') {
      await prisma.pointsTransaction.create({
        data: {
          userId: req.userId,
          amount: 50,
          transactionType: 'solution_published',
          relatedEntityType: 'solution',
          relatedEntityId: solution.id,
          description: `发布方案：${title}`
        }
      });

      // 更新用户积分
      await prisma.user.update({
        where: { id: req.userId },
        data: {
          pointsBalance: {
            increment: 50
          }
        }
      });
    }

    res.status(201).json({
      success: true,
      message: status === 'published' ? '方案发布成功，获得50积分' : '方案保存成功',
      solution
    });

  } catch (error) {
    console.error('[创建方案失败]', error);
    console.error('[错误堆栈]', error.stack);
    res.status(500).json({
      success: false,
      message: '创建方案失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 获取方案列表
 * GET /api/solutions
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt', // createdAt | avgRating | viewCount | referenceCount
      order = 'desc',
      status = 'published',
      authorId,
      taskId,
      tag,
      search
    } = req.query;

    // 构建查询条件
    const where = { status };

    if (authorId) where.authorId = authorId;
    if (taskId) where.taskId = taskId;
    if (tag) {
      where.OR = [
        { autoTags: { array_contains: tag } },
        { manualTags: { array_contains: tag } }
      ];
    }
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { problemDefinition: { contains: search } },
        { solutionContent: { contains: search } }
      ];
    }

    // 构建排序
    const orderBy = {};
    orderBy[sortBy] = order;

    // 查询
    const [total, solutions] = await Promise.all([
      prisma.solution.count({ where }),
      prisma.solution.findMany({
        where,
        orderBy,
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        include: {
          author: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              serialNumber: true
            }
          },
          task: {
            select: {
              id: true,
              title: true
            }
          },
          _count: {
            select: {
              ratings: true,
              referencedBy: true
            }
          }
        }
      })
    ]);

    res.json({
      success: true,
      solutions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('[获取方案列表失败]', error);
    res.status(500).json({
      success: false,
      message: '获取方案列表失败'
    });
  }
});

/**
 * 获取方案详情
 * GET /api/solutions/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const solution = await prisma.solution.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            serialNumber: true,
            pwpProfile: true
          }
        },
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true
          }
        },
        ratings: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        referencedBy: {
          include: {
            referencingSolution: {
              include: {
                author: {
                  select: {
                    id: true,
                    username: true
                  }
                }
              }
            }
          }
        },
        references: {
          include: {
            referencedSolution: {
              include: {
                author: {
                  select: {
                    id: true,
                    username: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!solution) {
      return res.status(404).json({
        success: false,
        message: '方案不存在'
      });
    }

    // 增加浏览量（非作者）
    if (solution.authorId !== req.userId) {
      await prisma.solution.update({
        where: { id },
        data: {
          viewCount: {
            increment: 1
          }
        }
      });
    }

    res.json({
      success: true,
      solution
    });

  } catch (error) {
    console.error('[获取方案详情失败]', error);
    res.status(500).json({
      success: false,
      message: '获取方案详情失败'
    });
  }
});

/**
 * 更新方案
 * PUT /api/solutions/:id
 */
router.put('/:id', authenticateToken, requireMember, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      problemDefinition,
      solutionContent,
      codeSnippet,
      attachments,
      manualTags,
      difficultyLevel,
      status
    } = req.body;

    // 检查权限
    const existing = await prisma.solution.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: '方案不存在'
      });
    }

    if (existing.authorId !== req.userId) {
      return res.status(403).json({
        success: false,
        message: '只能修改自己的方案'
      });
    }

    // 更新
    const solution = await prisma.solution.update({
      where: { id },
      data: {
        title,
        problemDefinition,
        solutionContent,
        codeSnippet,
        attachments,
        manualTags,
        difficultyLevel,
        status
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatarUrl: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: '方案更新成功',
      solution
    });

  } catch (error) {
    console.error('[更新方案失败]', error);
    res.status(500).json({
      success: false,
      message: '更新方案失败'
    });
  }
});

/**
 * 删除方案
 * DELETE /api/solutions/:id
 */
router.delete('/:id', authenticateToken, requireMember, async (req, res) => {
  try {
    const { id } = req.params;

    // 检查权限
    const existing = await prisma.solution.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: '方案不存在'
      });
    }

    if (existing.authorId !== req.userId) {
      return res.status(403).json({
        success: false,
        message: '只能删除自己的方案'
      });
    }

    await prisma.solution.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: '方案已删除'
    });

  } catch (error) {
    console.error('[删除方案失败]', error);
    res.status(500).json({
      success: false,
      message: '删除方案失败'
    });
  }
});

// ========================================
// 评分系统
// ========================================

/**
 * 提交评分
 * POST /api/solutions/:id/rate
 */
router.post('/:id/rate', authenticateToken, requireMember, async (req, res) => {
  try {
    const { id } = req.params;
    const { qualityRating, reusabilityRating, innovationRating, comment } = req.body;

    // 验证评分范围
    if (
      qualityRating < 1 || qualityRating > 10 ||
      reusabilityRating < 1 || reusabilityRating > 10 ||
      innovationRating < 1 || innovationRating > 10
    ) {
      return res.status(400).json({
        success: false,
        message: '评分必须在1-10之间'
      });
    }

    // 检查方案是否存在
    const solution = await prisma.solution.findUnique({
      where: { id }
    });

    if (!solution) {
      return res.status(404).json({
        success: false,
        message: '方案不存在'
      });
    }

    // 不能给自己的方案评分
    if (solution.authorId === req.userId) {
      return res.status(403).json({
        success: false,
        message: '不能给自己的方案评分'
      });
    }

    // 计算综合评分
    const overallRating = ((qualityRating + reusabilityRating + innovationRating) / 3).toFixed(2);

    // 创建或更新评分
    const rating = await prisma.solutionRating.upsert({
      where: {
        solutionId_userId: {
          solutionId: id,
          userId: req.userId
        }
      },
      create: {
        solutionId: id,
        userId: req.userId,
        qualityRating,
        reusabilityRating,
        innovationRating,
        overallRating: parseFloat(overallRating),
        comment
      },
      update: {
        qualityRating,
        reusabilityRating,
        innovationRating,
        overallRating: parseFloat(overallRating),
        comment
      }
    });

    // 重新计算方案的平均评分
    const ratings = await prisma.solutionRating.findMany({
      where: { solutionId: id }
    });

    const avgQuality = ratings.reduce((sum, r) => sum + r.qualityRating, 0) / ratings.length;
    const avgReusability = ratings.reduce((sum, r) => sum + r.reusabilityRating, 0) / ratings.length;
    const avgInnovation = ratings.reduce((sum, r) => sum + r.innovationRating, 0) / ratings.length;
    const avgOverall = ratings.reduce((sum, r) => sum + parseFloat(r.overallRating), 0) / ratings.length;

    await prisma.solution.update({
      where: { id },
      data: {
        qualityScore: avgQuality.toFixed(2),
        reusabilityScore: avgReusability.toFixed(2),
        innovationScore: avgInnovation.toFixed(2),
        avgRating: avgOverall.toFixed(2),
        ratingCount: ratings.length
      }
    });

    // 奖励评分者积分
    await prisma.pointsTransaction.create({
      data: {
        userId: req.userId,
        amount: 5,
        transactionType: 'solution_rated',
        relatedEntityType: 'solution',
        relatedEntityId: id,
        description: '评分方案'
      }
    });

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        pointsBalance: {
          increment: 5
        }
      }
    });

    // 方案作者获得积分（首次评分）
    if (ratings.length === 1) {
      await prisma.pointsTransaction.create({
        data: {
          userId: solution.authorId,
          amount: 10,
          transactionType: 'solution_first_rating',
          relatedEntityType: 'solution',
          relatedEntityId: id,
          description: '方案获得首次评分'
        }
      });

      await prisma.user.update({
        where: { id: solution.authorId },
        data: {
          pointsBalance: {
            increment: 10
          }
        }
      });
    }

    res.json({
      success: true,
      message: '评分成功，获得5积分',
      rating
    });

  } catch (error) {
    console.error('[提交评分失败]', error);
    res.status(500).json({
      success: false,
      message: '提交评分失败'
    });
  }
});

/**
 * 获取方案的所有评分
 * GET /api/solutions/:id/ratings
 */
router.get('/:id/ratings', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const ratings = await prisma.solutionRating.findMany({
      where: { solutionId: id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            serialNumber: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      ratings
    });

  } catch (error) {
    console.error('[获取评分失败]', error);
    res.status(500).json({
      success: false,
      message: '获取评分失败'
    });
  }
});

// ========================================
// 引用系统
// ========================================

/**
 * 引用方案
 * POST /api/solutions/:id/cite
 */
router.post('/:id/cite', authenticateToken, requireMember, async (req, res) => {
  try {
    const { id } = req.params; // 被引用的方案ID
    const { referencingSolutionId, citationType, description } = req.body;

    // 验证引用类型
    if (!['full', 'partial', 'inspired'].includes(citationType)) {
      return res.status(400).json({
        success: false,
        message: '引用类型必须是 full、partial 或 inspired'
      });
    }

    // 检查两个方案是否存在
    const [referencedSolution, referencingSolution] = await Promise.all([
      prisma.solution.findUnique({ where: { id } }),
      prisma.solution.findUnique({ where: { id: referencingSolutionId } })
    ]);

    if (!referencedSolution || !referencingSolution) {
      return res.status(404).json({
        success: false,
        message: '方案不存在'
      });
    }

    // 检查引用方案的作者是否是当前用户
    if (referencingSolution.authorId !== req.userId) {
      return res.status(403).json({
        success: false,
        message: '只能在自己的方案中添加引用'
      });
    }

    // 不能引用自己的方案
    if (referencedSolution.authorId === req.userId) {
      return res.status(400).json({
        success: false,
        message: '不能引用自己的方案'
      });
    }

    // 创建引用关系
    const reference = await prisma.solutionReference.create({
      data: {
        referencingSolutionId,
        referencedSolutionId: id,
        citationType,
        description
      }
    });

    // 更新被引用方案的引用计数
    await prisma.solution.update({
      where: { id },
      data: {
        referenceCount: {
          increment: 1
        }
      }
    });

    // 奖励被引用方案的作者积分
    const points = citationType === 'full' ? 30 : citationType === 'partial' ? 20 : 10;

    await prisma.pointsTransaction.create({
      data: {
        userId: referencedSolution.authorId,
        amount: points,
        transactionType: 'solution_cited',
        relatedEntityType: 'solution',
        relatedEntityId: id,
        description: `方案被引用（${citationType}）`
      }
    });

    await prisma.user.update({
      where: { id: referencedSolution.authorId },
      data: {
        pointsBalance: {
          increment: points
        }
      }
    });

    res.json({
      success: true,
      message: '引用成功',
      reference
    });

  } catch (error) {
    console.error('[引用方案失败]', error);
    res.status(500).json({
      success: false,
      message: '引用方案失败'
    });
  }
});

/**
 * 获取高分方案榜单
 * GET /api/solutions/top-rated
 */
router.get('/rankings/top-rated', authenticateToken, async (req, res) => {
  try {
    const { limit = 10, timeRange = 'all' } = req.query;

    // 构建时间范围条件
    const where = { status: 'published', ratingCount: { gte: 3 } };

    if (timeRange === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      where.createdAt = { gte: weekAgo };
    } else if (timeRange === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      where.createdAt = { gte: monthAgo };
    }

    const solutions = await prisma.solution.findMany({
      where,
      orderBy: [
        { avgRating: 'desc' },
        { ratingCount: 'desc' }
      ],
      take: parseInt(limit),
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            serialNumber: true
          }
        },
        _count: {
          select: {
            ratings: true,
            referencedBy: true
          }
        }
      }
    });

    res.json({
      success: true,
      solutions
    });

  } catch (error) {
    console.error('[获取高分榜失败]', error);
    res.status(500).json({
      success: false,
      message: '获取高分榜失败'
    });
  }
});

/**
 * 获取作者贡献榜
 * GET /api/solutions/rankings/contributors
 */
router.get('/rankings/contributors', authenticateToken, async (req, res) => {
  try {
    const { limit = 10, timeRange = 'month' } = req.query;

    // 构建时间范围
    let startDate = new Date();
    if (timeRange === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (timeRange === 'year') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else {
      startDate = new Date(0); // all time
    }

    // 统计作者的方案数据
    const contributors = await prisma.solution.groupBy({
      by: ['authorId'],
      where: {
        status: 'published',
        createdAt: { gte: startDate }
      },
      _count: {
        id: true
      },
      _avg: {
        avgRating: true
      },
      _sum: {
        referenceCount: true,
        viewCount: true
      },
      orderBy: {
        _sum: {
          referenceCount: 'desc'
        }
      },
      take: parseInt(limit)
    });

    // 获取作者信息
    const contributorsWithUser = await Promise.all(
      contributors.map(async (c) => {
        const user = await prisma.user.findUnique({
          where: { id: c.authorId },
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            serialNumber: true
          }
        });

        return {
          user,
          solutionCount: c._count.id,
          avgRating: c._avg.avgRating ? parseFloat(c._avg.avgRating).toFixed(2) : '0.00',
          totalReferences: c._sum.referenceCount || 0,
          totalViews: c._sum.viewCount || 0
        };
      })
    );

    res.json({
      success: true,
      contributors: contributorsWithUser
    });

  } catch (error) {
    console.error('[获取贡献榜失败]', error);
    res.status(500).json({
      success: false,
      message: '获取贡献榜失败'
    });
  }
});

module.exports = router;
