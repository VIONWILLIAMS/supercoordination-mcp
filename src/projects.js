// 项目制团队管理 - API模块
// 实现：项目CRUD、团队管理、权限控制

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ========================================
// 权限中间件
// ========================================

/**
 * 验证用户是否为项目成员
 */
async function requireProjectMember(req, res, next) {
  try {
    const { projectId } = req.params;
    const userId = req.userId;

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      }
    });

    if (!membership || membership.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: '您不是该项目的成员'
      });
    }

    req.projectMembership = membership;
    next();
  } catch (error) {
    console.error('项目成员验证失败:', error);
    res.status(500).json({
      success: false,
      message: '权限验证失败'
    });
  }
}

/**
 * 验证用户是否为项目管理员（admin或owner）
 */
async function requireProjectAdmin(req, res, next) {
  try {
    const membership = req.projectMembership;

    if (!membership || !['admin', 'owner'].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        message: '需要项目管理员权限'
      });
    }

    next();
  } catch (error) {
    console.error('项目管理员验证失败:', error);
    res.status(500).json({
      success: false,
      message: '权限验证失败'
    });
  }
}

/**
 * 验证用户是否为项目所有者
 */
async function requireProjectOwner(req, res, next) {
  try {
    const membership = req.projectMembership;

    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: '需要项目所有者权限'
      });
    }

    next();
  } catch (error) {
    console.error('项目所有者验证失败:', error);
    res.status(500).json({
      success: false,
      message: '权限验证失败'
    });
  }
}

// ========================================
// 项目CRUD
// ========================================

/**
 * 创建项目
 * POST /api/projects
 */
async function createProject(req, res) {
  try {
    const userId = req.userId;
    const {
      name,
      description,
      strategicGoal,
      wuxingType,
      expectedEndDate,
      pointsBudget,
      initialMembers = []
    } = req.body;

    // 验证必填字段
    if (!name) {
      return res.status(400).json({
        success: false,
        message: '项目名称不能为空'
      });
    }

    // 消耗积分（50积分）
    const CREATION_COST = 50;
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (user.pointsBalance < CREATION_COST) {
      return res.status(400).json({
        success: false,
        message: `积分不足，创建项目需要${CREATION_COST}积分`
      });
    }

    // 使用事务创建项目
    const result = await prisma.$transaction(async (tx) => {
      // 1. 创建项目
      const project = await tx.project.create({
        data: {
          name,
          description,
          strategicGoal,
          wuxingType,
          expectedEndDate: expectedEndDate ? new Date(expectedEndDate) : null,
          pointsBudget: pointsBudget || 0,
          ownerId: userId
        }
      });

      // 2. 创建者自动成为owner
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: userId,
          role: 'owner'
        }
      });

      // 3. 添加初始成员（如果有）
      if (initialMembers.length > 0) {
        await tx.projectMember.createMany({
          data: initialMembers.map(memberId => ({
            projectId: project.id,
            userId: memberId,
            role: 'core_member'
          })),
          skipDuplicates: true
        });
      }

      // 4. 扣除积分
      await tx.user.update({
        where: { id: userId },
        data: {
          pointsBalance: {
            decrement: CREATION_COST
          }
        }
      });

      // 5. 记录积分交易
      await tx.pointsTransaction.create({
        data: {
          userId,
          amount: -CREATION_COST,
          transactionType: 'project_creation',
          relatedEntityType: 'project',
          relatedEntityId: project.id,
          description: `创建项目「${name}」`
        }
      });

      return project;
    });

    // 返回完整项目信息
    const project = await prisma.project.findUnique({
      where: { id: result.id },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            serialNumber: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                serialNumber: true
              }
            }
          }
        },
        _count: {
          select: {
            tasks: true,
            members: true
          }
        }
      }
    });

    res.json({
      success: true,
      project,
      message: `项目创建成功，消耗${CREATION_COST}积分`
    });

  } catch (error) {
    console.error('创建项目失败:', error);
    res.status(500).json({
      success: false,
      message: '创建项目失败'
    });
  }
}

/**
 * 获取项目列表
 * GET /api/projects
 */
async function getProjects(req, res) {
  try {
    const userId = req.userId;
    const {
      status,
      myProjects, // 只看我参与的项目
      page = 1,
      limit = 20
    } = req.query;

    const skip = (page - 1) * limit;

    // 构建查询条件
    const where = {};
    if (status) {
      where.status = status;
    }
    if (myProjects === 'true') {
      where.members = {
        some: {
          userId,
          status: 'active'
        }
      };
    }

    // 查询项目
    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              serialNumber: true
            }
          },
          _count: {
            select: {
              tasks: true,
              members: true
            }
          },
          members: {
            where: {
              userId
            },
            select: {
              role: true,
              status: true
            }
          }
        }
      }),
      prisma.project.count({ where })
    ]);

    res.json({
      success: true,
      projects,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('获取项目列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目列表失败'
    });
  }
}

