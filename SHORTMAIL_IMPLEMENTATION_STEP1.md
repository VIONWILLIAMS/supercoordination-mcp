# 短邮系统实施 - 第一步
## 扩展PWP Records + 核心服务

**版本**: v1.0
**预计时间**: 1天
**目标**: 完成数据库扩展和PWP服务扩展，实现第一个决策交流API

---

## 🎯 第一步目标

完成以下3个任务：
1. ✅ 扩展 `pwp_records` 表（添加status字段）
2. ✅ 扩展 `PWPService`（决策交流方法）
3. ✅ 测试第一个API（创建决策请求）

---

## 任务1: 扩展数据库Schema

### 1.1 修改 `prisma/schema.prisma`

找到 `PWPRecord` 模型，添加 `status` 字段：

```prisma
model PWPRecord {
  id                String   @id @default(uuid())
  userId            String   @map("user_id")
  projectId         String?  @map("project_id")

  eventType         String   @map("event_type")
  eventData         Json     @map("event_data")

  relatedEntityType String?  @map("related_entity_type")
  relatedEntityId   String?  @map("related_entity_id")

  // ⭐ 新增字段
  status            String?  @default("active") @map("status")
  // active | responded | archived

  occurredAt        DateTime @default(now()) @map("occurred_at")
  // ⭐ 新增字段
  updatedAt         DateTime @updatedAt @map("updated_at")

  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  project           Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([projectId])
  @@index([eventType])
  // ⭐ 新增索引
  @@index([status])
  @@index([occurredAt(sort: Desc)])
  @@map("pwp_records")
}
```

### 1.2 运行数据库迁移

```bash
# 生成迁移
npx prisma migrate dev --name add_pwp_decision_support

# 重新生成Prisma Client
npx prisma generate
```

### 1.3 验证迁移成功

```bash
# 检查数据库表结构
npx prisma studio
# 打开后查看 pwp_records 表，确认 status 和 updatedAt 字段存在
```

---

## 任务2: 扩展PWP服务

### 2.1 创建决策交流服务

创建新文件 `src/services/decisionService.js`：

