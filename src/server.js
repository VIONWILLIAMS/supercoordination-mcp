const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');

// Prisma客户端实例
const prisma = new PrismaClient();

// WebSocket服务
const { initializeWebSocket, getOnlineUsersCount, getOnlineUsers } = require('./websocket');

// 引入认证模块
const {
  register,
  login,
  getCurrentUser,
  registerValidation,
  loginValidation,
  authenticateToken,
  optionalAuth
} = require('./auth');

// 引入AI守门人模块
const {
  issueTicket,
  redeemTicket,
  evaluateCandidate,
  evaluateAllCandidates,
  acceptAIInvitation,
  adminApproveCandidate,
  adminRejectCandidate,
  getAllCandidates,
  requireMember,
  requireAdmin
} = require('./aiGatekeeper');

// 引入项目管理模块
const {
  requireProjectMember,
  requireProjectAdmin,
  requireProjectOwner,
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  inviteMember,
  getProjectMembers,
  updateMemberRole,
  removeMember,
  getProjectTasks,
  createProjectTask,
  getProjectStats,
  getProjectLeaderboard,
  getRecommendedMembers
} = require('./projects');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, '../data/store.json');

// ========================================
// 安全中间件
// ========================================

// 请求日志中间件
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.url;
  const ip = req.ip || req.connection.remoteAddress;

  console.log(`[${timestamp}] ${method} ${url} - ${ip}`);

  // 记录响应时间
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${timestamp}] ${method} ${url} - ${res.statusCode} (${duration}ms)`);
  });

  next();
});

// 通用限流器（所有API）
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 限制100个请求
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 认证API限流器（防暴力破解）
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5分钟
  max: 100, // 限制100次登录尝试
  skipSuccessfulRequests: true,
  message: { success: false, message: '登录尝试过多，请稍后再试' },
});

// 应用限流
app.use('/api/', generalLimiter);

// 基础中间件
app.use(cors());
app.use(bodyParser.json());

// 统一错误处理中间件
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 静态文件服务（Web仪表盘）
app.use(express.static(path.join(__dirname, '../public')));

// ========================================
// 数据存储（JSON持久化 - 按用户隔离）
// ========================================

// 数据结构：userId -> Map(itemId -> item)
const store = {
  tasks: new Map(),     // Map<userId, Map<taskId, task>>
  members: new Map(),   // Map<userId, Map<memberId, member>>
  resources: new Map()  // Map<userId, Map<resourceId, resource>>
};

// 获取或创建用户的数据Map
function getUserStore(storeType, userId) {
  if (!store[storeType].has(userId)) {
    store[storeType].set(userId, new Map());
  }
  return store[storeType].get(userId);
}

// 保存数据到JSON文件（用户隔离版本）
function saveData() {
  try {
    const data = {
      tasks: Array.from(store.tasks.entries()).map(([userId, userTasks]) =>
        [userId, Array.from(userTasks.entries())]
      ),
      members: Array.from(store.members.entries()).map(([userId, userMembers]) =>
        [userId, Array.from(userMembers.entries())]
      ),
      resources: Array.from(store.resources.entries()).map(([userId, userResources]) =>
        [userId, Array.from(userResources.entries())]
      ),
      saved_at: new Date().toISOString()
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');

    let totalTasks = 0, totalMembers = 0;
    store.tasks.forEach(userTasks => totalTasks += userTasks.size);
    store.members.forEach(userMembers => totalMembers += userMembers.size);

    console.log('[数据持久化] 已保存:', totalTasks, '个任务,', totalMembers, '个成员,', store.tasks.size, '个用户');
  } catch (error) {
    console.error('[数据持久化] 保存失败:', error.message);
  }
}

// 从JSON文件加载数据（用户隔离版本）
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

      // 检查数据格式，兼容旧格式
      if (data.tasks && Array.isArray(data.tasks) && data.tasks.length > 0) {
        // 检查是否是新格式（用户隔离）
        if (Array.isArray(data.tasks[0]) && data.tasks[0].length === 2 && typeof data.tasks[0][0] === 'string') {
          // 新格式：[[userId, [[taskId, task]]]]
          store.tasks = new Map(data.tasks.map(([userId, userTasks]) =>
            [userId, new Map(userTasks)]
          ));
          store.members = new Map(data.members.map(([userId, userMembers]) =>
            [userId, new Map(userMembers)]
          ));
          store.resources = new Map(data.resources.map(([userId, userResources]) =>
            [userId, new Map(userResources)]
          ));
        } else {
          // 旧格式：[[taskId, task]] - 迁移到默认用户
          console.log('[数据持久化] 检测到旧格式数据，迁移到用户隔离模式');
          const defaultUserId = 'legacy-user';
          store.tasks.set(defaultUserId, new Map(data.tasks));
          store.members.set(defaultUserId, new Map(data.members));
          store.resources.set(defaultUserId, new Map(data.resources || []));
        }
      }

      let totalTasks = 0, totalMembers = 0;
      store.tasks.forEach(userTasks => totalTasks += userTasks.size);
      store.members.forEach(userMembers => totalMembers += userMembers.size);

      console.log('[数据持久化] 已加载:', totalTasks, '个任务,', totalMembers, '个成员,', store.tasks.size, '个用户');
      console.log('[数据持久化] 上次保存时间:', data.saved_at);
      return true;
    } else {
      console.log('[数据持久化] 未找到数据文件，使用空存储');
      return false;
    }
  } catch (error) {
    console.error('[数据持久化] 加载失败:', error.message);
    return false;
  }
}

// ========================================
// 用户认证API
// ========================================

// 注册（带限流）
app.post('/api/auth/register', authLimiter, registerValidation, register);

// 登录（带限流）
app.post('/api/auth/login', authLimiter, loginValidation, login);

// 获取当前用户信息（需要认证）
app.get('/api/auth/me', authenticateToken, getCurrentUser);

// ========================================
// 方案评分与引用系统 API
// ========================================

const solutionsRouter = require('./solutions');
app.use('/api/solutions', solutionsRouter);

// ========================================
// 项目制团队管理 API
// ========================================

// 项目CRUD
app.post('/api/projects', authenticateToken, requireMember, createProject);
app.get('/api/projects', authenticateToken, requireMember, getProjects);
app.get('/api/projects/:id', authenticateToken, requireMember, getProjectById);
app.put('/api/projects/:id', authenticateToken, requireMember, requireProjectMember, requireProjectAdmin, updateProject);
app.delete('/api/projects/:id', authenticateToken, requireMember, requireProjectMember, requireProjectOwner, deleteProject);

// 团队管理
app.post('/api/projects/:projectId/invite', authenticateToken, requireMember, requireProjectMember, requireProjectAdmin, inviteMember);
app.get('/api/projects/:projectId/members', authenticateToken, requireMember, requireProjectMember, getProjectMembers);
app.put('/api/projects/:projectId/members/:userId/role', authenticateToken, requireMember, requireProjectMember, requireProjectAdmin, updateMemberRole);
app.delete('/api/projects/:projectId/members/:userId', authenticateToken, requireMember, requireProjectMember, requireProjectAdmin, removeMember);

// 项目任务
app.get('/api/projects/:projectId/tasks', authenticateToken, requireMember, requireProjectMember, getProjectTasks);
app.post('/api/projects/:projectId/tasks', authenticateToken, requireMember, requireProjectMember, createProjectTask);

// 统计分析
app.get('/api/projects/:projectId/stats', authenticateToken, requireMember, requireProjectMember, getProjectStats);
app.get('/api/projects/:projectId/leaderboard', authenticateToken, requireMember, requireProjectMember, getProjectLeaderboard);

// 智能推荐
app.get('/api/projects/:projectId/recommended-members', authenticateToken, requireMember, requireProjectMember, getRecommendedMembers);

// ========================================
// PWP决策交流API（短邮系统）
// ========================================

const pwpRouter = require('./pwp');
app.use('/api/pwp', pwpRouter);

// ========================================
// 用户画像API
// ========================================

// 更新PWP五行画像
app.post('/api/profile/update', authenticateToken, async (req, res) => {
  try {
    const { profile } = req.body;

    if (!profile || !profile.wuxing) {
      return res.status(400).json({
        success: false,
        message: '请提供完整的画像数据'
      });
    }

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // 更新用户画像
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        pwpProfile: profile,
        pwpCompleted: true
      }
    });

    res.json({
      success: true,
      message: '画像保存成功',
      profile: user.pwpProfile
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('保存画像失败:', error);
    res.status(500).json({
      success: false,
      message: '保存失败：' + error.message
    });
  }
});

// 获取积分交易历史
app.get('/api/points/history', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const limit = parseInt(req.query.limit) || 20;

    const transactions = await prisma.pointsTransaction.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { pointsBalance: true }
    });

    res.json({
      success: true,
      balance: user.pointsBalance,
      transactions
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('获取积分历史失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========================================
// AI守门人API
// ========================================

// 发放门票（正式成员才能发）
app.post('/api/ticket/issue', authenticateToken, async (req, res) => {
  try {
    const { recipientEmail } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({
        success: false,
        message: '请提供接收者邮箱'
      });
    }

    const ticket = await issueTicket(req.userId, recipientEmail);

    res.json({
      success: true,
      message: '门票发放成功',
      ticket: {
        token: ticket.token,
        recipientEmail: ticket.recipientEmail,
        expiresAt: ticket.expiresAt
      },
      ticketUrl: `${req.protocol}://${req.get('host')}/ticket/${ticket.token}`
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// 使用门票注册（创建候选者账号）
app.post('/api/ticket/redeem', async (req, res) => {
  try {
    const { token, email, password, username } = req.body;

    if (!token || !email || !password || !username) {
      return res.status(400).json({
        success: false,
        message: '请提供完整信息'
      });
    }

    // 调用auth模块的密码哈希功能
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await redeemTicket(token, {
      email,
      passwordHash,
      username
    });

    // 生成token
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    const authToken = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: '注册成功！你现在是候选者，等待AI评估。',
      token: authToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        status: user.status,
        pointsBalance: user.pointsBalance
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// 查看我的状态和AI评估进度
app.get('/api/my/status', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        status: true,
        serialNumber: true,
        aiScore: true,
        evaluatedAt: true,
        approvedAt: true,
        invitedAt: true,
        pwpProfile: true
      }
    });

    // 获取最新的AI评估
    let latestEvaluation = null;
    if (user.status === 'candidate') {
      latestEvaluation = await prisma.aIEvaluation.findFirst({
        where: { candidateId: req.userId },
        orderBy: { evaluatedAt: 'desc' }
      });
    }

    res.json({
      success: true,
      user,
      evaluation: latestEvaluation
    });

    await prisma.$disconnect();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// AI评估所有候选者（Cron Job或手动触发）
app.post('/api/ai/evaluate-candidates', async (req, res) => {
  try {
    // 这个接口可以设置为只允许内部调用，或者需要管理员权限
    const results = await evaluateAllCandidates();

    res.json({
      success: true,
      message: `已评估 ${results.length} 位候选者`,
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 接受AI邀请（候选者升级为正式成员）
app.post('/api/ai/accept-invitation', authenticateToken, async (req, res) => {
  try {
    const member = await acceptAIInvitation(req.userId);

    res.json({
      success: true,
      message: '🎉 欢迎正式加入超协体！',
      member: {
        id: member.id,
        email: member.email,
        username: member.username,
        status: member.status,
        serialNumber: member.serialNumber,
        pointsBalance: member.pointsBalance,
        approvedAt: member.approvedAt
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// ========================================
// 管理员API（仅管理员可访问）
// ========================================

// 获取所有候选者列表
app.get('/api/admin/candidates', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const candidates = await getAllCandidates();

    res.json({
      success: true,
      candidates,
      count: candidates.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 批准候选者
app.post('/api/admin/approve-candidate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { candidateId } = req.body;

    if (!candidateId) {
      return res.status(400).json({
        success: false,
        message: '请提供候选者ID'
      });
    }

    const member = await adminApproveCandidate(req.userId, candidateId);

    res.json({
      success: true,
      message: '候选者已批准',
      member: {
        id: member.id,
        username: member.username,
        email: member.email,
        serialNumber: member.serialNumber,
        status: member.status
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// 拒绝候选者
app.post('/api/admin/reject-candidate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { candidateId, reason } = req.body;

    if (!candidateId) {
      return res.status(400).json({
        success: false,
        message: '请提供候选者ID'
      });
    }

    const result = await adminRejectCandidate(req.userId, candidateId, reason);

    res.json({
      success: true,
      message: '候选者已拒绝',
      result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// ========================================
// MCP协议端点
// ========================================

// 0. MCP服务发现端点（根端点）
app.get('/mcp', optionalAuth, (req, res) => {
  res.json({
    name: "超协体协作中枢",
    version: "1.0.0",
    description: "人机协同任务分配与资源匹配系统",
    protocol_version: "1.0",
    capabilities: {
      tools: true,
      prompts: false,
      resources: false
    },
    endpoints: {
      manifest: "/mcp/manifest",
      tools: "/mcp/tools/call"
    }
  });
});

// 1. MCP清单
app.get('/mcp/manifest', (req, res) => {
  res.json({
    name: "超协体协作中枢",
    version: "1.0.0",
    description: "人机协同任务分配与资源匹配系统",
    tools: [
      {
        name: "register_member",
        description: "注册成员及其技能和五行画像",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "成员姓名" },
            skills: {
              type: "array",
              items: { type: "string" },
              description: "技能列表，如：['Python', 'AI开发', '系统架构']"
            },
            wuxing_profile: {
              type: "object",
              description: "五行画像（百分比）",
              properties: {
                火: { type: "number", minimum: 0, maximum: 100 },
                金: { type: "number", minimum: 0, maximum: 100 },
                木: { type: "number", minimum: 0, maximum: 100 },
                水: { type: "number", minimum: 0, maximum: 100 },
                土: { type: "number", minimum: 0, maximum: 100 }
              }
            }
          },
          required: ["name"]
        }
      },
      {
        name: "create_task",
        description: "创建新任务",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "任务标题" },
            description: { type: "string", description: "任务描述" },
            wuxing: {
              type: "string",
              enum: ["火", "金", "木", "水", "土"],
              description: "任务的五行属性"
            },
            priority: {
              type: "string",
              enum: ["S", "A", "B", "C"],
              description: "优先级"
            },
            skills_required: {
              type: "array",
              items: { type: "string" },
              description: "所需技能列表"
            }
          },
          required: ["title", "description"]
        }
      },
      {
        name: "find_best_match",
        description: "基于五行和技能找到最佳成员",
        inputSchema: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "任务ID" },
            strategy: {
              type: "string",
              enum: ["wuxing", "skill", "load", "hybrid"],
              description: "匹配策略：wuxing=五行，skill=技能，load=负载，hybrid=混合（推荐）"
            }
          },
          required: ["task_id"]
        }
      },
      {
        name: "assign_task",
        description: "分配任务给成员",
        inputSchema: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "任务ID" },
            member_id: {
              type: "string",
              description: "成员ID（可选，留空则自动匹配）"
            }
          },
          required: ["task_id"]
        }
      },
      {
        name: "get_my_tasks",
        description: "获取我的任务列表",
        inputSchema: {
          type: "object",
          properties: {
            member_id: { type: "string", description: "成员ID" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "all"],
              description: "任务状态过滤"
            }
          },
          required: ["member_id"]
        }
      },
      {
        name: "update_task_status",
        description: "更新任务状态和进度",
        inputSchema: {
          type: "object",
          properties: {
            task_id: { type: "string", description: "任务ID" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "blocked"],
              description: "任务状态"
            },
            progress: {
              type: "number",
              minimum: 0,
              maximum: 100,
              description: "完成进度百分比"
            },
            notes: { type: "string", description: "进度备注" }
          },
          required: ["task_id", "status"]
        }
      },
      {
        name: "get_team_dashboard",
        description: "获取团队协作仪表盘",
        inputSchema: {
          type: "object",
          properties: {
            view: {
              type: "string",
              enum: ["overview", "wuxing", "progress", "bottleneck"],
              description: "视图类型：overview=概览，wuxing=五行分布，progress=进度，bottleneck=瓶颈"
            }
          }
        }
      },
      {
        name: "check_wuxing_balance",
        description: "检查团队五行能量平衡",
        inputSchema: {
          type: "object",
          properties: {
            timeframe: {
              type: "string",
              enum: ["today", "week", "month"],
              description: "时间范围"
            }
          }
        }
      },
      {
        name: "list_all_members",
        description: "列出所有已注册成员",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "list_all_tasks",
        description: "列出所有任务",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "blocked", "all"],
              description: "任务状态过滤"
            }
          }
        }
      }
    ]
  });
});

// 2. MCP工具调用端点（需要认证）
app.post('/mcp/tools/call', authenticateToken, requireMember, async (req, res) => {
  const { name, arguments: args } = req.body;
  const userId = req.userId;  // 从token获取用户ID
  const userStatus = req.user.status;  // 从用户对象获取状态

  console.log('[MCP] Tool call:', name, 'by user:', userId, 'status:', userStatus);
  console.log('[MCP] Arguments:', args);

  try {
    let result;

    // 所有工具函数都传入userId进行数据隔离
    switch (name) {
      case 'register_member':
        result = await registerMember(args, userId);
        break;
      case 'create_task':
        result = await createTask(args, userId);
        break;
      case 'find_best_match':
        result = await findBestMatch(args, userId);
        break;
      case 'assign_task':
        result = await assignTask(args, userId);
        break;
      case 'get_my_tasks':
        result = await getMyTasks(args, userId);
        break;
      case 'update_task_status':
        result = await updateTaskStatus(args, userId);
        break;
      case 'get_team_dashboard':
        result = await getTeamDashboard(args, userId);
        break;
      case 'check_wuxing_balance':
        result = await checkWuxingBalance(args, userId);
        break;
      case 'list_all_members':
        result = await listAllMembers(args, userId);
        break;
      case 'list_all_tasks':
        result = await listAllTasks(args, userId);
        break;
      default:
        return res.status(404).json({
          error: `Unknown tool: ${name}`
        });
    }

    res.json({
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// ========================================
// 工具实现函数
// ========================================

async function registerMember(args, userId) {
  const memberId = uuidv4();
  const member = {
    id: memberId,
    name: args.name,
    skills: args.skills || [],
    wuxing_profile: args.wuxing_profile || {
      火: 20, 金: 20, 木: 20, 水: 20, 土: 20
    },
    status: 'active',
    created_at: new Date().toISOString(),
    user_id: userId  // 关联到用户
  };

  const userMembers = getUserStore('members', userId);
  userMembers.set(memberId, member);
  saveData();

  return {
    success: true,
    member_id: memberId,
    message: `✅ 成员 ${args.name} 注册成功！`,
    member: member
  };
}

async function createTask(args, userId) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // 检查用户积分
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pointsBalance: true }
    });

    const TASK_COST = 10; // 创建任务消耗10积分

    if (user.pointsBalance < TASK_COST) {
      await prisma.$disconnect();
      return {
        success: false,
        message: `❌ 积分不足！创建任务需要${TASK_COST}积分，当前余额${user.pointsBalance}积分`
      };
    }

    // 扣除积分
    await prisma.user.update({
      where: { id: userId },
      data: { pointsBalance: { decrement: TASK_COST } }
    });

    // 记录交易
    const taskId = uuidv4();
    await prisma.pointsTransaction.create({
      data: {
        userId,
        amount: -TASK_COST,
        transactionType: 'create_task',
        relatedEntityType: 'task',
        relatedEntityId: taskId,
        description: `创建任务：${args.title}`
      }
    });

    await prisma.$disconnect();

    // 创建任务
    const task = {
      id: taskId,
      title: args.title,
      description: args.description,
      wuxing: args.wuxing || null,
      priority: args.priority || 'B',
      skills_required: args.skills_required || [],
      status: 'pending',
      progress: 0,
      assigned_to: null,
      created_by: userId,  // 创建者
      reward_points: 20,   // 完成任务奖励积分
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const userTasks = getUserStore('tasks', userId);
    userTasks.set(taskId, task);
    saveData();

    return {
      success: true,
      task_id: taskId,
      message: `✅ 任务创建成功（消耗${TASK_COST}积分）：${args.title}`,
      task: task,
      points_spent: TASK_COST,
      remaining_balance: user.pointsBalance - TASK_COST
    };
  } catch (error) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$disconnect();
    throw error;
  }
}

async function findBestMatch(args, userId) {
  const userTasks = getUserStore('tasks', userId);
  const task = userTasks.get(args.task_id);
  if (!task) {
    throw new Error('❌ 任务不存在');
  }

  const strategy = args.strategy || 'hybrid';
  const userMembers = getUserStore('members', userId);
  const members = Array.from(userMembers.values());

  if (members.length === 0) {
    return {
      best_match: null,
      message: '⚠️ 暂无可用成员，请先注册成员'
    };
  }

  // 计算每个成员的匹配分数
  const scores = members.map(member => {
    let score = 0;
    const breakdown = {};

    // 1. 技能匹配分数（40%权重）
    if (strategy === 'skill' || strategy === 'hybrid') {
      const skillMatch = task.skills_required.filter(skill =>
        member.skills.includes(skill)
      ).length;
      const skillScore = task.skills_required.length > 0
        ? (skillMatch / task.skills_required.length) * 40
        : 20;
      score += skillScore;
      breakdown.skill_score = Math.round(skillScore);
      breakdown.skill_match = task.skills_required.filter(s => member.skills.includes(s));
    }

    // 2. 五行匹配分数（30%权重）
    if (strategy === 'wuxing' || strategy === 'hybrid') {
      if (task.wuxing && member.wuxing_profile && member.wuxing_profile[task.wuxing]) {
        const wuxingScore = member.wuxing_profile[task.wuxing] * 0.3;
        score += wuxingScore;
        breakdown.wuxing_score = Math.round(wuxingScore);
        breakdown.wuxing_strength = member.wuxing_profile[task.wuxing];
      } else {
        score += 15;
        breakdown.wuxing_score = 15;
      }
    }

    // 3. 负载分数（30%权重）
    if (strategy === 'load' || strategy === 'hybrid') {
      const memberTasks = Array.from(userTasks.values())
        .filter(t => t.assigned_to === member.id && t.status !== 'completed');
      const loadScore = Math.max(0, 30 - (memberTasks.length * 5));
      score += loadScore;
      breakdown.load_score = Math.round(loadScore);
      breakdown.current_load = memberTasks.length;
    }

    return {
      member_id: member.id,
      member_name: member.name,
      total_score: Math.round(score),
      breakdown: breakdown
    };
  });

  // 按分数排序
  scores.sort((a, b) => b.total_score - a.total_score);

  const bestMatch = scores[0];

  return {
    success: true,
    message: `🎯 找到最佳匹配：${bestMatch.member_name}（匹配度 ${bestMatch.total_score}分）`,
    best_match: bestMatch,
    all_candidates: scores,
    strategy_used: strategy,
    task_info: {
      title: task.title,
      wuxing: task.wuxing,
      skills_required: task.skills_required
    }
  };
}

async function assignTask(args, userId) {
  const userTasks = getUserStore('tasks', userId);
  const userMembers = getUserStore('members', userId);

  const task = userTasks.get(args.task_id);
  if (!task) {
    throw new Error('❌ 任务不存在');
  }

  let assignedMember;

  if (args.member_id) {
    // 手动指定成员
    assignedMember = userMembers.get(args.member_id);
    if (!assignedMember) {
      throw new Error('❌ 指定成员不存在');
    }
  } else {
    // 智能匹配最佳成员
    const match = await findBestMatch({ task_id: args.task_id, strategy: 'hybrid' }, userId);
    if (!match.best_match) {
      throw new Error('❌ 未找到合适的成员');
    }
    assignedMember = userMembers.get(match.best_match.member_id);
  }

  task.assigned_to = assignedMember.id;
  task.status = 'in_progress';
  task.updated_at = new Date().toISOString();
  saveData();

  return {
    success: true,
    message: `✅ 任务《${task.title}》已分配给 ${assignedMember.name}`,
    task: task,
    member: {
      id: assignedMember.id,
      name: assignedMember.name,
      skills: assignedMember.skills
    }
  };
}

async function getMyTasks(args, userId) {
  const userMembers = getUserStore('members', userId);
  const userTasks = getUserStore('tasks', userId);

  const member = userMembers.get(args.member_id);
  if (!member) {
    throw new Error('❌ 成员不存在');
  }

  const tasks = Array.from(userTasks.values())
    .filter(task => {
      if (task.assigned_to !== args.member_id) return false;
      if (args.status && args.status !== 'all' && task.status !== args.status) return false;
      return true;
    })
    .sort((a, b) => {
      const priorityOrder = { S: 4, A: 3, B: 2, C: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

  return {
    success: true,
    member_name: member.name,
    member_id: member.id,
    total_tasks: tasks.length,
    tasks: tasks,
    summary: {
      pending: tasks.filter(t => t.status === 'pending').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      blocked: tasks.filter(t => t.status === 'blocked').length
    }
  };
}

async function updateTaskStatus(args, userId) {
  const userTasks = getUserStore('tasks', userId);
  const userMembers = getUserStore('members', userId);

  const task = userTasks.get(args.task_id);
  if (!task) {
    throw new Error('❌ 任务不存在');
  }

  const oldStatus = task.status;
  task.status = args.status;

  if (args.progress !== undefined) {
    task.progress = args.progress;
  }
  if (args.notes) {
    task.notes = args.notes;
  }
  task.updated_at = new Date().toISOString();

  // 如果任务完成，发放积分奖励
  let pointsAwarded = 0;
  if (args.status === 'completed' && oldStatus !== 'completed' && task.assigned_to) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    try {
      const REWARD_POINTS = task.reward_points || 20;

      // 给执行者发放积分
      await prisma.user.update({
        where: { id: userId },
        data: { pointsBalance: { increment: REWARD_POINTS } }
      });

      // 记录交易
      await prisma.pointsTransaction.create({
        data: {
          userId,
          amount: REWARD_POINTS,
          transactionType: 'complete_task',
          relatedEntityType: 'task',
          relatedEntityId: task.id,
          description: `完成任务：${task.title}`
        }
      });

      pointsAwarded = REWARD_POINTS;
      await prisma.$disconnect();
    } catch (error) {
      await prisma.$disconnect();
      console.error('积分发放失败:', error);
    }
  }

  saveData();

  return {
    success: true,
    message: `✅ 任务《${task.title}》状态已更新：${oldStatus} → ${args.status}${pointsAwarded > 0 ? `\n🎁 获得奖励：${pointsAwarded}积分` : ''}`,
    task: task,
    assigned_to: task.assigned_to ? userMembers.get(task.assigned_to)?.name : '未分配',
    points_awarded: pointsAwarded
  };
}

async function getTeamDashboard(args, userId) {
  const userTasks = getUserStore('tasks', userId);
  const userMembers = getUserStore('members', userId);

  const view = args.view || 'overview';
  const tasks = Array.from(userTasks.values());
  const members = Array.from(userMembers.values());

  const dashboard = {
    view: view,
    generated_at: new Date().toISOString(),
    team_size: members.length,
    total_tasks: tasks.length
  };

  switch (view) {
    case 'overview':
      dashboard.stats = {
        total_members: members.length,
        total_tasks: tasks.length,
        tasks_by_status: {
          pending: tasks.filter(t => t.status === 'pending').length,
          in_progress: tasks.filter(t => t.status === 'in_progress').length,
          completed: tasks.filter(t => t.status === 'completed').length,
          blocked: tasks.filter(t => t.status === 'blocked').length
        },
        tasks_by_priority: {
          S: tasks.filter(t => t.priority === 'S').length,
          A: tasks.filter(t => t.priority === 'A').length,
          B: tasks.filter(t => t.priority === 'B').length,
          C: tasks.filter(t => t.priority === 'C').length
        }
      };
      break;

    case 'wuxing':
      const wuxingDistribution = {
        火: tasks.filter(t => t.wuxing === '火').length,
        金: tasks.filter(t => t.wuxing === '金').length,
        木: tasks.filter(t => t.wuxing === '木').length,
        水: tasks.filter(t => t.wuxing === '水').length,
        土: tasks.filter(t => t.wuxing === '土').length
      };
      dashboard.wuxing_distribution = wuxingDistribution;
      break;

    case 'progress':
      dashboard.member_progress = members.map(member => {
        const memberTasks = tasks.filter(t => t.assigned_to === member.id);
        const avgProgress = memberTasks.length > 0
          ? memberTasks.reduce((sum, t) => sum + t.progress, 0) / memberTasks.length
          : 0;

        return {
          member_id: member.id,
          member_name: member.name,
          total_tasks: memberTasks.length,
          average_progress: Math.round(avgProgress),
          completed_tasks: memberTasks.filter(t => t.status === 'completed').length
        };
      });
      break;

    case 'bottleneck':
      dashboard.bottlenecks = tasks
        .filter(t => t.status === 'blocked')
        .map(t => ({
          task_id: t.id,
          title: t.title,
          assigned_to: userMembers.get(t.assigned_to)?.name || '未分配',
          blocked_since: t.updated_at
        }));
      break;
  }

  return dashboard;
}

async function checkWuxingBalance(args, userId) {
  const userTasks = getUserStore('tasks', userId);

  const timeframe = args.timeframe || 'week';
  const tasks = Array.from(userTasks.values());

  // 计算当前五行分布
  const currentDistribution = {
    火: 0, 金: 0, 木: 0, 水: 0, 土: 0
  };

  tasks.forEach(task => {
    if (task.wuxing && task.status !== 'completed') {
      currentDistribution[task.wuxing]++;
    }
  });

  const total = Object.values(currentDistribution).reduce((a, b) => a + b, 0);
  const percentages = {};
  Object.keys(currentDistribution).forEach(key => {
    percentages[key] = total > 0 ? Math.round((currentDistribution[key] / total) * 100) : 0;
  });

  // 理想分布（根据当前阶段：100万级）
  const ideal = {
    火: 15, 金: 7, 木: 40, 水: 35, 土: 3
  };

  // 计算偏差
  const deviations = {};
  let isBalanced = true;
  const warnings = [];

  Object.keys(ideal).forEach(key => {
    const deviation = percentages[key] - ideal[key];
    deviations[key] = deviation;
    if (Math.abs(deviation) > 10) {
      isBalanced = false;
      if (deviation > 0) {
        warnings.push(`${key}位过度（+${deviation}%）`);
      } else {
        warnings.push(`${key}位不足（${deviation}%）`);
      }
    }
  });

  return {
    timeframe: timeframe,
    current_distribution: currentDistribution,
    current_percentages: percentages,
    ideal_distribution: ideal,
    deviations: deviations,
    is_balanced: isBalanced,
    status: isBalanced ? '✅ 平衡良好' : '⚠️ 需要调整',
    warnings: warnings,
    recommendation: isBalanced
      ? '五行能量平衡良好，继续保持当前节奏'
      : `建议调整：${warnings.join('，')}`
  };
}

async function listAllMembers(args, userId) {
  const userMembers = getUserStore('members', userId);
  const userTasks = getUserStore('tasks', userId);

  const members = Array.from(userMembers.values()).map(m => ({
    id: m.id,
    name: m.name,
    skills: m.skills,
    wuxing_profile: m.wuxing_profile,
    task_count: Array.from(userTasks.values()).filter(t => t.assigned_to === m.id && t.status !== 'completed').length
  }));

  return {
    success: true,
    total_members: members.length,
    members: members
  };
}

async function listAllTasks(args, userId) {
  const userTasks = getUserStore('tasks', userId);
  const userMembers = getUserStore('members', userId);

  const statusFilter = args.status || 'all';

  let tasks = Array.from(userTasks.values());

  if (statusFilter !== 'all') {
    tasks = tasks.filter(t => t.status === statusFilter);
  }

  // 添加成员名称
  tasks = tasks.map(t => ({
    ...t,
    assigned_to_name: t.assigned_to ? userMembers.get(t.assigned_to)?.name : '未分配'
  }));

  return {
    success: true,
    total_tasks: tasks.length,
    status_filter: statusFilter,
    tasks: tasks
  };
}

// ========================================
// Web API端点（前端页面使用）
// ========================================

// 获取任务列表（支持筛选）
app.get('/api/tasks', authenticateToken, requireMember, async (req, res) => {
  try {
    const userId = req.userId;
    const { status, created_by_me, assigned_to_me } = req.query;
    const userTasks = getUserStore('tasks', userId);
    const userMembers = getUserStore('members', userId);

    let tasks = Array.from(userTasks.values());

    // 状态筛选
    if (status && status !== 'all') {
      tasks = tasks.filter(t => t.status === status);
    }

    // 我创建的任务
    if (created_by_me === 'true') {
      tasks = tasks.filter(t => t.created_by === userId);
    }

    // 分配给我的任务（通过member_id匹配）
    if (assigned_to_me === 'true') {
      // 找到当前用户关联的member
      const myMember = Array.from(userMembers.values()).find(m => m.user_id === userId);
      if (myMember) {
        tasks = tasks.filter(t => t.assigned_to === myMember.id);
      } else {
        tasks = [];
      }
    }

    // 添加成员名称
    tasks = tasks.map(t => ({
      ...t,
      assigned_to_name: t.assigned_to ? userMembers.get(t.assigned_to)?.name : null
    }));

    // 按创建时间排序（最新在前）
    tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      tasks,
      total: tasks.length
    });
  } catch (error) {
    console.error('获取任务列表失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取单个任务详情
app.get('/api/tasks/:id', authenticateToken, requireMember, async (req, res) => {
  try {
    const userId = req.userId;
    const taskId = req.params.id;
    const userTasks = getUserStore('tasks', userId);
    const userMembers = getUserStore('members', userId);

    const task = userTasks.get(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    // 添加关联信息
    const taskWithDetails = {
      ...task,
      assigned_to_name: task.assigned_to ? userMembers.get(task.assigned_to)?.name : null,
      assigned_member: task.assigned_to ? userMembers.get(task.assigned_to) : null
    };

    res.json({
      success: true,
      task: taskWithDetails
    });
  } catch (error) {
    console.error('获取任务详情失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 创建任务（Web表单版本）
app.post('/api/tasks', authenticateToken, requireMember, async (req, res) => {
  try {
    const userId = req.userId;
    const { title, description, wuxing, priority, skills_required, reward_points } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: '标题和描述不能为空'
      });
    }

    // 调用已有的createTask函数
    const result = await createTask({
      title,
      description,
      wuxing: wuxing || null,
      priority: priority || 'B',
      skills_required: skills_required || [],
      reward_points: reward_points || 20
    }, userId);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('创建任务失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 更新任务
app.put('/api/tasks/:id', authenticateToken, requireMember, async (req, res) => {
  try {
    const userId = req.userId;
    const taskId = req.params.id;
    const { status, progress, notes } = req.body;

    const result = await updateTaskStatus({
      task_id: taskId,
      status,
      progress,
      notes
    }, userId);

    res.json(result);
  } catch (error) {
    console.error('更新任务失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 分配任务
app.post('/api/tasks/:id/assign', authenticateToken, requireMember, async (req, res) => {
  try {
    const userId = req.userId;
    const taskId = req.params.id;
    const { member_id } = req.body;

    const result = await assignTask({
      task_id: taskId,
      member_id: member_id || null // null则自动匹配
    }, userId);

    res.json(result);
  } catch (error) {
    console.error('分配任务失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取成员列表
app.get('/api/members', authenticateToken, requireMember, async (req, res) => {
  try {
    const userId = req.userId;
    const userMembers = getUserStore('members', userId);
    const userTasks = getUserStore('tasks', userId);

    const members = Array.from(userMembers.values()).map(m => ({
      ...m,
      task_count: Array.from(userTasks.values()).filter(t =>
        t.assigned_to === m.id && t.status !== 'completed'
      ).length,
      completed_count: Array.from(userTasks.values()).filter(t =>
        t.assigned_to === m.id && t.status === 'completed'
      ).length
    }));

    res.json({
      success: true,
      members,
      total: members.length
    });
  } catch (error) {
    console.error('获取成员列表失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取单个成员详情
app.get('/api/members/:id', authenticateToken, requireMember, async (req, res) => {
  try {
    const userId = req.userId;
    const memberId = req.params.id;
    const userMembers = getUserStore('members', userId);
    const userTasks = getUserStore('tasks', userId);

    const member = userMembers.get(memberId);

    if (!member) {
      return res.status(404).json({
        success: false,
        message: '成员不存在'
      });
    }

    // 获取成员的任务历史
    const tasks = Array.from(userTasks.values())
      .filter(t => t.assigned_to === memberId)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    // 统计数据
    const stats = {
      total_tasks: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      pending: tasks.filter(t => t.status === 'pending').length
    };

    res.json({
      success: true,
      member: {
        ...member,
        tasks: tasks.slice(0, 10), // 最近10个任务
        stats
      }
    });
  } catch (error) {
    console.error('获取成员详情失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取所有正式成员（从数据库）
app.get('/api/community/members', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const members = await prisma.user.findMany({
      where: { status: 'member' },
      select: {
        id: true,
        username: true,
        serialNumber: true,
        pwpProfile: true,
        pwpCompleted: true,
        createdAt: true,
        approvedAt: true
      },
      orderBy: { serialNumber: 'asc' }
    });

    await prisma.$disconnect();

    res.json({
      success: true,
      members,
      total: members.length
    });
  } catch (error) {
    console.error('获取社区成员失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取社区成员详情（从数据库）
app.get('/api/community/members/:id', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const member = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        username: true,
        serialNumber: true,
        pwpProfile: true,
        pwpCompleted: true,
        pointsBalance: true,
        createdAt: true,
        approvedAt: true,
        status: true
      }
    });

    if (!member || member.status !== 'member') {
      await prisma.$disconnect();
      return res.status(404).json({
        success: false,
        message: '成员不存在'
      });
    }

    // 获取积分历史
    const pointsHistory = await prisma.pointsTransaction.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    await prisma.$disconnect();

    res.json({
      success: true,
      member: {
        ...member,
        pointsHistory
      }
    });
  } catch (error) {
    console.error('获取成员详情失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========================================
// 智能推荐算法函数
// ========================================

// 五行匹配度计算（欧几里得距离相似度）
function calculateWuxingMatch(taskWuxing, memberWuxing) {
  const elements = ['fire', 'metal', 'wood', 'water', 'earth'];
  let sumSquaredDiff = 0;

  elements.forEach(el => {
    const taskVal = taskWuxing[el] || 0;
    const memberVal = memberWuxing[el] || 0;
    const diff = taskVal - memberVal;
    sumSquaredDiff += diff * diff;
  });

  const distance = Math.sqrt(sumSquaredDiff);
  const maxDistance = Math.sqrt(5 * 100 * 100); // 最大可能距离 ~223.6
  const similarity = 100 - (distance / maxDistance * 100);

  return Math.max(0, Math.min(100, similarity));
}

// 技能匹配度计算
function calculateSkillMatch(taskSkills, memberSkills) {
  if (!taskSkills || taskSkills.length === 0) return 100; // 无技能要求视为完全匹配
  if (!memberSkills || memberSkills.length === 0) return 0;

  const matchedSkills = taskSkills.filter(skill =>
    memberSkills.some(ms =>
      ms.toLowerCase().includes(skill.toLowerCase()) ||
      skill.toLowerCase().includes(ms.toLowerCase())
    )
  );

  return (matchedSkills.length / taskSkills.length) * 100;
}

// 成长价值计算（推荐能提升短板的任务）
function calculateGrowthValue(taskWuxing, memberWuxing) {
  const elements = ['fire', 'metal', 'wood', 'water', 'earth'];

  // 找出成员最弱的五行
  let weakestElement = elements[0];
  let weakestValue = memberWuxing[weakestElement] || 100;

  elements.forEach(el => {
    const val = memberWuxing[el] || 0;
    if (val < weakestValue) {
      weakestValue = val;
      weakestElement = el;
    }
  });

  // 如果任务需要弱项五行，则有成长价值
  const growthValue = taskWuxing[weakestElement] || 0;

  return growthValue;
}

// 工作负载分数计算
function calculateWorkloadScore(currentTaskCount) {
  const maxTasks = 5;

  if (currentTaskCount >= maxTasks) return 0;

  return ((maxTasks - currentTaskCount) / maxTasks) * 100;
}

// 五行相生相克关系
const SHENG_RELATIONS = {
  wood: 'fire',    // 木生火
  fire: 'earth',   // 火生土
  earth: 'metal',  // 土生金
  metal: 'water',  // 金生水
  water: 'wood'    // 水生木
};

const KE_RELATIONS = {
  wood: 'earth',   // 木克土
  earth: 'water',  // 土克水
  water: 'fire',   // 水克火
  fire: 'metal',   // 火克金
  metal: 'wood'    // 金克木
};

const ELEMENT_NAMES = {
  fire: '火',
  metal: '金',
  wood: '木',
  water: '水',
  earth: '土'
};

// 五行互补度计算（基于相生相克）
function calculateWuxingComplement(wuxingA, wuxingB) {
  const elements = ['fire', 'metal', 'wood', 'water', 'earth'];
  let complementScore = 0;

  // 相生加分：A的强项能生B的弱项
  elements.forEach(elA => {
    const elB = SHENG_RELATIONS[elA];
    const aStrength = wuxingA[elA] || 0;
    const bWeakness = 100 - (wuxingB[elB] || 0);

    if (aStrength > 60 && bWeakness > 40) {
      complementScore += (aStrength * bWeakness / 100) * 0.3;
    }
  });

  // 反向相生加分：B的强项能生A的弱项
  elements.forEach(elB => {
    const elA = SHENG_RELATIONS[elB];
    const bStrength = wuxingB[elB] || 0;
    const aWeakness = 100 - (wuxingA[elA] || 0);

    if (bStrength > 60 && aWeakness > 40) {
      complementScore += (bStrength * aWeakness / 100) * 0.3;
    }
  });

  // 相克减分：双方都很强会冲突
  elements.forEach(elA => {
    const elB = KE_RELATIONS[elA];
    const aStrength = wuxingA[elA] || 0;
    const bStrength = wuxingB[elB] || 0;

    if (aStrength > 70 && bStrength > 70) {
      complementScore -= 10;
    }
  });

  // 归一化到0-100
  return Math.max(0, Math.min(100, complementScore));
}

// 技能互补度计算
function calculateSkillComplement(skillsA, skillsB) {
  if (!skillsA || !skillsB) return 50;
  if (skillsA.length === 0 && skillsB.length === 0) return 50;

  const normalizedA = skillsA.map(s => s.toLowerCase());
  const normalizedB = skillsB.map(s => s.toLowerCase());

  const allSkills = [...new Set([...normalizedA, ...normalizedB])];
  const uniqueSkills = allSkills.length;
  const totalSkills = normalizedA.length + normalizedB.length;

  if (totalSkills === 0) return 50;

  const sharedSkills = normalizedA.filter(s => normalizedB.includes(s)).length;

  // 理想：技能有一定重叠但也有互补
  const coverageScore = (uniqueSkills / totalSkills) * 100;
  const overlapPenalty = sharedSkills > 3 ? -10 : 0;

  return Math.max(0, Math.min(100, coverageScore + overlapPenalty));
}

// 分析互补原因
function analyzeComplementReasons(wuxingA, wuxingB) {
  const reasons = [];
  const elements = ['fire', 'metal', 'wood', 'water', 'earth'];

  // 检测相生关系：A生B
  elements.forEach(elA => {
    const elB = SHENG_RELATIONS[elA];
    const aStrength = wuxingA[elA] || 0;
    const bWeakness = 100 - (wuxingB[elB] || 0);

    if (aStrength > 60 && bWeakness > 40) {
      reasons.push(`你的${ELEMENT_NAMES[elA]}能量强(${aStrength})，可以生对方的${ELEMENT_NAMES[elB]}`);
    }
  });

  // 检测相生关系：B生A
  elements.forEach(elB => {
    const elA = SHENG_RELATIONS[elB];
    const bStrength = wuxingB[elB] || 0;
    const aWeakness = 100 - (wuxingA[elA] || 0);

    if (bStrength > 60 && aWeakness > 40) {
      reasons.push(`对方的${ELEMENT_NAMES[elB]}能量强(${bStrength})，可以生你的${ELEMENT_NAMES[elA]}`);
    }
  });

  return reasons.slice(0, 2); // 最多返回2个理由
}

// ========================================
// 智能推荐API端点
// ========================================

// GET /api/tasks/recommended - 获取为当前用户推荐的任务
app.get('/api/tasks/recommended', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // 1. 获取当前用户信息和画像
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      await prisma.$disconnect();
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    const memberWuxing = user.pwpProfile?.wuxing || { fire: 20, metal: 20, wood: 20, water: 20, earth: 20 };
    const memberSkills = user.pwpProfile?.skills || [];

    // 2. 获取所有待分配的任务
    const userTasks = getUserStore('tasks', userId);
    const allTasks = Array.from(userTasks.values());

    // 筛选可推荐的任务（未分配或待处理）
    const availableTasks = allTasks.filter(t =>
      !t.assigned_to &&
      (t.status === 'pending' || !t.status)
    );

    // 3. 获取用户当前进行中的任务数量
    const currentTaskCount = allTasks.filter(t =>
      t.assigned_to === userId &&
      (t.status === 'pending' || t.status === 'in_progress')
    ).length;

    // 4. 计算每个任务的推荐分数
    const recommendations = availableTasks.map(task => {
      // 将任务的五行属性转换为数值格式
      const taskWuxing = task.requiredWuxing || {};
      // 如果任务只有单一五行属性，创建对应的wuxing对象
      if (task.wuxing && !task.requiredWuxing) {
        const wuxingMap = { '火': 'fire', '金': 'metal', '木': 'wood', '水': 'water', '土': 'earth' };
        const element = wuxingMap[task.wuxing];
        if (element) {
          taskWuxing[element] = 80; // 主要五行设为80
        }
      }

      const taskSkills = task.skills_required || [];

      const wuxingMatch = calculateWuxingMatch(taskWuxing, memberWuxing);
      const skillMatch = calculateSkillMatch(taskSkills, memberSkills);
      const growthValue = calculateGrowthValue(taskWuxing, memberWuxing);
      const workloadScore = calculateWorkloadScore(currentTaskCount);

      // 综合评分：五行40% + 技能30% + 成长20% + 负载10%
      const totalScore =
        wuxingMatch * 0.4 +
        skillMatch * 0.3 +
        growthValue * 0.2 +
        workloadScore * 0.1;

      return {
        task,
        score: Math.round(totalScore),
        reasons: {
          wuxingMatch: Math.round(wuxingMatch),
          skillMatch: Math.round(skillMatch),
          growthValue: Math.round(growthValue),
          workload: currentTaskCount
        }
      };
    });

    // 5. 排序并返回Top5
    recommendations.sort((a, b) => b.score - a.score);
    const top5 = recommendations.slice(0, 5);

    await prisma.$disconnect();

    res.json({
      success: true,
      recommendations: top5,
      userProfile: {
        wuxing: memberWuxing,
        skills: memberSkills,
        currentTaskCount
      }
    });

  } catch (error) {
    console.error('Error getting recommended tasks:', error);
    res.status(500).json({ success: false, message: '推荐任务失败: ' + error.message });
  }
});

// GET /api/members/:id/recommended-partners - 获取推荐协作搭档
app.get('/api/members/:id/recommended-partners', authenticateToken, async (req, res) => {
  try {
    const targetMemberId = req.params.id;

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // 1. 获取目标成员信息
    const targetMember = await prisma.user.findUnique({
      where: { id: targetMemberId }
    });

    if (!targetMember) {
      await prisma.$disconnect();
      return res.status(404).json({ success: false, message: '成员不存在' });
    }

    const targetWuxing = targetMember.pwpProfile?.wuxing || { fire: 20, metal: 20, wood: 20, water: 20, earth: 20 };
    const targetSkills = targetMember.pwpProfile?.skills || [];

    // 2. 获取所有其他正式成员
    const allMembers = await prisma.user.findMany({
      where: {
        status: 'member',
        id: { not: targetMemberId }
      },
      select: {
        id: true,
        username: true,
        serialNumber: true,
        pwpProfile: true
      }
    });

    // 3. 计算每个成员的互补度
    const recommendations = allMembers.map(member => {
      const memberWuxing = member.pwpProfile?.wuxing || { fire: 20, metal: 20, wood: 20, water: 20, earth: 20 };
      const memberSkills = member.pwpProfile?.skills || [];

      const wuxingComplement = calculateWuxingComplement(targetWuxing, memberWuxing);
      const skillComplement = calculateSkillComplement(targetSkills, memberSkills);

      // 综合评分：五行互补70% + 技能互补30%
      const totalScore = wuxingComplement * 0.7 + skillComplement * 0.3;

      // 分析互补原因
      const reasons = analyzeComplementReasons(targetWuxing, memberWuxing);

      return {
        member: {
          id: member.id,
          username: member.username,
          serialNumber: member.serialNumber,
          wuxing: memberWuxing,
          skills: memberSkills
        },
        score: Math.round(totalScore),
        wuxingScore: Math.round(wuxingComplement),
        skillScore: Math.round(skillComplement),
        reasons
      };
    });

    // 4. 排序并返回Top3
    recommendations.sort((a, b) => b.score - a.score);
    const top3 = recommendations.slice(0, 3);

    await prisma.$disconnect();

    res.json({
      success: true,
      recommendations: top3,
      targetProfile: {
        wuxing: targetWuxing,
        skills: targetSkills
      }
    });

  } catch (error) {
    console.error('Error getting recommended partners:', error);
    res.status(500).json({ success: false, message: '推荐搭档失败: ' + error.message });
  }
});

// ========================================
// AI协同功能 - Task #33, #30, #34
// ========================================

// AI配置和工具函数
let anthropicClient = null;

// 初始化Anthropic客户端
function getAnthropicClient() {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      anthropicClient = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    } catch (error) {
      console.log('[AI] Anthropic SDK not installed or API key missing');
    }
  }
  return anthropicClient;
}

// 调用Claude API的通用函数
async function callClaudeAPI(systemPrompt, userMessage, conversationHistory = []) {
  const client = getAnthropicClient();

  if (!client) {
    // 如果没有配置API，返回模拟响应
    return generateMockAIResponse(userMessage);
  }

  try {
    // 构建消息历史
    const messages = [
      ...conversationHistory.map(h => [
        { role: 'user', content: h.message },
        { role: 'assistant', content: h.response }
      ]).flat(),
      { role: 'user', content: userMessage }
    ];

    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages
    });

    return response.content[0].text;

  } catch (error) {
    console.error('[AI] Claude API error:', error);
    return generateMockAIResponse(userMessage);
  }
}

// 生成模拟AI响应（当API不可用时）
function generateMockAIResponse(userMessage) {
  const responses = {
    default: `感谢您的问题！作为AI助手，我可以帮您：

1. **分析任务需求** - 拆解任务步骤和所需技能
2. **推荐团队成员** - 基于五行画像进行智能匹配
3. **提供建议** - 针对任务执行给出专业建议

由于AI服务暂时不可用，这是一个模拟响应。请配置ANTHROPIC_API_KEY以启用完整AI功能。`,

    skill: `根据任务分析，建议需要以下技能：
- 技术开发能力
- 项目管理经验
- 团队协作能力

建议优先匹配具有较高木能量（技术构建）的成员。`,

    member: `基于五行匹配分析，建议邀请：
- 木能量较高的成员负责技术实现
- 火能量较高的成员负责推动进度

具体匹配结果请查看成员列表页面的推荐功能。`
  };

  const lowerMessage = userMessage.toLowerCase();
  if (lowerMessage.includes('技能') || lowerMessage.includes('skill')) {
    return responses.skill;
  }
  if (lowerMessage.includes('成员') || lowerMessage.includes('人员') || lowerMessage.includes('推荐')) {
    return responses.member;
  }
  return responses.default;
}

// ========================================
// Task #33: AI助手对话功能
// ========================================

// POST /api/ai/chat - AI助手对话
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
  try {
    const { taskId, message, conversationHistory = [] } = req.body;
    const userId = req.userId;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: '请输入消息内容' });
    }

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // 1. 获取当前用户信息
    const currentUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    // 2. 获取任务信息（如果提供了taskId）
    let taskContext = '';
    if (taskId) {
      const userTasks = getUserStore('tasks', userId);
      const task = userTasks.get(taskId);
      if (task) {
        taskContext = `
当前任务信息：
- 标题：${task.title}
- 描述：${task.description || '暂无描述'}
- 五行属性：${task.wuxing || '未设置'}
- 所需技能：${task.skills_required?.join(', ') || '暂无'}
- 优先级：${task.priority || 'B'}
- 当前进度：${task.progress || 0}%
- 状态：${task.status}
`;
      }
    }

    // 3. 获取团队成员信息（用于AI推荐）
    const allMembers = await prisma.user.findMany({
      where: { status: 'member' },
      select: {
        id: true,
        username: true,
        serialNumber: true,
        pwpProfile: true
      }
    });

    const memberContext = allMembers.map(m => {
      const wuxing = m.pwpProfile?.wuxing || {};
      const skills = m.pwpProfile?.skills || [];
      return `- 超协体#${String(m.serialNumber || 0).padStart(3, '0')} ${m.username}
  五行：火${wuxing.fire || 0} 金${wuxing.metal || 0} 木${wuxing.wood || 0} 水${wuxing.water || 0} 土${wuxing.earth || 0}
  技能：${skills.join(', ') || '暂无'}`;
    }).join('\n');

    // 4. 构建系统提示词
    const systemPrompt = `你是超协体的AI助手，帮助团队成员完成任务和协作。

${taskContext}

团队成员（共${allMembers.length}人）：
${memberContext}

你的职责：
1. 回答任务相关问题
2. 推荐合适的团队成员（基于五行匹配）
3. 帮助拆解任务步骤
4. 提供技术建议
5. 分析团队五行平衡

回答要求：
- 简洁专业，直接给出建议
- 推荐成员时说明五行匹配理由
- 必要时使用列表格式
- 避免冗长的客套话
- 中文回复`;

    // 5. 调用Claude API
    const aiResponse = await callClaudeAPI(systemPrompt, message, conversationHistory);

    await prisma.$disconnect();

    res.json({
      success: true,
      response: aiResponse
    });

  } catch (error) {
    console.error('[AI] Chat error:', error);
    res.status(500).json({ success: false, message: 'AI助手暂时不可用: ' + error.message });
  }
});

// ========================================
// Task #30: AI虚拟成员系统
// ========================================

// AI成员预设配置
const AI_MEMBER_PRESETS = {
  code_master: {
    username: 'CodeMaster AI',
    wuxing: { fire: 20, metal: 30, wood: 70, water: 15, earth: 10 },
    skills: ['编程', 'AI开发', '代码审查', '架构设计'],
    description: '专注代码开发的AI助手，擅长技术实现'
  },
  doc_writer: {
    username: 'DocWriter AI',
    wuxing: { fire: 60, metal: 20, wood: 30, water: 40, earth: 15 },
    skills: ['文档撰写', '技术写作', '内容创作', '方案设计'],
    description: '专注文档撰写的AI助手，擅长知识沉淀'
  },
  analyst: {
    username: 'Analyst AI',
    wuxing: { fire: 25, metal: 60, wood: 20, water: 35, earth: 40 },
    skills: ['数据分析', '战略研究', '决策支持', '趋势预测'],
    description: '专注数据分析的AI助手，擅长洞察决策'
  },
  coordinator: {
    username: 'Coordinator AI',
    wuxing: { fire: 20, metal: 20, wood: 30, water: 50, earth: 30 },
    skills: ['项目协调', '团队沟通', '资源调度', '进度跟踪'],
    description: '专注协调沟通的AI助手，擅长组织管理'
  }
};

// POST /api/ai-members/create - 创建AI成员
app.post('/api/ai-members/create', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { aiType } = req.body;

    const preset = AI_MEMBER_PRESETS[aiType];
    if (!preset) {
      return res.status(400).json({ success: false, message: '无效的AI类型' });
    }

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // 检查是否已存在同类型AI成员
    const existingAI = await prisma.user.findFirst({
      where: {
        email: `ai-${aiType}@supercoordination.ai`
      }
    });

    if (existingAI) {
      await prisma.$disconnect();
      return res.status(400).json({
        success: false,
        message: `${preset.username} 已经存在`
      });
    }

    // 生成AI成员序号
    const maxSerialNumber = await prisma.user.findFirst({
      where: { serialNumber: { not: null } },
      orderBy: { serialNumber: 'desc' }
    });
    const newSerialNumber = (maxSerialNumber?.serialNumber || 0) + 1;

    // 创建AI成员
    const aiMember = await prisma.user.create({
      data: {
        email: `ai-${aiType}@supercoordination.ai`,
        passwordHash: 'AI_MEMBER_NO_PASSWORD',
        username: preset.username,
        role: 'member',
        status: 'member',
        serialNumber: newSerialNumber,
        pwpProfile: {
          wuxing: preset.wuxing,
          skills: preset.skills,
          work_status: preset.description,
          pain_points: [],
          ideal_state: '',
          isAI: true,
          aiType: aiType
        },
        pwpCompleted: true,
        pointsBalance: 0,
        approvedAt: new Date(),
        approvedBy: 'SYSTEM'
      }
    });

    await prisma.$disconnect();

    res.json({
      success: true,
      message: `${preset.username} 创建成功`,
      aiMember: {
        id: aiMember.id,
        username: aiMember.username,
        serialNumber: aiMember.serialNumber,
        aiType: aiType
      }
    });

  } catch (error) {
    console.error('[AI] Create AI member error:', error);
    res.status(500).json({ success: false, message: '创建AI成员失败: ' + error.message });
  }
});

// GET /api/ai-members - 获取所有AI成员
app.get('/api/ai-members', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const aiMembers = await prisma.user.findMany({
      where: {
        email: { contains: '@supercoordination.ai' }
      },
      select: {
        id: true,
        username: true,
        serialNumber: true,
        pwpProfile: true,
        createdAt: true
      },
      orderBy: { serialNumber: 'asc' }
    });

    await prisma.$disconnect();

    // 标注AI类型
    const membersWithType = aiMembers.map(m => ({
      ...m,
      isAI: true,
      aiType: m.pwpProfile?.aiType || m.email?.split('-')[1]?.split('@')[0] || 'unknown'
    }));

    res.json({
      success: true,
      aiMembers: membersWithType
    });

  } catch (error) {
    console.error('[AI] Get AI members error:', error);
    res.status(500).json({ success: false, message: '获取AI成员失败' });
  }
});

// POST /api/ai-members/:id/execute-task - AI成员执行任务
app.post('/api/ai-members/:id/execute-task', authenticateToken, async (req, res) => {
  try {
    const aiMemberId = req.params.id;
    const { taskId } = req.body;
    const userId = req.userId;

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // 1. 验证是AI成员
    const aiMember = await prisma.user.findUnique({
      where: { id: aiMemberId }
    });

    if (!aiMember || !aiMember.email?.includes('@supercoordination.ai')) {
      await prisma.$disconnect();
      return res.status(404).json({ success: false, message: 'AI成员不存在' });
    }

    // 2. 获取任务
    const userTasks = getUserStore('tasks', userId);
    const task = userTasks.get(taskId);

    if (!task) {
      await prisma.$disconnect();
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    await prisma.$disconnect();

    // 3. 启动AI执行（异步）
    executeTaskWithAI(aiMember, task, userId).catch(err => {
      console.error('[AI] Task execution error:', err);
    });

    res.json({
      success: true,
      message: `${aiMember.username} 已开始处理任务`
    });

  } catch (error) {
    console.error('[AI] Execute task error:', error);
    res.status(500).json({ success: false, message: 'AI执行失败' });
  }
});

// AI任务执行函数（异步）
async function executeTaskWithAI(aiMember, task, userId) {
  try {
    const userTasks = getUserStore('tasks', userId);

    // 1. 更新任务状态为进行中
    task.status = 'in_progress';
    task.progress = 10;
    task.assigned_to = aiMember.id;
    task.updated_at = new Date().toISOString();
    saveData();

    // 2. 构建AI提示词
    const skills = aiMember.pwpProfile?.skills || [];
    const systemPrompt = `你是${aiMember.username}，超协体的AI成员。

你的专长：${skills.join(', ')}
你的角色描述：${aiMember.pwpProfile?.work_status || ''}

当前任务：
标题：${task.title}
描述：${task.description || '暂无描述'}
所需技能：${task.skills_required?.join(', ') || '暂无'}

请完成这个任务，并给出：
1. 具体的执行步骤
2. 执行结果（如果是代码/文档，直接输出关键内容）
3. 完成度评估（0-100的数字）

输出格式：
## 执行步骤
[列出步骤]

## 执行结果
[输出结果]

## 完成度
[0-100的数字]`;

    // 3. 调用Claude API
    const result = await callClaudeAPI(systemPrompt, '开始执行任务');

    // 4. 解析完成度
    const completionMatch = result.match(/##\s*完成度[\s\S]*?(\d+)/);
    const completion = completionMatch ? Math.min(100, Math.max(0, parseInt(completionMatch[1]))) : 90;

    // 5. 更新任务
    task.progress = completion;
    task.status = completion >= 90 ? 'completed' : 'in_progress';
    task.aiExecutionResult = result;
    task.updated_at = new Date().toISOString();
    task.notes = `AI执行完成，完成度：${completion}%`;

    saveData();

    console.log(`[AI] ${aiMember.username} 完成任务 "${task.title}"，完成度：${completion}%`);

  } catch (error) {
    console.error('[AI] Execution error:', error);
    task.status = 'blocked';
    task.notes = `AI执行失败: ${error.message}`;
    task.updated_at = new Date().toISOString();
    saveData();
  }
}

// ========================================
// Task #34: 多AI协作系统
// ========================================

// POST /api/tasks/:id/multi-ai-collaborate - 启动多AI协作
app.post('/api/tasks/:id/multi-ai-collaborate', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.userId;

    // 1. 获取任务
    const userTasks = getUserStore('tasks', userId);
    const task = userTasks.get(taskId);

    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // 2. 获取Coordinator AI
    const coordinatorAI = await prisma.user.findFirst({
      where: {
        email: 'ai-coordinator@supercoordination.ai'
      }
    });

    if (!coordinatorAI) {
      await prisma.$disconnect();
      return res.status(404).json({
        success: false,
        message: '请先创建Coordinator AI成员'
      });
    }

    // 3. 获取所有AI成员
    const allAIMembers = await prisma.user.findMany({
      where: {
        email: { contains: '@supercoordination.ai' }
      }
    });

    await prisma.$disconnect();

    // 4. 初始化多AI协作状态
    task.multiAI = {
      enabled: true,
      coordinator: coordinatorAI.id,
      status: 'analyzing',
      subtasks: [],
      startedAt: new Date().toISOString()
    };
    task.status = 'in_progress';
    task.progress = 5;
    saveData();

    // 5. 启动多AI协作流程（异步）
    startMultiAICollaboration(task, coordinatorAI, allAIMembers, userId).catch(err => {
      console.error('[MultiAI] Collaboration error:', err);
    });

    res.json({
      success: true,
      message: '多AI协作已启动'
    });

  } catch (error) {
    console.error('[MultiAI] Start error:', error);
    res.status(500).json({ success: false, message: '启动失败: ' + error.message });
  }
});

// 多AI协作主流程
async function startMultiAICollaboration(task, coordinatorAI, allAIMembers, userId) {
  const userTasks = getUserStore('tasks', userId);

  try {
    // === 阶段1：Coordinator分析并拆解任务 ===
    console.log(`[MultiAI] Coordinator开始分析任务: ${task.title}`);

    task.multiAI.status = 'analyzing';
    task.progress = 10;
    saveData();

    const analysisPrompt = `你是Coordinator AI，负责协调团队AI成员完成复杂任务。

当前任务：
标题：${task.title}
描述：${task.description || '暂无描述'}
所需技能：${task.skills_required?.join(', ') || '暂无'}

可用的AI成员类型：
- code_master: 负责代码开发
- doc_writer: 负责文档撰写
- analyst: 负责数据分析

请分析这个任务并拆解为2-4个子任务，每个子任务需要指定：
1. 子任务标题
2. 子任务描述
3. 推荐的AI成员类型（code_master/doc_writer/analyst）

严格按照以下JSON格式输出：
{
  "subtasks": [
    {
      "title": "子任务标题",
      "description": "子任务描述",
      "aiType": "code_master"
    }
  ]
}`;

    const analysisResponse = await callClaudeAPI(analysisPrompt, '请分析并拆解任务');

    // 解析JSON
    let analysis;
    try {
      const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch[0]);
    } catch (e) {
      // 如果解析失败，创建默认子任务
      analysis = {
        subtasks: [
          { title: '任务执行', description: task.description, aiType: 'code_master' },
          { title: '结果文档', description: '整理执行结果', aiType: 'doc_writer' }
        ]
      };
    }

    // === 阶段2：分配子任务给对应AI并行执行 ===
    console.log(`[MultiAI] 拆解为${analysis.subtasks.length}个子任务`);

    task.multiAI.status = 'executing';
    task.multiAI.subtasks = analysis.subtasks.map((st, idx) => ({
      id: `subtask-${idx}`,
      ...st,
      status: 'pending',
      result: null
    }));
    task.progress = 20;
    saveData();

    // 并行执行子任务
    const subtaskPromises = analysis.subtasks.map(async (subtask, index) => {
      // 获取对应类型的AI成员
      const aiMember = allAIMembers.find(m =>
        m.email === `ai-${subtask.aiType}@supercoordination.ai`
      );

      const memberName = aiMember?.username || `${subtask.aiType} AI`;

      console.log(`[MultiAI] ${memberName} 开始处理: ${subtask.title}`);

      // 更新子任务状态
      task.multiAI.subtasks[index].status = 'in_progress';
      task.multiAI.subtasks[index].aiMember = memberName;
      saveData();

      // 调用AI执行子任务
      const executionPrompt = `你是${memberName}，专长：${AI_MEMBER_PRESETS[subtask.aiType]?.skills?.join(', ') || '通用能力'}

子任务：
标题：${subtask.title}
描述：${subtask.description}

请完成这个子任务，并输出详细结果。保持简洁专业。`;

      const result = await callClaudeAPI(executionPrompt, '请执行子任务');

      console.log(`[MultiAI] ${memberName} 完成: ${subtask.title}`);

      // 更新子任务结果
      task.multiAI.subtasks[index].status = 'completed';
      task.multiAI.subtasks[index].result = result;
      task.progress = Math.min(80, 20 + (index + 1) * (60 / analysis.subtasks.length));
      saveData();

      return {
        subtask,
        aiMember: memberName,
        result,
        success: true
      };
    });

    // 等待所有子任务完成
    const subtaskResults = await Promise.all(subtaskPromises);

    // === 阶段3：Coordinator汇总结果 ===
    console.log(`[MultiAI] Coordinator汇总结果`);

    task.multiAI.status = 'summarizing';
    task.progress = 85;
    saveData();

    const summaryPrompt = `你是Coordinator AI，所有AI成员已完成任务，请汇总结果。

原始任务：${task.title}

各AI成员执行结果：
${subtaskResults.map(r => `
## ${r.subtask.title} (执行者: ${r.aiMember})
${r.result}
`).join('\n')}

请汇总为最终报告，包括：
1. 总体完成情况
2. 各部分成果整合
3. 建议的后续步骤

输出专业的项目报告格式。`;

    const finalReport = await callClaudeAPI(summaryPrompt, '请汇总所有结果');

    // === 阶段4：更新任务状态 ===
    task.multiAI.status = 'completed';
    task.multiAI.finalReport = finalReport;
    task.multiAI.completedAt = new Date().toISOString();

    task.status = 'completed';
    task.progress = 100;
    task.notes = '多AI协作完成，等待人类审核';
    task.aiExecutionResult = finalReport;
    task.updated_at = new Date().toISOString();

    saveData();

    console.log(`[MultiAI] 任务完成: ${task.title}`);

  } catch (error) {
    console.error('[MultiAI] 执行失败:', error);
    task.multiAI.status = 'failed';
    task.multiAI.error = error.message;
    task.status = 'blocked';
    task.notes = `多AI协作失败: ${error.message}`;
    task.updated_at = new Date().toISOString();
    saveData();
  }
}

// GET /api/tasks/:id/multi-ai-progress - 查询多AI协作进度
app.get('/api/tasks/:id/multi-ai-progress', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.userId;

    const userTasks = getUserStore('tasks', userId);
    const task = userTasks.get(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }

    if (!task.multiAI) {
      return res.status(404).json({
        success: false,
        message: '该任务未启用多AI协作'
      });
    }

    res.json({
      success: true,
      multiAI: task.multiAI,
      taskProgress: task.progress,
      taskStatus: task.status
    });

  } catch (error) {
    console.error('[MultiAI] Get progress error:', error);
    res.status(500).json({ success: false, message: '查询失败' });
  }
});

// ========================================
// 管理后台API - Admin Dashboard
// ========================================

// GET /api/admin/overview - 获取管理后台概览数据
app.get('/api/admin/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 统计用户
    const [totalUsers, adminCount, memberCount, candidateCount, aiMemberCount] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { status: 'member' } }),
      prisma.user.count({ where: { status: 'candidate' } }),
      prisma.user.count({ where: { email: { endsWith: '@ai.supercoord.local' } } })
    ]);

    // 统计任务（使用Prisma）
    const [totalTasks, pendingTasks, inProgressTasks, completedTasks, blockedTasks] = await Promise.all([
      prisma.task.count(),
      prisma.task.count({ where: { status: 'pending' } }),
      prisma.task.count({ where: { status: 'in_progress' } }),
      prisma.task.count({ where: { status: 'completed' } }),
      prisma.task.count({ where: { status: 'blocked' } })
    ]);

    // 今日活跃用户
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayActiveUsers = await prisma.pointsTransaction.groupBy({
      by: ['userId'],
      where: {
        createdAt: { gte: today }
      }
    });

    res.json({
      success: true,
      users: {
        total: totalUsers,
        admin: adminCount,
        member: memberCount,
        candidate: candidateCount,
        aiMember: aiMemberCount,
        activeToday: todayActiveUsers.length
      },
      tasks: {
        total: totalTasks,
        pending: pendingTasks,
        inProgress: inProgressTasks,
        completed: completedTasks,
        blocked: blockedTasks
      }
    });
  } catch (error) {
    console.error('[管理员-系统概览]', error);
    res.status(500).json({ success: false, message: '获取概览数据失败' });
  }
});

// GET /api/admin/users - 用户列表（支持筛选、搜索、分页）
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, role, status, search, isAI } = req.query;

    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (isAI === 'true') {
      where.email = { endsWith: '@ai.supercoord.local' };
    } else if (isAI === 'false') {
      where.NOT = { email: { endsWith: '@ai.supercoord.local' } };
    }
    if (search) {
      where.OR = [
        { username: { contains: search } },
        { email: { contains: search } }
      ];
    }

    const total = await prisma.user.count({ where });
    const users = await prisma.user.findMany({
      where,
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        serialNumber: true,
        username: true,
        email: true,
        role: true,
        status: true,
        pointsBalance: true,
        pwpCompleted: true,
        aiScore: true,
        createdAt: true
      }
    });

    res.json({
      success: true,
      users: users.map(u => ({
        ...u,
        isAI: u.email.endsWith('@ai.supercoord.local')
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[管理员-获取用户列表]', error);
    res.status(500).json({ success: false, message: '获取用户列表失败' });
  }
});

// GET /api/admin/users/:id - 获取用户详情
app.get('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        pointsTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 20
        },
        aiEvaluations: {
          orderBy: { evaluatedAt: 'desc' },
          take: 5
        }
      }
    });

    if (!user) {
      await prisma.$disconnect();
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 获取用户的任务统计
    let taskCount = 0, completedTaskCount = 0;
    store.tasks.forEach(userTasks => {
      userTasks.forEach(task => {
        if (task.assigned_to === id || task.created_by === id) {
          taskCount++;
          if (task.status === 'completed') completedTaskCount++;
        }
      });
    });

    await prisma.$disconnect();

    res.json({
      success: true,
      user: {
        ...user,
        isAI: user.email.endsWith('@ai.supercoord.local'),
        taskStats: {
          total: taskCount,
          completed: completedTaskCount
        }
      }
    });
  } catch (error) {
    console.error('Error getting user detail:', error);
    res.status(500).json({ success: false, message: '获取用户详情失败: ' + error.message });
  }
});

// PUT /api/admin/users/:id/role - 修改用户角色
app.put('/api/admin/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    if (!['admin', 'member'].includes(role)) {
      await prisma.$disconnect();
      return res.status(400).json({ success: false, message: '无效的角色' });
    }

    // 不能修改自己的角色
    if (id === req.userId) {
      await prisma.$disconnect();
      return res.status(400).json({ success: false, message: '不能修改自己的角色' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role }
    });

    await prisma.$disconnect();

    res.json({ success: true, user, message: `用户角色已更新为${role === 'admin' ? '管理员' : '普通成员'}` });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ success: false, message: '修改角色失败: ' + error.message });
  }
});