/**
 * 获取项目详情
 * GET /api/projects/:id
 */
async function getProjectById(req, res) {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            serialNumber: true,
            pwpProfile: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                serialNumber: true,
                pwpProfile: true
              }
            }
          },
          orderBy: {
            joinedAt: 'asc'
          }
        },
        tasks: {
          include: {
            assignedUser: {
              select: {
                id: true,
                username: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        _count: {
          select: {
            tasks: true,
            members: true
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: '项目不存在'
      });
    }

    res.json({
      success: true,
      project
    });

  } catch (error) {
    console.error('获取项目详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目详情失败'
    });
  }
}

/**
 * 更新项目
 * PUT /api/projects/:id
 */
async function updateProject(req, res) {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      strategicGoal,
      wuxingType,
      status,
      progress,
      expectedEndDate
    } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (strategicGoal !== undefined) updateData.strategicGoal = strategicGoal;
    if (wuxingType !== undefined) updateData.wuxingType = wuxingType;
    if (status !== undefined) updateData.status = status;
    if (progress !== undefined) updateData.progress = progress;
    if (expectedEndDate !== undefined) {
      updateData.expectedEndDate = expectedEndDate ? new Date(expectedEndDate) : null;
    }

    // 如果状态变更为completed，记录完成时间
    if (status === 'completed') {
      updateData.actualEndDate = new Date();
    }

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            username: true
          }
        },
        _count: {
          select: {
            tasks: true,
            members: true
          }
        }
      }
    });

    res.json({
      success: true,
      project,
      message: '项目更新成功'
    });

  } catch (error) {
    console.error('更新项目失败:', error);
    res.status(500).json({
      success: false,
      message: '更新项目失败'
    });
  }
}

/**
 * 删除/归档项目
 * DELETE /api/projects/:id
 */
async function deleteProject(req, res) {
  try {
    const { id } = req.params;

    // 归档而不是真删除
    const project = await prisma.project.update({
      where: { id },
      data: {
        status: 'archived'
      }
    });

    res.json({
      success: true,
      message: '项目已归档'
    });

  } catch (error) {
    console.error('归档项目失败:', error);
    res.status(500).json({
      success: false,
      message: '归档项目失败'
    });
  }
}

// ========================================
// 团队管理
// ========================================

/**
 * 邀请成员加入项目
 * POST /api/projects/:projectId/invite
 */
async function inviteMember(req, res) {
  try {
    const { projectId } = req.params;
    const { userId, role = 'collaborator' } = req.body;

    // 检查用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 检查是否已经是成员
    const existing = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: '该用户已是项目成员'
      });
    }

    // 创建成员关系
    const membership = await prisma.projectMember.create({
      data: {
        projectId,
        userId,
        role
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            serialNumber: true
          }
        }
      }
    });

    res.json({
      success: true,
      membership,
      message: `已邀请${user.username}加入项目`
    });

  } catch (error) {
    console.error('邀请成员失败:', error);
    res.status(500).json({
      success: false,
      message: '邀请成员失败'
    });
  }
}

/**
 * 获取项目成员列表
 * GET /api/projects/:projectId/members
 */
async function getProjectMembers(req, res) {
  try {
    const { projectId } = req.params;

    const members = await prisma.projectMember.findMany({
      where: {
        projectId,
        status: 'active'
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            serialNumber: true,
            pwpProfile: true
          }
        }
      },
      orderBy: [
        { role: 'asc' },
        { joinedAt: 'asc' }
      ]
    });

    res.json({
      success: true,
      members
    });

  } catch (error) {
    console.error('获取项目成员失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目成员失败'
    });
  }
}

/**
 * 调整成员角色
 * PUT /api/projects/:projectId/members/:userId/role
 */
async function updateMemberRole(req, res) {
  try {
    const { projectId, userId } = req.params;
    const { role } = req.body;

    // 验证角色
    const validRoles = ['admin', 'core_member', 'collaborator', 'observer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: '无效的角色'
      });
    }

    // 不能修改owner的角色
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      }
    });

    if (membership.role === 'owner') {
      return res.status(400).json({
        success: false,
        message: '不能修改项目所有者的角色'
      });
    }

    // 更新角色
    const updated = await prisma.projectMember.update({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });

    res.json({
      success: true,
      membership: updated,
      message: '角色更新成功'
    });

  } catch (error) {
    console.error('更新成员角色失败:', error);
    res.status(500).json({
      success: false,
      message: '更新成员角色失败'
    });
  }
}

/**
 * 移除成员
 * DELETE /api/projects/:projectId/members/:userId
 */
