const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

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
  requireMember
} = require('./aiGatekeeper');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, '../data/store.json');

// 中间件
app.use(cors());
app.use(bodyParser.json());

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

// 注册
app.post('/api/auth/register', registerValidation, register);

// 登录
app.post('/api/auth/login', loginValidation, login);

// 获取当前用户信息（需要认证）
app.get('/api/auth/me', authenticateToken, getCurrentUser);

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
  const taskId = uuidv4();
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const userTasks = getUserStore('tasks', userId);
  userTasks.set(taskId, task);
  saveData();

  return {
    success: true,
    task_id: taskId,
    message: `✅ 任务创建成功：${args.title}`,
    task: task
  };
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
  saveData();

  return {
    success: true,
    message: `✅ 任务《${task.title}》状态已更新：${oldStatus} → ${args.status}`,
    task: task,
    assigned_to: task.assigned_to ? userMembers.get(task.assigned_to)?.name : '未分配'
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
// 启动服务器
// ========================================

// 启动时加载数据
loadData();

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🌟════════════════════════════════════════════════════🌟');
  console.log('     超协体 · 人机协同MCP服务器 v1.0 启动成功！');
  console.log('🌟════════════════════════════════════════════════════🌟');
  console.log('');
  console.log(`📍 本地访问: http://localhost:${PORT}`);
  console.log(`📍 局域网访问: http://192.168.1.3:${PORT}`);
  console.log(`🌐 Web仪表盘: http://localhost:${PORT}`);
  console.log(`🔗 MCP Manifest: http://192.168.1.3:${PORT}/mcp/manifest`);
  console.log(`💚 Health Check: http://192.168.1.3:${PORT}/health`);
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