// PUT /api/admin/users/:id/status - 启用/禁用用户
app.put('/api/admin/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    if (!['member', 'candidate', 'disabled'].includes(status)) {
      await prisma.$disconnect();
      return res.status(400).json({ success: false, message: '无效的状态' });
    }

    // 不能禁用自己
    if (id === req.userId && status === 'disabled') {
      await prisma.$disconnect();
      return res.status(400).json({ success: false, message: '不能禁用自己的账号' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { status }
    });

    await prisma.$disconnect();

    res.json({ success: true, user, message: `用户状态已更新为${status}` });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ success: false, message: '修改状态失败: ' + error.message });
  }
});

// POST /api/admin/users/:id/adjust-points - 调整用户积分
app.post('/api/admin/users/:id/adjust-points', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    if (!amount || typeof amount !== 'number') {
      await prisma.$disconnect();
      return res.status(400).json({ success: false, message: '无效的积分数量' });
    }

    // 检查用户是否存在
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      await prisma.$disconnect();
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 检查调整后积分是否会变为负数
    if (existingUser.pointsBalance + amount < 0) {
      await prisma.$disconnect();
      return res.status(400).json({ success: false, message: '积分不能为负数' });
    }

    // 更新用户积分
    const user = await prisma.user.update({
      where: { id },
      data: {
        pointsBalance: { increment: amount }
      }
    });

    // 记录交易
    await prisma.pointsTransaction.create({
      data: {
        userId: id,
        amount: amount,
        transactionType: 'admin_adjustment',
        description: reason || '管理员手动调整',
        relatedEntityType: 'admin',
        relatedEntityId: req.userId
      }
    });

    await prisma.$disconnect();

    res.json({
      success: true,
      user,
      message: `积分${amount > 0 ? '增加' : '减少'}${Math.abs(amount)}，当前余额${user.pointsBalance}`
    });
  } catch (error) {
    console.error('Error adjusting points:', error);
    res.status(500).json({ success: false, message: '调整积分失败: ' + error.message });
  }
});

