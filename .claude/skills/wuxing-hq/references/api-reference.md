# 五行指挥部 API 参考文档

## 基础信息

| 环境 | URL |
|------|-----|
| 本地 | `http://localhost:3000` |
| 线上 | `https://supercoordination-mcp-production.up.railway.app` |

所有请求需要 `Content-Type: application/json`。

---

## 1. 任务管理 (Mission)

### POST /api/hq/mission — 发布任务指令

向指定团队下发任务。

**请求体**:
```json
{
  "teamId": "team-b",         // 必填。目标团队 ID
  "content": "实现用户登录API", // 必填。任务描述（支持Markdown）
  "phase": 2,                  // 选填。阶段编号，默认1
  "taskId": "uuid"             // 选填。任务组ID，不传则自动生成
}
```

**响应**:
```json
{
  "missionId": "uuid",  // 本次指令ID
  "taskId": "uuid",     // 任务组ID
  "status": "posted"
}
```

### GET /api/hq/mission/:teamId — 领取任务

团队领取最新的待处理任务。领取后状态从 `pending` 变为 `accepted`。

**响应**:
```json
{
  "missionId": "uuid",
  "content": "实现用户登录API",
  "phase": 2,
  "taskId": "uuid"
}
```
返回 `null` 表示没有待处理任务。

---

## 2. 状态同步 (Status)

### POST /api/hq/status — 更新团队状态

**请求体**:
```json
{
  "teamId": "team-b",           // 必填
  "status": "working",          // 必填。idle|working|done|blocked|error
  "progress": 60,               // 选填。0-100进度
  "currentTask": "编写登录逻辑" // 选填。当前子任务描述
}
```

**响应**: `{ "updated": true }`

### GET /api/hq/status/:teamId — 查询单个团队状态

**响应**:
```json
{
  "id": "uuid",
  "teamId": "team-b",
  "status": "working",
  "progress": 60,
  "currentTask": "编写登录逻辑",
  "updatedAt": "2026-02-06T..."
}
```

### GET /api/hq/status — 查询所有团队状态

**响应**:
```json
{
  "teams": [
    { "teamId": "team-a", "status": "done", "progress": 100 },
    { "teamId": "team-b", "status": "working", "progress": 60 },
    { "teamId": "team-c", "status": "idle", "progress": 0 }
  ]
}
```

---

## 3. 衔接物 (Handoff)

### POST /api/hq/handoff — 提交阶段衔接物

当一个团队完成工作后，提交其产出物供下游团队使用。

**请求体**:
```json
{
  "taskId": "uuid",                // 必填。任务组ID
  "fromTeam": "team-a",           // 必填。来源团队
  "phase": 1,                     // 必填。阶段编号
  "artifactType": "architecture_doc", // 必填。产出物类型
  "summary": "设计了3张新表...",    // 必填。产出物摘要
  "filePaths": "src/schema.prisma,docs/api.md" // 选填。相关文件路径
}
```

**artifactType 常用值**:
- `architecture_doc` — 架构文档
- `prisma_schema` — 数据模型
- `api_contract` — API契约
- `source_code` — 源代码
- `test_suite` — 测试套件
- `review_report` — 审查报告
- `documentation` — 文档
- `deploy_config` — 部署配置
- `performance_report` — 性能报告

**响应**: `{ "handoffId": "uuid" }`

### GET /api/hq/handoff/:taskId/:phase — 获取衔接物

获取指定任务在指定阶段的最新衔接物。

**响应**:
```json
{
  "id": "uuid",
  "taskId": "uuid",
  "fromTeam": "team-a",
  "phase": 1,
  "artifactType": "architecture_doc",
  "summary": "设计了3张新表...",
  "filePaths": "src/schema.prisma",
  "createdAt": "2026-02-06T..."
}
```

---

## 4. 信号通信 (Signal)

### POST /api/hq/signal — 发送信号