async function removeMember(req, res) {
  try {
    const { projectId, userId } = req.params;

    // 不能移除owner
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      }
    });

    if (membership.role === 'owner') {
      return res.status(400).json({
        success: false,
        message: '不能移除项目所有者'
      });
    }

    // 标记为离开而不是删除
    await prisma.projectMember.update({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      },
      data: {
        status: 'left',
        leftAt: new Date()
      }
    });

    res.json({
      success: true,
      message: '成员已移除'
    });

  } catch (error) {
    console.error('移除成员失败:', error);
    res.status(500).json({
      success: false,
      message: '移除成员失败'
    });
  }
}

// ========================================
// 项目任务管理
// ========================================

/**
 * 获取项目任务列表
 * GET /api/projects/:projectId/tasks
 */
async function getProjectTasks(req, res) {
  try {
    const { projectId } = req.params;
    const { status } = req.query;

    const where = {
      projectId,
      taskType: 'project_task'
    };

    if (status) {
      where.status = status;
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignedUser: {
          select: {
            id: true,
            username: true,
            serialNumber: true
          }
        },
        creator: {
          select: {
            id: true,
            username: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      tasks
    });

  } catch (error) {
    console.error('获取项目任务失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目任务失败'
    });
  }
}

/**
 * 创建项目任务
 * POST /api/projects/:projectId/tasks
 */
async function createProjectTask(req, res) {
  try {
    const { projectId } = req.params;
    const userId = req.userId;
    const {
      title,
      description,
      requiredSkills,
      requiredWuxing,
      assignedTo,
      priority,
      rewardPoints,
      estimatedHours
    } = req.body;

    // 创建任务
    const task = await prisma.task.create({
      data: {
        title,
        description,
        requiredSkills: requiredSkills || [],
        requiredWuxing: requiredWuxing || {},
        assignedTo,
        createdBy: userId,
        projectId,
        taskType: 'project_task',
        priority: priority || 'medium',
        rewardPoints: rewardPoints || 20,
        estimatedHours
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            username: true
          }
        },
        creator: {
          select: {
            id: true,
            username: true
          }
        },
        project: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.json({
      success: true,
      task,
      message: '项目任务创建成功'
    });

  } catch (error) {
    console.error('创建项目任务失败:', error);
    res.status(500).json({
      success: false,
      message: '创建项目任务失败'
    });
  }
}

// ========================================
// 统计分析
// ========================================

/**
 * 获取项目统计数据
 * GET /api/projects/:projectId/stats
 */
async function getProjectStats(req, res) {
  try {
    const { projectId } = req.params;

    // 任务统计
    const [
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      totalMembers,
      activeMembers
    ] = await Promise.all([
      prisma.task.count({ where: { projectId } }),
      prisma.task.count({ where: { projectId, status: 'completed' } }),
      prisma.task.count({ where: { projectId, status: 'in_progress' } }),
      prisma.task.count({ where: { projectId, status: 'pending' } }),
      prisma.projectMember.count({ where: { projectId } }),
      prisma.projectMember.count({ where: { projectId, status: 'active' } })
    ]);

    const completionRate = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;

    res.json({
      success: true,
      stats: {
        tasks: {
          total: totalTasks,
          completed: completedTasks,
          inProgress: inProgressTasks,
          pending: pendingTasks,
          completionRate
        },
        members: {
          total: totalMembers,
          active: activeMembers
        }
      }
    });

  } catch (error) {
    console.error('获取项目统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目统计失败'
    });
  }
}

/**
 * 获取成员贡献排行
 * GET /api/projects/:projectId/leaderboard
 */
async function getProjectLeaderboard(req, res) {
  try {
    const { projectId } = req.params;

    const members = await prisma.projectMember.findMany({
      where: {
        projectId,
        status: 'active'
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            serialNumber: true
          }
        }
      },
      orderBy: {
        pointsEarned: 'desc'
      }
    });

    res.json({
      success: true,
      leaderboard: members
    });

  } catch (error) {
    console.error('获取贡献排行失败:', error);
    res.status(500).json({
      success: false,
      message: '获取贡献排行失败'
    });
  }
}

// ========================================
// 智能推荐
// ========================================

/**
 * 获取项目成员推荐
 * GET /api/projects/:projectId/recommended-members
 */