// GET /api/admin/tasks - 全局任务列表
app.get('/api/admin/tasks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;

    // 构建查询条件
    const where = {};

    // 状态筛选
    if (status && status !== 'all') {
      where.status = status;
    }

    // 搜索（简化版，不使用insensitive）
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } }
      ];
    }

    // 查询总数
    const total = await prisma.task.count({ where });

    // 查询任务列表
    const tasks = await prisma.task.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            email: true
          }
        },
        assignedUser: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });

    res.json({
      success: true,
      tasks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[管理员-获取任务列表]', error);
    console.error(error);
    res.status(500).json({ success: false, message: '获取任务列表失败: ' + error.message });
  }
});

// GET /api/admin/tasks/stats - 任务统计
app.get('/api/admin/tasks/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [total, pending, inProgress, completed, blocked] = await Promise.all([
      prisma.task.count(),
      prisma.task.count({ where: { status: 'pending' } }),
      prisma.task.count({ where: { status: 'in_progress' } }),
      prisma.task.count({ where: { status: 'completed' } }),
      prisma.task.count({ where: { status: 'blocked' } })
    ]);

    res.json({
      success: true,
      stats: {
        total,
        pending,
        inProgress,
        completed,
        blocked
      }
    });
  } catch (error) {
    console.error('[管理员-任务统计]', error);
    res.status(500).json({ success: false, message: '获取任务统计失败' });
  }
});

