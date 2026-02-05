# 短邮系统架构 - 基于PWP协议对齐版
## 项目团队管理的移动端决策交流功能

**版本**: v2.0 (PWP对齐版)
**日期**: 2026-02-03
**核心定位**: 短邮 = 项目团队管理中基于PWP协议的移动端决策交流

---

## 第一部分：核心定位重新明确

### 1.1 短邮的本质

```
❌ 错误理解：
├─ 短邮是独立的通讯工具
├─ 短邮是新的数据模型
└─ 短邮独立于项目系统

✅ 正确理解：
├─ 短邮是项目团队管理功能的移动端界面
├─ 短邮基于PWP协议记录协作过程
├─ 短邮与项目主页共享同一数据源
└─ 短邮专注于决策交流场景
```

### 1.2 PWP协议的角色

```
PWP（Personal Workspace Protocol）= 个人工作空间协议

核心职责:
├─ 不可篡改地记录每个人的完整工作过程
├─ 记录任务执行、时间投入、产出质量
├─ 记录协作交互（包括决策交流）⭐
└─ 作为激励分配和学习系统的数据源

短邮在PWP中的位置:
└─ 协作交互记录的一种类型
   └─ 专注于决策交流的移动端呈现
```

### 1.3 与项目主页的关系

```
┌─────────────────────────────────────────┐
│         项目数据（唯一真相源）          │
├─────────────────────────────────────────┤
│                                         │
│  PWP Records (协作记录)                 │
│  ├─ 任务执行记录                        │
│  ├─ 决策交流记录 ⭐ (短邮)             │
│  ├─ 时间投入记录                        │
│  └─ 协作互动记录                        │
│                                         │
└─────────────────────────────────────────┘
         ↓               ↓
    桌面端呈现       移动端呈现
         ↓               ↓
  project-detail.html  shortmail-mvp.html
  (项目主页)          (短邮界面)

  展示相同的数据，只是呈现方式不同
```

---

## 第二部分：重新设计的数据架构

### 2.1 不需要新表，扩展现有PWP记录

**核心思路：短邮不是新表，而是pwp_records的一种类型**

#### 现有 pwp_records 表扩展

```prisma
model PWPRecord {
  id                String   @id @default(uuid())
  userId            String   @map("user_id")
  projectId         String?  @map("project_id")

  // 事件类型（扩展）
  eventType         String   @map("event_type")
  // 现有: task_completed, member_joined, etc.
  // 新增: decision_request | decision_response |
  //       deliverable_submitted | feedback_given | etc.

  // 事件数据（灵活的JSON结构）
  eventData         Json     @map("event_data")
  // 对于决策交流类型，包含:
  // {
  //   "type": "decision_request",
  //   "summary": "UI配色方案选择",
  //   "content": {...},
  //   "attachments": [...],
  //   "toUserId": "xxx",
  //   "protocolType": "DECISION_REQUIRED",
  //   "aiSuggestions": {...},
  //   "response": null,
  //   "conversationId": "xxx"
  // }

  // 关联实体（保持灵活性）
  relatedEntityType String?  @map("related_entity_type")
  relatedEntityId   String?  @map("related_entity_id")

  // 状态（新增）
  status            String?  @default("active")
  // active | responded | archived

  // 时间戳
  occurredAt        DateTime @default(now()) @map("occurred_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  // 关联
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  project           Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([projectId])
  @@index([eventType])
  @@index([status])
  @@index([occurredAt(sort: Desc)])
  @@map("pwp_records")
}
```

### 2.2 决策交流的PWP事件类型定义

