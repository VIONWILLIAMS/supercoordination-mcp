const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, '../data/store.json');

// 中间件
app.use(cors());
app.use(bodyParser.json());

// 静态文件服务（Web仪表盘）
app.use(express.static(path.join(__dirname, '../public')));

// ========================================
// 数据存储（JSON持久化）
// ========================================

const store = {
  tasks: new Map(),
  members: new Map(),
  resources: new Map()
};

// 保存数据到JSON文件
function saveData() {
  try {
    const data = {
      tasks: Array.from(store.tasks.entries()),
      members: Array.from(store.members.entries()),
      resources: Array.from(store.resources.entries()),
      saved_at: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log('[数据持久化] 已保存:', data.tasks.length, '个任务,', data.members.length, '个成员');
  } catch (error) {
    console.error('[数据持久化] 保存失败:', error.message);
  }
}

// 从JSON文件加载数据
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      store.tasks = new Map(data.tasks);
      store.members = new Map(data.members);
      store.resources = new Map(data.resources);
      console.log('[数据持久化] 已加载:', data.tasks.length, '个任务,', data.members.length, '个成员');
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
// MCP协议端点
// ========================================

// 0. MCP服务发现端点（根端点）
app.get('/mcp', (req, res) => {
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

// 2. MCP工具调用端点
app.post('/mcp/tools/call', async (req, res) => {
  const { name, arguments: args } = req.body;

  console.log('[MCP] Tool call:', name);  // 调试日志
  console.log('[MCP] Arguments:', args);  // 调试日志

  try {
    let result;

    switch (name) {
      case 'register_member':
        result = await registerMember(args);
        break;
      case 'create_task':
        result = await createTask(args);
        break;
      case 'find_best_match':
        result = await findBestMatch(args);
        break;
      case 'assign_task':
        result = await assignTask(args);
        break;
      case 'get_my_tasks':
        result = await getMyTasks(args);
        break;
      case 'update_task_status':
        result = await updateTaskStatus(args);
        break;
      case 'get_team_dashboard':
        result = await getTeamDashboard(args);
        break;
      case 'check_wuxing_balance':
        result = await checkWuxingBalance(args);
        break;
      case 'list_all_members':
        result = await listAllMembers(args);
        break;
      case 'list_all_tasks':
        result = await listAllTasks(args);
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

async function registerMember(args) {
  const memberId = uuidv4();
  const member = {
    id: memberId,
    name: args.name,
    skills: args.skills || [],
    wuxing_profile: args.wuxing_profile || {
      火: 20, 金: 20, 木: 20, 水: 20, 土: 20
    },
    status: 'active',
    created_at: new Date().toISOString()
  };

  store.members.set(memberId, member);
  saveData(); // 持久化保存

  return {
    success: true,
    member_id: memberId,
    message: `✅ 成员 ${args.name} 注册成功！`,
    member: member
  };
}

async function createTask(args) {
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  store.tasks.set(taskId, task);
  saveData(); // 持久化保存

  return {
    success: true,
    task_id: taskId,
    message: `✅ 任务创建成功：${args.title}`,
    task: task
  };
}

async function findBestMatch(args) {
  const task = store.tasks.get(args.task_id);
  if (!task) {
    throw new Error('❌ 任务不存在');
  }

  const strategy = args.strategy || 'hybrid';
  const members = Array.from(store.members.values());

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
      const memberTasks = Array.from(store.tasks.values())
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

async function assignTask(args) {
  const task = store.tasks.get(args.task_id);
  if (!task) {
    throw new Error('❌ 任务不存在');
  }

  let assignedMember;

  if (args.member_id) {
    // 手动指定成员
    assignedMember = store.members.get(args.member_id);
    if (!assignedMember) {
      throw new Error('❌ 指定成员不存在');
    }
  } else {
    // 智能匹配最佳成员
    const match = await findBestMatch({ task_id: args.task_id, strategy: 'hybrid' });
    if (!match.best_match) {
      throw new Error('❌ 未找到合适的成员');
    }
    assignedMember = store.members.get(match.best_match.member_id);
  }

  task.assigned_to = assignedMember.id;
  task.status = 'in_progress';
  task.updated_at = new Date().toISOString();
  saveData(); // 持久化保存

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

async function getMyTasks(args) {
  const member = store.members.get(args.member_id);
  if (!member) {
    throw new Error('❌ 成员不存在');
  }

  const tasks = Array.from(store.tasks.values())
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

async function updateTaskStatus(args) {
  const task = store.tasks.get(args.task_id);
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
  saveData(); // 持久化保存

  return {
    success: true,
    message: `✅ 任务《${task.title}》状态已更新：${oldStatus} → ${args.status}`,
    task: task,
    assigned_to: task.assigned_to ? store.members.get(task.assigned_to)?.name : '未分配'
  };
}

async function getTeamDashboard(args) {
  const view = args.view || 'overview';
  const tasks = Array.from(store.tasks.values());
  const members = Array.from(store.members.values());

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
          assigned_to: store.members.get(t.assigned_to)?.name || '未分配',
          blocked_since: t.updated_at
        }));
      break;
  }

  return dashboard;
}

async function checkWuxingBalance(args) {
  const timeframe = args.timeframe || 'week';
  const tasks = Array.from(store.tasks.values());

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

async function listAllMembers(args) {
  const members = Array.from(store.members.values()).map(m => ({
    id: m.id,
    name: m.name,
    skills: m.skills,
    wuxing_profile: m.wuxing_profile,
    task_count: Array.from(store.tasks.values()).filter(t => t.assigned_to === m.id && t.status !== 'completed').length
  }));

  return {
    success: true,
    total_members: members.length,
    members: members
  };
}

async function listAllTasks(args) {
  const statusFilter = args.status || 'all';

  let tasks = Array.from(store.tasks.values());

  if (statusFilter !== 'all') {
    tasks = tasks.filter(t => t.status === statusFilter);
  }

  // 添加成员名称
  tasks = tasks.map(t => ({
    ...t,
    assigned_to_name: t.assigned_to ? store.members.get(t.assigned_to)?.name : '未分配'
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