// PUT /api/admin/tasks/:id/status - 修改任务状态
app.put('/api/admin/tasks/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'in_progress', 'completed', 'blocked'].includes(status)) {
      return res.status(400).json({ success: false, message: '无效的状态' });
    }

    // 查找任务
    const task = await prisma.task.findUnique({
      where: { id }
    });

    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    // 更新任务状态
    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        status,
        progress: status === 'completed' ? 100 : task.progress
      }
    });

    res.json({ success: true, task: updatedTask, message: '任务状态已更新' });
  } catch (error) {
    console.error('[管理员-更新任务状态]', error);
    res.status(500).json({ success: false, message: '修改任务状态失败' });
  }
});

// DELETE /api/admin/tasks/:id - 删除任务（硬删除）
app.delete('/api/admin/tasks/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 查找任务
    const task = await prisma.task.findUnique({
      where: { id }
    });

    if (!task) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    // 删除任务
    await prisma.task.delete({
      where: { id }
    });

    res.json({ success: true, message: '任务已删除' });
  } catch (error) {
    console.error('[管理员-删除任务]', error);
    res.status(500).json({ success: false, message: '删除任务失败' });
  }
});

// GET /api/admin/analytics/users - 用户增长数据
app.get('/api/admin/analytics/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, days = 30 } = req.query;
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // 计算日期范围
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - parseInt(days) * 24 * 60 * 60 * 1000);

    // 获取用户创建时间
    const users = await prisma.user.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end
        }
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' }
    });

    // 按日期分组
    const dailyStats = {};
    users.forEach(user => {
      const date = user.createdAt.toISOString().split('T')[0];
      dailyStats[date] = (dailyStats[date] || 0) + 1;
    });

    // 获取起始日之前的总用户数
    const previousTotal = await prisma.user.count({
      where: { createdAt: { lt: start } }
    });

    // 累计统计
    const growthData = [];
    let cumulative = previousTotal;

    // 生成日期序列
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const newUsers = dailyStats[dateStr] || 0;
      cumulative += newUsers;
      growthData.push({
        date: dateStr,
        newUsers,
        totalUsers: cumulative
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    await prisma.$disconnect();

    res.json({ success: true, data: growthData });
  } catch (error) {
    console.error('Error getting user analytics:', error);
    res.status(500).json({ success: false, message: '获取用户数据失败: ' + error.message });
  }
});