```javascript
// 决策交流相关的PWP事件类型

const DecisionEventTypes = {
  // 1. 任务分配
  TASK_ASSIGNMENT_REQUEST: 'task_assignment_request',
  TASK_ASSIGNMENT_RESPONSE: 'task_assignment_response',

  // 2. 交付物提交
  DELIVERABLE_SUBMITTED: 'deliverable_submitted',
  DELIVERABLE_REVIEWED: 'deliverable_reviewed',

  // 3. 反馈请求
  FEEDBACK_REQUESTED: 'feedback_requested',
  FEEDBACK_PROVIDED: 'feedback_provided',

  // 4. 决策请求
  DECISION_REQUESTED: 'decision_requested',
  DECISION_MADE: 'decision_made',

  // 5. 信息同步
  INFO_SHARED: 'info_shared',
  INFO_ACKNOWLEDGED: 'info_acknowledged',
};

// PWP记录数据结构示例
const pwpRecordExample = {
  id: 'uuid',
  userId: 'alice-id', // 发起者
  projectId: 'project-x-id',
  eventType: 'decision_requested',
  eventData: {
    // 决策交流的完整数据
    summary: 'UI配色方案选择',
    content: {
      text: '准备了三个配色方案...',
      richContent: null
    },
    attachments: [
      { type: 'image', url: '...' },
      { type: 'image', url: '...' }
    ],

    // 交流元数据
    toUserId: 'bob-id',
    protocolType: 'DECISION_REQUIRED',
    priority: 'medium',

    // AI辅助
    aiSuggestions: {
      decisionFramework: {
        question: '这个设计稿质量如何？',
        options: ['批准', '需要改', '需要讨论']
      },
      complexity: 5
    },

    // 响应数据
    response: null, // 未响应时为null
    respondedBy: null,
    respondedAt: null,

    // 对话关联
    conversationId: 'conv-uuid',
    replyToId: null // 如果是回复
  },
  relatedEntityType: null,
  relatedEntityId: null,
  status: 'active', // active | responded | archived
  occurredAt: '2026-02-03T12:00:00Z',
  updatedAt: '2026-02-03T12:00:00Z'
};
```

---

## 第三部分：API设计对齐

### 3.1 不是独立的短邮API，而是PWP记录的查询和创建

```javascript
// ========== PWP记录API（扩展决策交流功能）==========

// 1. 创建决策交流记录（即"发送短邮"）
POST /api/pwp/decision-requests
Body: {
  projectId: 'project-x-id',
  toUserId: 'bob-id',
  summary: 'UI配色方案选择',
  content: {...},
  attachments: [...],
  protocolType: 'DECISION_REQUIRED'
}
Response: PWPRecord (eventType: decision_requested)

// 2. 响应决策请求（即"响应短邮"）
POST /api/pwp/decision-responses
Body: {
  requestId: 'pwp-record-id',
  decision: '批准',
  comment: '很好的设计'
}
Response: PWPRecord (eventType: decision_made)

// 3. 获取项目的决策交流记录（即"短邮列表"）
GET /api/pwp/project/:projectId/decisions
Query: {
  userId: 'xxx', // 可选，过滤接收者
  status: 'active', // active | responded | archived
  eventTypes: ['decision_requested', 'task_assignment_request']
}
Response: PWPRecord[]

// 4. 获取用户的待决策事项（即"收件箱"）
GET /api/pwp/user/:userId/pending-decisions
Query: {
  projectId: 'xxx', // 可选，过滤项目
}
Response: PWPRecord[] (where eventData.toUserId = userId and status = active)

// 5. 获取决策对话线程
GET /api/pwp/conversations/:conversationId
Response: PWPRecord[] (ordered by occurredAt)

// 6. 获取项目完整时间线（桌面端和移动端共用）
GET /api/pwp/project/:projectId/timeline
Response: PWPRecord[] (所有类型的记录，包括决策交流)
```

### 3.2 与现有项目API的关系

```javascript
// 现有的项目API保持不变
GET /api/projects/:id

// 项目详情中包含PWP记录的统计
Response: {
  project: {...},
  members: [...],
  tasks: [...],
  pwpSummary: {
    totalRecords: 150,
    decisionRequests: 23, // ⭐ 决策交流数量
    tasksCompleted: 45,
    totalContributions: {...}
  }
}

// 项目主页（桌面端）和短邮（移动端）都查询同样的PWP记录
// 只是展示方式不同
```

---

## 第四部分：前端对齐

### 4.1 桌面端（项目主页）展示决策交流

**project-detail.html 中添加决策交流时间线**

```html
<!-- 项目主页 - 活动时间线标签 -->
<div class="timeline-section">
  <h3>项目活动</h3>

  <!-- 所有PWP记录 -->
  <div class="timeline">
    <!-- 任务完成记录 -->
    <div class="timeline-item">
      <span class="event-type">✅ 任务完成</span>
      <span class="event-user">Alice</span>
      <span class="event-time">2小时前</span>
      <div class="event-details">完成了用户认证模块</div>
    </div>

    <!-- 决策交流记录 ⭐ -->
    <div class="timeline-item">
      <span class="event-type">🎨 决策请求</span>
      <span class="event-user">Bob → Alice</span>
      <span class="event-time">3小时前</span>
      <div class="event-details">
        UI配色方案选择
        <span class="status-badge">待决策</span>
      </div>
    </div>

    <!-- 成员加入记录 -->
    <div class="timeline-item">
      <span class="event-type">👥 成员加入</span>
      <span class="event-user">Charlie</span>
      <span class="event-time">昨天</span>
      <div class="event-details">加入了项目团队</div>
    </div>
  </div>
</div>
```