**请求体**:
```json
{
  "fromTeam": "team-c",      // 必填
  "toTeam": "hq",            // 选填，默认"hq"
  "signalType": "bug_found", // 必填
  "message": "登录API缺少参数校验" // 选填
}
```

**signalType 值**:
- `done` — 任务完成
- `blocked` — 被阻塞
- `need_review` — 需要审查
- `bug_found` — 发现Bug
- `question` — 有疑问
- `warning` — 警告（如超时、超预算）

**响应**: `{ "signalId": "uuid" }`

### GET /api/hq/signal/:forTeam — 轮询信号

获取发给指定团队的未读信号，获取后自动标记为已读。

**响应**:
```json
{
  "signals": [
    {
      "id": "uuid",
      "fromTeam": "team-c",
      "toTeam": "hq",
      "signalType": "bug_found",
      "message": "登录API缺少参数校验",
      "createdAt": "2026-02-06T..."
    }
  ]
}
```

---

## 5. 经验系统 (Experience)

### POST /api/hq/experience — 保存经验

任务完成后记录经验，供未来参考。

**请求体**:
```json
{
  "taskId": "uuid",                      // 必填
  "taskName": "实现用户登录系统",         // 必填
  "classification": "feature",           // 必填。feature|bugfix|refactor|docs|infra
  "complexity": "medium",                // 必填。low|medium|high|critical
  "teamSequence": ["team-a","team-b","team-c","team-d"], // 选填
  "totalTokens": 45000,                  // 选填
  "totalDuration": 1800,                 // 选填。秒
  "totalCost": 0.135,                    // 选填。USD
  "firstPassRate": 0.85,                 // 选填。一次通过率
  "lessonsLearned": ["先写测试再写代码"], // 选填
  "tags": "login auth jwt feature"       // 选填。空格分隔
}
```

**响应**: `{ "experienceId": "uuid" }`

### GET /api/hq/experience — 搜索经验

**查询参数**:
- `tags` — 标签关键词（模糊匹配）
- `classification` — 分类
- `complexity` — 复杂度
- `limit` — 返回数量（默认5）

**示例**: `GET /api/hq/experience?tags=login&classification=feature&limit=3`

**响应**:
```json
{
  "records": [
    {
      "id": "uuid",
      "taskName": "实现用户登录系统",
      "classification": "feature",
      "complexity": "medium",
      "teamSequence": "[\"team-a\",\"team-b\",\"team-c\"]",
      "lessonsLearned": "[\"先写测试再写代码\"]",
      "tags": "login auth jwt feature",
      "totalTokens": 45000,
      "totalCost": 0.135,
      "createdAt": "2026-02-06T..."
    }
  ]
}
```

---

## 6. 成本追踪 (Cost)

### POST /api/hq/cost — 记录Token消耗

**请求体**:
```json
{
  "taskId": "uuid",        // 必填
  "teamId": "team-b",      // 必填
  "phase": 2,              // 选填，默认1
  "tokenCount": 15000,     // 必填
  "model": "claude-sonnet-4-5" // 选填
}
```

**自动计算费用**（内置定价表）:
- claude-opus-4-5: $0.015/1K tokens
- claude-sonnet-4-5: $0.003/1K tokens
- claude-haiku-4-5: $0.00025/1K tokens

**响应**: `{ "logId": "uuid", "estimatedCost": 0.045 }`

### GET /api/hq/cost/:taskId — 获取任务成本汇总

**响应**:
```json
{
  "totalTokens": 85000,
  "totalCost": 0.255,
  "breakdown": [
    { "teamId": "team-a", "phase": 1, "tokenCount": 20000, "model": "claude-sonnet-4-5", "estimatedCost": 0.06 },
    { "teamId": "team-b", "phase": 2, "tokenCount": 50000, "model": "claude-sonnet-4-5", "estimatedCost": 0.15 },
    { "teamId": "team-c", "phase": 3, "tokenCount": 15000, "model": "claude-sonnet-4-5", "estimatedCost": 0.045 }
  ],
  "modelDistribution": {
    "claude-sonnet-4-5": 85000
  }
}
```