// GET /api/admin/analytics/tasks - 任务统计数据
app.get('/api/admin/analytics/tasks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      blocked: 0,
      byPriority: { S: 0, A: 0, B: 0, C: 0 },
      byWuxing: { '火': 0, '金': 0, '木': 0, '水': 0, '土': 0, '未设置': 0 }
    };

    store.tasks.forEach(userTasks => {
      userTasks.forEach(task => {
        if (task.status !== 'deleted') {
          stats.total++;
          switch(task.status) {
            case 'pending': stats.pending++; break;
            case 'in_progress': stats.inProgress++; break;
            case 'completed': stats.completed++; break;
            case 'blocked': stats.blocked++; break;
          }

          // 按优先级统计
          if (task.priority && stats.byPriority[task.priority] !== undefined) {
            stats.byPriority[task.priority]++;
          }

          // 按五行统计
          if (task.wuxing && stats.byWuxing[task.wuxing] !== undefined) {
            stats.byWuxing[task.wuxing]++;
          } else {
            stats.byWuxing['未设置']++;
          }
        }
      });
    });

    // 计算完成率
    stats.completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting task analytics:', error);
    res.status(500).json({ success: false, message: '获取任务统计失败: ' + error.message });
  }
});

// GET /api/admin/analytics/points - 积分流转数据
app.get('/api/admin/analytics/points', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const transactions = await prisma.pointsTransaction.findMany({
      orderBy: { createdAt: 'desc' }
    });

    // 统计总发放和总消耗
    const totalIssued = transactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const totalConsumed = transactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // 统计当前流通
    const users = await prisma.user.findMany({
      select: { pointsBalance: true }
    });
    const totalCirculation = users.reduce((sum, u) => sum + u.pointsBalance, 0);

    // Top交易类型统计
    const typeStats = {};
    transactions.forEach(t => {
      const type = t.transactionType;
      if (!typeStats[type]) {
        typeStats[type] = { count: 0, total: 0 };
      }
      typeStats[type].count++;
      typeStats[type].total += t.amount;
    });

    // 交易类型名称映射
    const typeNameMap = {
      'welcome_bonus': '新人礼包',
      'create_task': '创建任务',
      'complete_task': '完成任务',
      'issue_ticket': '发放门票',
      'invite_bonus': '邀请奖励',
      'admin_adjustment': '管理员调整',
      'referral_bonus': '推荐奖励'
    };

    const topTypes = Object.entries(typeStats)
      .map(([type, stats]) => ({
        type,
        name: typeNameMap[type] || type,
        ...stats
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    await prisma.$disconnect();

    res.json({
      success: true,
      data: {
        totalIssued,
        totalConsumed,
        totalCirculation,
        transactionCount: transactions.length,
        topTypes
      }
    });
  } catch (error) {
    console.error('Error getting points analytics:', error);
    res.status(500).json({ success: false, message: '获取积分数据失败: ' + error.message });
  }
});

// GET /api/admin/analytics/ai-usage - AI使用统计
app.get('/api/admin/analytics/ai-usage', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // 获取AI成员
    const aiMembers = await prisma.user.findMany({
      where: {
        email: { endsWith: '@ai.supercoord.local' }
      },
      select: {
        id: true,
        username: true,
        email: true
      }
    });

    // 统计AI执行任务次数
    let aiTaskCount = 0;
    let aiCompletedTaskCount = 0;
    const aiMemberTaskStats = {};

    aiMembers.forEach(ai => {
      aiMemberTaskStats[ai.id] = { name: ai.username, assigned: 0, completed: 0 };
    });

    store.tasks.forEach(userTasks => {
      userTasks.forEach(task => {
        if (task.assigned_to && aiMemberTaskStats[task.assigned_to]) {
          aiTaskCount++;
          aiMemberTaskStats[task.assigned_to].assigned++;
          if (task.status === 'completed') {
            aiCompletedTaskCount++;
            aiMemberTaskStats[task.assigned_to].completed++;
          }
        }
      });
    });

    // 统计多AI协作次数
    let multiAICount = 0;
    store.tasks.forEach(userTasks => {
      userTasks.forEach(task => {
        if (task.multiAI) {
          multiAICount++;
        }
      });
    });

    // 找出最活跃的AI
    const mostActiveAI = Object.entries(aiMemberTaskStats)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.assigned - a.assigned)[0];

    await prisma.$disconnect();

    res.json({
      success: true,
      data: {
        aiMemberCount: aiMembers.length,
        aiTaskCount,
        aiCompletedTaskCount,
        multiAICount,
        aiMembers: aiMembers.map(ai => ({
          ...ai,
          stats: aiMemberTaskStats[ai.id]
        })),
        mostActiveAI: mostActiveAI || null
      }
    });
  } catch (error) {
    console.error('Error getting AI usage analytics:', error);
    res.status(500).json({ success: false, message: '获取AI使用数据失败: ' + error.message });
  }
});