### 4.2 移动端（短邮）只展示决策交流类记录

**shortmail-mvp.html 只过滤显示决策交流类型的PWP记录**

```javascript
// 移动端短邮 - 只显示决策交流类记录
async function loadShortMails() {
  // 调用同样的PWP API，只是过滤条件不同
  const response = await fetch(`/api/pwp/user/${currentUserId}/pending-decisions`);
  const pwpRecords = await response.json();

  // pwpRecords 就是PWP记录，只是eventType是决策交流相关的
  renderShortMailList(pwpRecords);
}

function renderShortMailList(pwpRecords) {
  pwpRecords.forEach(record => {
    // record.eventData 包含所有短邮需要的数据
    const { summary, content, attachments, toUserId, aiSuggestions } = record.eventData;

    // 渲染短邮卡片
    // ...
  });
}
```

### 4.3 数据一致性保证

```
桌面端和移动端看到的是同一份数据：

PWP Records Table
├─ eventType: decision_requested
├─ eventData: { summary, content, toUserId, ... }
├─ status: active
└─ occurredAt: 2026-02-03 12:00

桌面端查询:
GET /api/pwp/project/xxx/timeline
→ 显示所有类型的PWP记录（包括决策交流）

移动端查询:
GET /api/pwp/user/xxx/pending-decisions
→ 只显示决策交流类型的PWP记录

数据源完全一致 ✓
```

---

## 第五部分：简化的实现方案

### 5.1 数据库迁移（最小改动）

```sql
-- 只需要扩展现有的 pwp_records 表

-- 1. 添加 status 字段
ALTER TABLE pwp_records ADD COLUMN status VARCHAR(50) DEFAULT 'active';

-- 2. 添加索引
CREATE INDEX idx_pwp_status ON pwp_records(status);
CREATE INDEX idx_pwp_event_type ON pwp_records(event_type);

-- 3. 扩展 eventType 枚举（应用层控制）
-- 新增决策交流相关类型：
-- - decision_requested
-- - decision_made
-- - task_assignment_request
-- - task_assignment_response
-- - deliverable_submitted
-- - deliverable_reviewed
-- - feedback_requested
-- - feedback_provided

-- 完成！不需要新建表
```

### 5.2 后端实现（扩展PWP服务）

```javascript
// src/services/pwpService.js（扩展）

class PWPService {
  // 现有功能：记录任务完成、成员加入等
  async recordEvent(userId, eventType, eventData, projectId = null) {
    // 现有实现
  }

  // 新增：创建决策请求（即"发送短邮"）
  async createDecisionRequest({ fromUserId, toUserId, projectId, summary, content, attachments, protocolType }) {
    // AI分析
    const aiSuggestions = await this.aiRouterService.analyze(summary, content);

    // 生成conversationId
    const conversationId = uuidv4();

    // 创建PWP记录
    return await this.recordEvent(
      fromUserId,
      'decision_requested',
      {
        summary,
        content,
        attachments,
        toUserId,
        protocolType,
        aiSuggestions,
        conversationId,
        response: null,
        respondedBy: null,
        respondedAt: null
      },
      projectId
    );
  }

  // 新增：响应决策请求（即"响应短邮"）
  async respondToDecision(requestId, responderId, decision, comment) {
    // 1. 更新原请求记录的status为responded
    await prisma.pWPRecord.update({
      where: { id: requestId },
      data: {
        status: 'responded',
        eventData: {
          ...original.eventData,
          response: decision,
          respondedBy: responderId,
          respondedAt: new Date()
        }
      }
    });

    // 2. 创建响应记录
    return await this.recordEvent(
      responderId,
      'decision_made',
      {
        requestId,
        decision,
        comment,
        conversationId: original.eventData.conversationId
      },
      original.projectId
    );
  }

  // 新增：获取用户的待决策事项
  async getPendingDecisions(userId) {
    return await prisma.pWPRecord.findMany({
      where: {
        eventType: {
          in: ['decision_requested', 'task_assignment_request', 'feedback_requested']
        },
        status: 'active',
        eventData: {
          path: ['toUserId'],
          equals: userId
        }
      },
      orderBy: { occurredAt: 'desc' },
      include: {
        user: true,
        project: true
      }
    });
  }

  // 新增：获取对话线程
  async getConversation(conversationId) {
    return await prisma.pWPRecord.findMany({
      where: {
        eventData: {
          path: ['conversationId'],
          equals: conversationId
        }
      },
      orderBy: { occurredAt: 'asc' },
      include: {
        user: true
      }
    });
  }
}
```