async function getRecommendedMembers(req, res) {
  try {
    const { projectId } = req.params;
    const { limit = 10 } = req.query;

    // 获取项目信息
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          select: {
            userId: true
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: '项目不存在'
      });
    }

    // 获取已加入的成员ID列表
    const existingMemberIds = project.members.map(m => m.userId);

    // 获取所有正式成员（排除已加入的）
    const candidates = await prisma.user.findMany({
      where: {
        status: 'member',
        pwpCompleted: true,
        id: {
          notIn: existingMemberIds
        }
      },
      select: {
        id: true,
        username: true,
        serialNumber: true,
        pwpProfile: true
      }
    });

    // 计算匹配度
    const recommendations = candidates.map(candidate => {
      const score = calculateProjectMemberMatch(project, candidate);
      return {
        user: candidate,
        matchScore: score.total,
        wuxingMatch: score.wuxing,
        skillMatch: score.skill,
        reasons: score.reasons
      };
    });

    // 按匹配度排序并取Top N
    recommendations.sort((a, b) => b.matchScore - a.matchScore);
    const topRecommendations = recommendations.slice(0, parseInt(limit));

    res.json({
      success: true,
      recommendations: topRecommendations
    });

  } catch (error) {
    console.error('获取推荐成员失败:', error);
    res.status(500).json({
      success: false,
      message: '获取推荐成员失败'
    });
  }
}

/**
 * 计算项目成员匹配度
 * @param {Object} project - 项目对象
 * @param {Object} candidate - 候选成员对象
 * @returns {Object} 匹配分数和理由
 */
function calculateProjectMemberMatch(project, candidate) {
  let wuxingScore = 0;
  let skillScore = 0;
  const reasons = [];

  // 五行匹配（70%权重）
  if (project.wuxingType && candidate.pwpProfile?.wuxing) {
    const projectWuxing = project.wuxingType;
    const candidateWuxing = candidate.pwpProfile.wuxing;

    // 五行相生关系
    const shengRelations = {
      wood: 'fire',   // 木生火
      fire: 'earth',  // 火生土
      earth: 'metal', // 土生金
      metal: 'water', // 金生水
      water: 'wood'   // 水生木
    };

    // 找到候选人的主属性（最高分的五行）
    const candidateMainWuxing = Object.entries(candidateWuxing)
      .sort(([, a], [, b]) => b - a)[0]?.[0];

    // 相生关系：候选人的五行能生项目的五行
    if (shengRelations[candidateMainWuxing] === projectWuxing) {
      wuxingScore = 95;
      reasons.push(`五行相生：您的${getWuxingLabel(candidateMainWuxing)}能量强，可以生项目的${getWuxingLabel(projectWuxing)}`);
    }
    // 被生关系：项目的五行能生候选人的五行
    else if (shengRelations[projectWuxing] === candidateMainWuxing) {
      wuxingScore = 90;
      reasons.push(`五行相生：项目的${getWuxingLabel(projectWuxing)}能量可以生您的${getWuxingLabel(candidateMainWuxing)}`);
    }
    // 同属性：候选人和项目五行一致
    else if (candidateMainWuxing === projectWuxing) {
      wuxingScore = 85;
      reasons.push(`五行同属：您与项目都是${getWuxingLabel(projectWuxing)}属性`);
    }
    // 其他情况：根据候选人在项目五行上的分数
    else {
      const projectWuxingScore = candidateWuxing[projectWuxing] || 0;
      wuxingScore = Math.min(projectWuxingScore, 80);
      if (projectWuxingScore >= 60) {
        reasons.push(`您的${getWuxingLabel(projectWuxing)}能量为${projectWuxingScore}，与项目匹配`);
      }
    }
  }

  // 技能匹配（30%权重）
  // 这里简化处理，实际可以根据项目需求的技能进行匹配
  if (candidate.pwpProfile?.skills && candidate.pwpProfile.skills.length > 0) {
    skillScore = 70; // 基础分
    const skillCount = candidate.pwpProfile.skills.length;
    if (skillCount >= 5) {
      skillScore = 85;
      reasons.push(`技能丰富：掌握${skillCount}项技能`);
    } else if (skillCount >= 3) {
      skillScore = 75;
      reasons.push(`技能充足：掌握${skillCount}项技能`);
    }
  }

  // 综合评分
  const total = Math.round(wuxingScore * 0.7 + skillScore * 0.3);

  return {
    total,
    wuxing: wuxingScore,
    skill: skillScore,
    reasons
  };
}

/**
 * 获取五行标签
 */
function getWuxingLabel(wuxing) {
  const labels = {
    wood: '木',
    fire: '火',
    earth: '土',
    metal: '金',
    water: '水'
  };
  return labels[wuxing] || wuxing;
}

// ========================================
// 导出
// ========================================

module.exports = {
  // 权限中间件
  requireProjectMember,
  requireProjectAdmin,
  requireProjectOwner,

  // 项目CRUD
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,

  // 团队管理
  inviteMember,
  getProjectMembers,
  updateMemberRole,
  removeMember,

  // 项目任务
  getProjectTasks,
  createProjectTask,

  // 统计分析
  getProjectStats,
  getProjectLeaderboard,

  // 智能推荐
  getRecommendedMembers
};