// GET /api/admin/analytics/wuxing - 五行分布数据
app.get('/api/admin/analytics/wuxing', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    const users = await prisma.user.findMany({
      where: {
        pwpCompleted: true,
        NOT: {
          email: { endsWith: '@ai.supercoord.local' }
        }
      },
      select: { pwpProfile: true }
    });

    // 计算平均五行值
    const wuxingSum = {
      fire: 0,
      metal: 0,
      wood: 0,
      water: 0,
      earth: 0
    };

    users.forEach(user => {
      const wuxing = user.pwpProfile?.wuxing || {};
      Object.keys(wuxingSum).forEach(element => {
        wuxingSum[element] += wuxing[element] || 0;
      });
    });

    const count = users.length || 1;
    const wuxingAverage = {};
    Object.keys(wuxingSum).forEach(element => {
      wuxingAverage[element] = Math.round(wuxingSum[element] / count);
    });

    // 找出团队最强和最弱的五行
    const sorted = Object.entries(wuxingAverage).sort((a, b) => b[1] - a[1]);
    const strongest = sorted[0];
    const weakest = sorted[sorted.length - 1];

    await prisma.$disconnect();

    res.json({
      success: true,
      data: {
        average: wuxingAverage,
        userCount: users.length,
        strongest: { element: strongest[0], value: strongest[1] },
        weakest: { element: weakest[0], value: weakest[1] }
      }
    });
  } catch (error) {
    console.error('Error getting wuxing analytics:', error);
    res.status(500).json({ success: false, message: '获取五行数据失败: ' + error.message });
  }
});