```javascript
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

class DecisionService {
  /**
   * 创建决策请求（即"发送短邮"）
   */
  async createDecisionRequest({
    fromUserId,
    toUserId,
    projectId,
    summary,
    content = null,
    attachments = [],
    protocolType = 'GENERAL'
  }) {
    // 1. 生成conversationId
    const conversationId = uuidv4();

    // 2. AI分析（简化版，未来可扩展）
    const aiSuggestions = this._generateAISuggestions(protocolType, summary);

    // 3. 创建PWP记录
    const record = await prisma.pWPRecord.create({
      data: {
        userId: fromUserId,
        projectId,
        eventType: this._getEventType(protocolType),
        status: 'active',
        eventData: {
          // 决策交流的完整数据
          summary,
          content,
          attachments,
          toUserId,
          protocolType,
          conversationId,

          // AI辅助
          aiSuggestions,
          complexity: this._calculateComplexity(summary, content),

          // 响应数据（初始为空）
          response: null,
          respondedBy: null,
          respondedAt: null
        }
      },
      include: {
        user: true,
        project: true
      }
    });

    return record;
  }

  /**
   * 响应决策请求（即"响应短邮"）
   */
  async respondToDecision(requestId, responderId, decision, comment = null) {
    // 1. 获取原请求
    const request = await prisma.pWPRecord.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      throw new Error('决策请求不存在');
    }

    // 2. 验证响应者
    if (request.eventData.toUserId !== responderId) {
      throw new Error('无权响应此决策请求');
    }

    // 3. 更新原请求状态
    await prisma.pWPRecord.update({
      where: { id: requestId },
      data: {
        status: 'responded',
        eventData: {
          ...request.eventData,
          response: decision,
          responseComment: comment,
          respondedBy: responderId,
          respondedAt: new Date().toISOString()
        }
      }
    });

    // 4. 创建响应记录
    const responseRecord = await prisma.pWPRecord.create({
      data: {
        userId: responderId,
        projectId: request.projectId,
        eventType: this._getResponseEventType(request.eventData.protocolType),
        status: 'active',
        eventData: {
          requestId,
          decision,
          comment,
          conversationId: request.eventData.conversationId
        }
      },
      include: {
        user: true,
        project: true
      }
    });

    return responseRecord;
  }

  /**
   * 获取用户的待决策事项（即"短邮收件箱"）
   */
  async getPendingDecisions(userId, projectId = null) {
    const where = {
      eventType: {
        in: [
          'decision_requested',
          'task_assignment_requested',
          'deliverable_submitted',
          'feedback_requested'
        ]
      },
      status: 'active'
    };

    // 使用Prisma的JSON查询
    const records = await prisma.$queryRaw`
      SELECT * FROM pwp_records
      WHERE event_type IN ('decision_requested', 'task_assignment_requested', 'deliverable_submitted', 'feedback_requested')
        AND status = 'active'
        AND event_data->>'toUserId' = ${userId}
        ${projectId ? prisma.Prisma.sql`AND project_id = ${projectId}` : prisma.Prisma.empty}
      ORDER BY occurred_at DESC
    `;

    return records;
  }

  /**
   * 获取对话线程
   */
  async getConversation(conversationId) {
    const records = await prisma.$queryRaw`
      SELECT * FROM pwp_records
      WHERE event_data->>'conversationId' = ${conversationId}
      ORDER BY occurred_at ASC
    `;

    return records;
  }

  /**
   * 获取项目的决策交流记录
   */
  async getProjectDecisions(projectId, filters = {}) {
    const where = {
      projectId,
      eventType: {
        in: [
          'decision_requested',
          'decision_made',
          'task_assignment_requested',
          'task_assignment_responded',
          'deliverable_submitted',
          'deliverable_reviewed',
          'feedback_requested',
          'feedback_provided'
        ]
      }
    };

    if (filters.status) {
      where.status = filters.status;
    }

    const records = await prisma.pWPRecord.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      include: {
        user: true,
        project: true
      }
    });

    return records;
  }

  // ========== 私有辅助方法 ==========

  _getEventType(protocolType) {
    const mapping = {
      TASK_ASSIGNMENT: 'task_assignment_requested',
      DELIVERABLE_SUBMISSION: 'deliverable_submitted',
      FEEDBACK_REQUEST: 'feedback_requested',
      DECISION_REQUIRED: 'decision_requested',
      GENERAL: 'decision_requested'
    };
    return mapping[protocolType] || 'decision_requested';
  }

  _getResponseEventType(protocolType) {
    const mapping = {
      TASK_ASSIGNMENT: 'task_assignment_responded',
      DELIVERABLE_SUBMISSION: 'deliverable_reviewed',
      FEEDBACK_REQUEST: 'feedback_provided',
      DECISION_REQUIRED: 'decision_made',
      GENERAL: 'decision_made'
    };
    return mapping[protocolType] || 'decision_made';
  }

  _generateAISuggestions(protocolType, summary) {
    // 简化版AI建议，基于协议类型
    const frameworks = {
      DELIVERABLE_SUBMISSION: {
        question: '这个交付物质量如何？',
        options: ['批准', '需要改', '需要讨论'],
        tips: '类似项目一次通过率: 88%'
      },
      TASK_ASSIGNMENT: {
        question: '是否接受此任务？',
        options: ['接受', '拒绝', '需要讨论'],
        tips: '建议先评估工作量'
      },
      FEEDBACK_REQUEST: {
        question: '你的反馈是？',
        options: ['同意', '不同意', '需要讨论'],
        tips: '提供建设性意见'
      },
      DECISION_REQUIRED: {
        question: '你的决策是？',
        options: ['方案A', '方案B', '需要讨论'],
        tips: '考虑长期影响'
      },
      GENERAL: {
        question: '请做出响应',
        options: ['确认', '需要讨论'],
        tips: null
      }
    };

    return frameworks[protocolType] || frameworks.GENERAL;
  }

  _calculateComplexity(summary, content) {
    let score = 0;

    // 文本长度
    if (summary && summary.length > 100) score += 3;
    if (content && JSON.stringify(content).length > 500) score += 2;

    // 关键词
    const complexKeywords = ['复杂', '权衡', '多个方案', '决策', '选择'];
    const text = (summary || '') + ' ' + JSON.stringify(content || '');
    complexKeywords.forEach(keyword => {
      if (text.includes(keyword)) score += 1;
    });

    return Math.min(score, 10);
  }
}

module.exports = new DecisionService();
```

---

## 任务3: 创建API端点

### 3.1 扩展PWP路由

编辑 `src/pwp.js`（如果不存在则创建）：

