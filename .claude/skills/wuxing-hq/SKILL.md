# 五行指挥部 (Wuxing HQ) - Claude Code Skill

## 概述

五行指挥部是超协体的多Agent协作调度系统。它通过一个中央指挥官（HQ）协调5个专业作战团队，以流水线方式完成复杂的软件工程任务。

**触发条件**：当用户提到"五行指挥部"、"启动指挥部"、"多Agent协作"、"团队协作开发"时触发此Skill。

## 核心架构

```
          ┌─────────────┐
          │   指挥官 HQ   │
          │  (你，Claude)  │
          └──────┬──────┘
                 │ 通过 REST API 调度
    ┌────────┬───┴───┬────────┬────────┐
    ▼        ▼       ▼        ▼        ▼
 Team-A   Team-B  Team-C   Team-D   Team-E
  木·规划   火·开发  土·测试   金·文档   水·集成
```

## API 基础信息

- **本地服务器**: `http://localhost:3000`
- **线上服务器**: `https://supercoordination-mcp-production.up.railway.app`
- **API 前缀**: `/api/hq/`

使用哪个服务器取决于当前环境。优先使用本地服务器，如果不可用则用线上服务器。

## 指挥官工作流程

### 第一步：接收任务并分类

收到用户任务后，按以下维度分类：

| 分类 | 描述 | 团队调度 |
|------|------|---------|
| feature | 新功能开发 | A → B → C → D → E |
| bugfix | 修复缺陷 | C → B → C → D |
| refactor | 代码重构 | A → B → C → E |
| docs | 文档任务 | D（独立） |
| infra | 基础设施 | A → E → C |

### 第二步：分阶段派发任务

使用 `POST /api/hq/mission` 向团队下发指令：

```bash
curl -X POST ${SERVER}/api/hq/mission \
  -H "Content-Type: application/json" \
  -d '{
    "teamId": "team-a",
    "content": "分析需求并输出架构设计文档，包含数据模型、API设计、组件划分",
    "phase": 1,
    "taskId": "task-uuid-here"
  }'
```

### 第三步：监控状态

轮询各团队状态：
```bash
curl ${SERVER}/api/hq/status
```

### 第四步：传递衔接物

当前一个团队完成后，提交衔接物给下一个团队：
```bash
curl -X POST ${SERVER}/api/hq/handoff \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task-uuid",
    "fromTeam": "team-a",
    "phase": 1,
    "artifactType": "architecture_doc",
    "summary": "数据模型已设计完成，包含3张新表..."
  }'
```

### 第五步：记录经验

任务完成后保存经验：
```bash
curl -X POST ${SERVER}/api/hq/experience \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task-uuid",
    "taskName": "实现信任评分系统",
    "classification": "feature",
    "complexity": "medium",
    "teamSequence": ["team-a", "team-b", "team-c", "team-d"],
    "lessonsLearned": ["Prisma schema需要先设计再写代码"],
    "tags": "feature prisma trust-score"
  }'
```

## 五行团队定义

### Team-A · 木 · 架构规划组
- **职责**: 需求分析、架构设计、数据模型、API设计
- **输出物**: 架构文档、Prisma Schema、API契约
- **模型建议**: claude-sonnet-4-5（平衡速度与质量）

### Team-B · 火 · 核心开发组
- **职责**: 功能实现、业务逻辑、核心代码编写
- **输出物**: 源代码文件、路由、中间件
- **模型建议**: claude-sonnet-4-5（快速高质量编码）

### Team-C · 土 · 测试质量组
- **职责**: 测试用例设计、代码审查、Bug验证
- **输出物**: 测试文件、审查报告、Bug列表
- **模型建议**: claude-sonnet-4-5

### Team-D · 金 · 文档规范组
- **职责**: API文档、README、注释规范、CHANGELOG
- **输出物**: Markdown文档、JSDoc注释
- **模型建议**: claude-haiku-4-5（文档任务成本敏感）

### Team-E · 水 · 集成优化组
- **职责**: 性能优化、部署配置、CI/CD、监控
- **输出物**: Dockerfile、配置文件、性能报告
- **模型建议**: claude-sonnet-4-5

## 信号类型

团队间通过信号通信：

| 信号类型 | 含义 | 示例 |
|---------|------|------|
| `done` | 阶段完成 | Team-A完成架构设计 |
| `blocked` | 被阻塞 | Team-B缺少API设计文档 |
| `need_review` | 请求审查 | Team-B请求Team-C审查代码 |
| `bug_found` | 发现缺陷 | Team-C发现逻辑错误 |
| `question` | 有疑问 | Team-B对需求有疑问 |

## 成本控制

每次API调用记录Token消耗：
```bash
curl -X POST ${SERVER}/api/hq/cost \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task-uuid",
    "teamId": "team-b",
    "phase": 2,
    "tokenCount": 15000,
    "model": "claude-sonnet-4-5"
  }'
```

查看任务总成本：
```bash
curl ${SERVER}/api/hq/cost/task-uuid
```

## 经验查询

开始新任务前，先查询相似经验：
```bash
curl "${SERVER}/api/hq/experience?tags=feature&classification=feature&limit=3"
```

## 关键原则

1. **阶段门控**: 每个阶段必须有明确的衔接物（handoff），下一个团队才能开始
2. **信号驱动**: 团队间不直接通信，全部通过HQ中转
3. **成本意识**: 每个阶段记录Token消耗，复杂度低的任务用更便宜的模型
4. **经验复用**: 每次任务结束后记录经验，下次遇到相似任务参考历史
5. **五行平衡**: 确保5个团队的工作量大致均衡，不过度依赖某一个团队

## 参考文件

- `references/api-reference.md` - 完整API文档
- `references/combat-teams/team-a-wood.md` - Team-A 详细配置
- `references/combat-teams/team-b-fire.md` - Team-B 详细配置
- `references/combat-teams/team-c-earth.md` - Team-C 详细配置
- `references/combat-teams/team-d-metal.md` - Team-D 详细配置
- `references/combat-teams/team-e-water.md` - Team-E 详细配置