// GET /api/admin/settings - 获取系统配置
app.get('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 返回当前系统配置（从环境变量或默认值）
    res.json({
      success: true,
      settings: {
        points: {
          welcomeBonus: parseInt(process.env.WELCOME_BONUS) || 50,
          createTaskCost: parseInt(process.env.CREATE_TASK_COST) || 10,
          completeTaskReward: parseInt(process.env.COMPLETE_TASK_REWARD) || 20,
          issueTicketCost: parseInt(process.env.ISSUE_TICKET_COST) || 5,
          inviteBonus: parseInt(process.env.INVITE_BONUS) || 25
        },
        tickets: {
          validityDays: parseInt(process.env.TICKET_VALIDITY_DAYS) || 30,
          maxPerUser: parseInt(process.env.MAX_TICKETS_PER_USER) || 10
        },
        ai: {
          apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
          defaultModel: process.env.AI_MODEL || 'claude-sonnet-4-5-20250514',
          maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 1024
        },
        system: {
          pageSize: parseInt(process.env.PAGE_SIZE) || 20,
          sessionTimeout: parseInt(process.env.SESSION_TIMEOUT_DAYS) || 7
        }
      }
    });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ success: false, message: '获取配置失败: ' + error.message });
  }
});

// PUT /api/admin/settings/points - 更新积分配置（注：实际应存入数据库，这里仅返回成功）
app.put('/api/admin/settings/points', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { welcomeBonus, createTaskCost, completeTaskReward, issueTicketCost, inviteBonus } = req.body;

    // 注意：真实环境中应该将配置存入数据库
    // 这里仅做验证和返回
    if (welcomeBonus < 0 || createTaskCost < 0 || completeTaskReward < 0) {
      return res.status(400).json({ success: false, message: '积分值不能为负数' });
    }

    res.json({
      success: true,
      message: '积分配置已更新（需重启服务器生效）',
      settings: { welcomeBonus, createTaskCost, completeTaskReward, issueTicketCost, inviteBonus }
    });
  } catch (error) {
    console.error('Error updating points settings:', error);
    res.status(500).json({ success: false, message: '更新配置失败: ' + error.message });
  }
});