### 5.3 API路由（基于PWP）

```javascript
// src/routes/pwp.js（扩展）

// ========== 决策交流相关API ==========

// 创建决策请求
router.post('/decision-requests', authenticateToken, async (req, res) => {
  const { projectId, toUserId, summary, content, attachments, protocolType } = req.body;

  const record = await pwpService.createDecisionRequest({
    fromUserId: req.userId,
    toUserId,
    projectId,
    summary,
    content,
    attachments,
    protocolType
  });

  res.json({ success: true, record });
});

// 响应决策请求
router.post('/decision-responses', authenticateToken, async (req, res) => {
  const { requestId, decision, comment } = req.body;

  const record = await pwpService.respondToDecision(
    requestId,
    req.userId,
    decision,
    comment
  );

  res.json({ success: true, record });
});

// 获取待决策事项（即"短邮收件箱"）
router.get('/user/:userId/pending-decisions', authenticateToken, async (req, res) => {
  const records = await pwpService.getPendingDecisions(req.params.userId);
  res.json({ success: true, records });
});

// 获取项目的决策交流记录
router.get('/project/:projectId/decisions', authenticateToken, async (req, res) => {
  const records = await pwpService.getProjectDecisions(req.params.projectId, req.query);
  res.json({ success: true, records });
});

// 获取对话线程
router.get('/conversations/:conversationId', authenticateToken, async (req, res) => {
  const records = await pwpService.getConversation(req.params.conversationId);
  res.json({ success: true, records });
});

// ========== 现有PWP API保持不变 ==========
router.get('/user/:userId/timeline', ...);
router.get('/project/:projectId/timeline', ...);
```

---

## 第六部分：开发计划对齐

### 6.1 简化后的开发任务

```
Phase 1: 数据库和后端（1周）
├─ 扩展pwp_records表（添加status字段和索引）
├─ 扩展PWPService（决策交流方法）
├─ 新增PWP API路由（决策交流相关）
└─ AI路由服务（决策框架生成）

Phase 2: 移动端前端（1.5周）
├─ shortmail-inbox（基于PWP记录）
├─ shortmail-detail（展示PWP记录详情）
├─ shortmail-compose（创建PWP决策请求）
└─ shortmail-chain（PWP对话线程）

Phase 3: 桌面端集成（0.5周）
├─ project-detail添加决策交流时间线
├─ dashboard添加待决策提示
└─ 数据一致性验证

Phase 4: 测试和优化（1周）
├─ 端到端测试
├─ 数据一致性测试
└─ 性能优化

━━━━━━━━━━━━━━━━━━━━━━━━━━━
总计: 4周（而非原计划的5周）⚡
```

### 6.2 核心优势

```
✅ 不需要新表，复用pwp_records
✅ 数据天然一致（桌面端和移动端）
✅ 符合PWP协议设计理念
✅ 与项目管理深度整合
✅ 更简单的数据模型
✅ 更快的开发周期
```

---

## 第七部分：关键概念对齐表

| 之前的理解 | 对齐后的理解 |
|-----------|-------------|
| 短邮是独立的通讯工具 | 短邮是项目团队管理的移动端决策交流功能 |
| short_mails 独立表 | pwp_records 的决策交流类型记录 |
| 独立的短邮API | PWP API的决策交流扩展 |
| 与项目系统松耦合 | 与项目系统紧密集成 |
| 移动端独有数据 | 桌面端和移动端共享PWP数据 |

---

## 总结

### 核心理解

```
短邮 ≠ 新产品
短邮 = 项目团队管理中基于PWP协议的移动端决策交流界面

数据层: pwp_records (统一数据源)
     ↓
业务层: PWPService (决策交流方法扩展)
     ↓
展现层: 桌面端（项目时间线）+ 移动端（短邮界面）
```

### 立即可以开始

```bash
# 1. 扩展pwp_records表
ALTER TABLE pwp_records ADD COLUMN status VARCHAR(50) DEFAULT 'active';

# 2. 扩展PWPService
# 添加决策交流相关方法

# 3. 创建移动端界面
# 基于PWP记录渲染短邮列表

# 4周后完成MVP ⚡
```

---

**【五行属性】**：⚙️金（架构对齐） + 🌳木（准备实现）
**【道法术势器】**：道（定位清晰）→ 法（架构对齐）
**【心法】**：明道以定方向，立法以聚结构