```javascript
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./middleware/auth');
const decisionService = require('./services/decisionService');

// ========== 决策交流API ==========

/**
 * 创建决策请求（即"发送短邮"）
 */
router.post('/decision-requests', authenticateToken, async (req, res, next) => {
  try {
    const {
      toUserId,
      projectId,
      summary,
      content,
      attachments,
      protocolType
    } = req.body;

    // 验证必填字段
    if (!toUserId || !summary) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: toUserId, summary'
      });
    }

    const record = await decisionService.createDecisionRequest({
      fromUserId: req.userId,
      toUserId,
      projectId,
      summary,
      content,
      attachments,
      protocolType
    });

    res.json({
      success: true,
      record
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 响应决策请求（即"响应短邮"）
 */
router.post('/decision-responses', authenticateToken, async (req, res, next) => {
  try {
    const { requestId, decision, comment } = req.body;

    if (!requestId || !decision) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: requestId, decision'
      });
    }

    const record = await decisionService.respondToDecision(
      requestId,
      req.userId,
      decision,
      comment
    );

    res.json({
      success: true,
      record
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取用户的待决策事项（即"短邮收件箱"）
 */
router.get('/user/:userId/pending-decisions', authenticateToken, async (req, res, next) => {
  try {
    const { projectId } = req.query;

    const records = await decisionService.getPendingDecisions(
      req.params.userId,
      projectId
    );

    res.json({
      success: true,
      count: records.length,
      records
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取项目的决策交流记录
 */
router.get('/project/:projectId/decisions', authenticateToken, async (req, res, next) => {
  try {
    const records = await decisionService.getProjectDecisions(
      req.params.projectId,
      req.query
    );

    res.json({
      success: true,
      count: records.length,
      records
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取对话线程
 */
router.get('/conversations/:conversationId', authenticateToken, async (req, res, next) => {
  try {
    const records = await decisionService.getConversation(
      req.params.conversationId
    );

    res.json({
      success: true,
      count: records.length,
      records
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

### 3.2 注册路由

编辑 `src/server.js`，注册PWP路由：

```javascript
// 现有路由
app.use('/api/auth', require('./auth'));
app.use('/api/projects', require('./projects'));
app.use('/api/solutions', require('./solutions'));

// ⭐ 新增PWP路由
app.use('/api/pwp', require('./pwp'));
```

---

## 任务4: 测试第一个API

### 4.1 启动服务器

```bash
npm run dev
# 应该看到: Server running on http://localhost:3000
```

### 4.2 测试创建决策请求

```bash
# 先登录获取token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@supercoordination.com",
    "password": "admin123"
  }'

# 保存返回的token

# 创建决策请求
curl -X POST http://localhost:3000/api/pwp/decision-requests \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toUserId": "接收者的user_id",
    "projectId": "项目的project_id",
    "summary": "测试决策请求：UI配色方案选择",
    "content": {
      "text": "准备了三个配色方案，需要你的决策"
    },
    "attachments": [],
    "protocolType": "DECISION_REQUIRED"
  }'
```

### 4.3 验证创建成功

```bash
# 查询待决策事项
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/pwp/user/接收者的user_id/pending-decisions

# 应该看到刚才创建的决策请求
```

### 4.4 测试响应决策

```bash
# 用接收者账号登录，获取token

# 响应决策
curl -X POST http://localhost:3000/api/pwp/decision-responses \
  -H "Authorization: Bearer 接收者的TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "刚才创建的record_id",
    "decision": "批准",
    "comment": "很好的设计方案"
  }'
```

---

## 验收标准

```
✅ 数据库迁移成功
   ├─ pwp_records表有status字段
   ├─ pwp_records表有updatedAt字段
   └─ 相关索引已创建

✅ 服务层实现完成
   ├─ decisionService.js创建成功
   ├─ 所有方法无语法错误
   └─ 能正确导出

✅ API端点可用
   ├─ POST /api/pwp/decision-requests 返回200
   ├─ GET /api/pwp/user/:id/pending-decisions 返回数据
   └─ POST /api/pwp/decision-responses 更新成功

✅ 端到端流程通过
   ├─ 用户A创建决策请求
   ├─ 用户B收到待决策
   ├─ 用户B响应决策
   └─ 用户A看到响应结果
```

---

## 下一步

第一步完成后，继续：
- **Step 2**: 创建移动端短邮界面
- **Step 3**: 集成到项目主页
- **Step 4**: 测试和优化

---

**预计时间**: 6-8小时（1个工作日）

**【五行属性】**：🌳木（技术实现）
**【道法术势器】**：术（具体实现）
**【心法】**：修术以能行动