// 批量批准所有候选者
app.post('/api/admin/approve-all-candidates', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const candidates = await getAllCandidates();
    const invitedCandidates = candidates.filter(c => c.aiScore >= 80 || c.status === 'candidate');

    const results = [];
    for (const candidate of invitedCandidates) {
      try {
        const member = await adminApproveCandidate(req.userId, candidate.id);
        results.push({ id: candidate.id, username: candidate.username, success: true });
      } catch (err) {
        results.push({ id: candidate.id, username: candidate.username, success: false, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `已处理 ${results.length} 位候选者`,
      results
    });
  } catch (error) {
    console.error('Error approving all candidates:', error);
    res.status(500).json({ success: false, message: '批量批准失败: ' + error.message });
  }
});

// ========================================
// 健康检查
// ========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    stats: {
      tasks: store.tasks.size,
      members: store.members.size
    }
  });
});

// ========================================

// ============================================
// 五行指挥部 API 路由
// ============================================
const {
  postMission, getMission,
  updateStatus, checkStatus, getAllStatus,
  postHandoff, getHandoff,
  sendSignal, pollSignals,
  saveExperience, searchExperience,
  logTokens, getCostSummary
} = require("./hq");

app.post("/api/hq/mission", postMission);
app.get("/api/hq/mission/:teamId", getMission);
app.post("/api/hq/status", updateStatus);
app.get("/api/hq/status/:teamId", checkStatus);
app.get("/api/hq/status", getAllStatus);
app.post("/api/hq/handoff", postHandoff);
app.get("/api/hq/handoff/:taskId/:phase", getHandoff);
app.post("/api/hq/signal", sendSignal);
app.get("/api/hq/signal/:forTeam", pollSignals);
app.post("/api/hq/experience", saveExperience);
app.get("/api/hq/experience", searchExperience);
app.post("/api/hq/cost", logTokens);
app.get("/api/hq/cost/:taskId", getCostSummary);

// 启动服务器
// ========================================

// 启动时加载数据
loadData();

// 创建HTTP服务器
const server = http.createServer(app);

// 初始化WebSocket服务
const io = initializeWebSocket(server);

// 将io实例附加到app，以便在路由中使用
app.set('io', io);

// 启动服务器
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🌟════════════════════════════════════════════════════🌟');
  console.log('     超协体 · 人机协同MCP服务器 v2.0 启动成功！');
  console.log('🌟════════════════════════════════════════════════════🌟');
  console.log('');
  console.log(`📍 本地访问: http://localhost:${PORT}`);
  console.log(`📍 局域网访问: http://192.168.1.3:${PORT}`);
  console.log(`🌐 Web仪表盘: http://localhost:${PORT}`);
  console.log(`🔗 MCP Manifest: http://192.168.1.3:${PORT}/mcp/manifest`);
  console.log(`💚 Health Check: http://192.168.1.3:${PORT}/health`);
  console.log(`⚡ WebSocket服务: ws://localhost:${PORT}`);
  console.log('');
  console.log('📋 可用工具（10个）:');
  console.log('  1️⃣  register_member       - 注册成员');
  console.log('  2️⃣  create_task           - 创建任务');
  console.log('  3️⃣  find_best_match       - 五行智能匹配');
  console.log('  4️⃣  assign_task           - 分配任务');
  console.log('  5️⃣  get_my_tasks          - 获取我的任务');
  console.log('  6️⃣  update_task_status    - 更新任务状态');
  console.log('  7️⃣  get_team_dashboard    - 团队仪表盘');
  console.log('  8️⃣  check_wuxing_balance  - 五行平衡检查');
  console.log('  9️⃣  list_all_members      - 列出所有成员');
  console.log('  🔟 list_all_tasks         - 列出所有任务');
  console.log('');
  console.log('👥 社区协作模式：邻居可通过局域网连接');
  console.log('   配置地址：http://192.168.1.3:3000/mcp');
  console.log('');
  console.log('⚡ 五行飞轮已启动，等待连接...');
  console.log('');
});
