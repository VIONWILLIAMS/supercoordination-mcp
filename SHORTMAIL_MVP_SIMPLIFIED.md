# 短邮系统 MVP - 简化版方案
## 聚焦线上协作 + 决策链可视化

**版本**: v1.1 (简化版)
**日期**: 2026-02-03
**核心**: 短邮收件箱 + 决策链，暂缓线下对齐

---

## 第一部分：MVP范围调整

### 调整说明

```
基于原型测试反馈，战略性简化：

✅ 保留核心：
├─ 📬 短邮收件箱（移动端协作核心）
├─ 🔗 决策链可视化（协作流程追踪）
└─ 🤖 AI智能建议（保留，但简化）

❌ 暂时移除：
├─ 📅 周六开放日（线下对齐机制）
├─ 🤝 线下对齐记录
└─ 📍 周六时间表

💡 简化AI功能：
├─ 保留协议类型识别
├─ 保留决策框架生成
└─ 移除"建议线下"逻辑（未来Phase 2再加）
```

### 为什么简化？

```
🎯 战略原因：
├─ 先验证线上协作价值
├─ 避免线上线下同时推进的复杂性
├─ 更快的MVP交付周期
└─ 降低初期用户学习成本

⚡ 执行原因：
├─ 开发时间缩短 40%
├─ 数据库表减少 1个
├─ API端点减少 7个
└─ 前端页面减少 2个

🔄 迭代策略：
├─ Phase 1: 验证线上协作
├─ Phase 2: 根据反馈决定是否加线下对齐
└─ 保持架构扩展性，未来可快速添加
```

---

## 第二部分：简化后的系统架构

### 2.1 数据库设计（2个核心表）

#### Table 1: short_mails（短邮核心表）

```prisma
model ShortMail {
  id                String   @id @default(uuid())

  // 基本信息
  fromUserId        String   @map("from_user_id")
  toUserId          String   @map("to_user_id")
  projectId         String?  @map("project_id")

  // 短邮内容
  summary           String   @db.Text
  content           Json?
  attachments       Json     @default("[]")

  // 协议类型（AI识别）
  protocolType      String?  @map("protocol_type")
  // TASK_ASSIGNMENT | DELIVERABLE_SUBMISSION |
  // FEEDBACK_REQUEST | DECISION_REQUIRED | GENERAL

  // AI辅助（简化版）
  aiSuggestions     Json?    @map("ai_suggestions")
  decisionFramework Json?    @map("decision_framework")
  complexity        Int?     @default(0) // 1-10

  // 状态管理
  status            String   @default("pending")
  // pending | read | responded | archived
  priority          String   @default("medium")
  // low | medium | high | urgent

  // 响应数据
  response          Json?
  respondedAt       DateTime? @map("responded_at")

  // 对话关联
  replyToId         String?  @map("reply_to_id")
  conversationId    String?  @map("conversation_id")

  // 时间戳
  createdAt         DateTime @default(now()) @map("created_at")
  readAt            DateTime? @map("read_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  // 关联
  fromUser          User      @relation("SentShortMails", fields: [fromUserId], references: [id], onDelete: Cascade)
  toUser            User      @relation("ReceivedShortMails", fields: [toUserId], references: [id], onDelete: Cascade)
  project           Project?  @relation(fields: [projectId], references: [id], onDelete: SetNull)
  replyTo           ShortMail? @relation("ShortMailReplies", fields: [replyToId], references: [id])
  replies           ShortMail[] @relation("ShortMailReplies")

  @@index([fromUserId])
  @@index([toUserId])
  @@index([projectId])
  @@index([status])
  @@index([conversationId])
  @@index([createdAt(sort: Desc)])
  @@map("short_mails")
}
```

#### Table 2: pwp_records（PWP事件记录表）

```prisma
model PWPRecord {
  id                String   @id @default(uuid())
  userId            String   @map("user_id")
  projectId         String?  @map("project_id")

  // 事件类型（简化版）
  eventType         String   @map("event_type")
  // shortmail_sent | shortmail_received |
  // shortmail_read | shortmail_responded

  // 事件数据
  eventData         Json     @map("event_data")

  // 关联实体
  relatedEntityType String?  @map("related_entity_type") // ShortMail
  relatedEntityId   String?  @map("related_entity_id")

  // 时间戳
  occurredAt        DateTime @default(now()) @map("occurred_at")

  // 关联
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  project           Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([projectId])
  @@index([eventType])
  @@index([occurredAt(sort: Desc)])
  @@map("pwp_records")
}
```

### 2.2 API端点设计（11个）

```javascript
// ========== 短邮核心API (8个) ==========
POST   /api/shortmails              // 创建短邮
GET    /api/shortmails              // 短邮列表（支持过滤）
GET    /api/shortmails/:id          // 短邮详情
PUT    /api/shortmails/:id          // 更新短邮
DELETE /api/shortmails/:id          // 删除短邮

POST   /api/shortmails/:id/respond  // 响应短邮
POST   /api/shortmails/:id/read     // 标记已读
GET    /api/shortmails/conversations/:id  // 对话线程

// ========== PWP记录API (3个) ==========
GET    /api/pwp/user/:userId        // 个人活动时间线
GET    /api/pwp/project/:projectId  // 项目活动时间线
GET    /api/pwp/shortmail/:id       // 短邮决策链
```

### 2.3 前端页面设计（4个核心页面）

```
1. shortmail-inbox.html ⭐ 核心
   - 短邮收件箱
   - 待决策/已响应/已归档
   - AI建议展示（简化版）
   - 下拉刷新

2. shortmail-detail.html ⭐ 核心
   - 短邮详情
   - AI决策框架
   - 快速响应操作
   - 对话线程

3. shortmail-compose.html ⭐ 核心
   - 创建短邮
   - 多模态输入
   - 接收者/项目选择
   - AI实时建议（简化）

4. shortmail-chain.html
   - 决策链可视化
   - 短邮流程追踪
   - 对话历史展示
```

---

## 第三部分：简化的开发计划

### Phase 1: 数据库和后端核心 (Week 1)

```bash
□ 数据库迁移
  ├─ 添加 short_mails 表
  ├─ 添加 pwp_records 表
  ├─ User model 添加关联
  └─ Project model 添加关联

□ 后端API - 短邮CRUD
  ├─ src/shortmails.js
  ├─ src/services/shortmailService.js
  └─ POST/GET/PUT/DELETE endpoints

□ AI服务（简化版）
  ├─ src/services/aiRouterService.js
  ├─ detectProtocolType() - 协议识别
  ├─ calculateComplexity() - 复杂度
  └─ generateDecisionFramework() - 决策框架
```

### Phase 2: 短邮核心功能 (Week 2)

```bash
□ 响应机制
  ├─ POST /api/shortmails/:id/respond
  ├─ 不同协议类型的响应格式
  └─ 状态更新

□ 对话线程
  ├─ GET /api/shortmails/conversations/:id
  ├─ conversationId 自动分配
  └─ 线程展示逻辑

□ 多模态支持
  ├─ 文件上传（复用现有）
  └─ attachments 字段处理
```

### Phase 3: PWP记录系统 (Week 3)

```bash
□ PWP自动记录
  ├─ src/services/pwpRecordService.js
  ├─ 短邮创建/响应时自动记录
  └─ 事件类型定义

□ PWP查询API
  ├─ GET /api/pwp/user/:userId
  ├─ GET /api/pwp/project/:projectId
  └─ GET /api/pwp/shortmail/:id (决策链)

□ 决策链逻辑
  ├─ 根据 conversationId 关联短邮
  ├─ 时间序列排序
  └─ 状态节点标记
```

### Phase 4: 移动端前端 (Week 4-5)

```bash
□ 短邮收件箱 (3天)
  ├─ 列表展示
  ├─ 过滤和搜索
  ├─ AI建议标签
  └─ 移动端优化

□ 短邮详情 (2天)
  ├─ 完整内容展示
  ├─ AI决策框架
  ├─ 快速响应
  └─ 对话线程

□ 短邮创建 (3天)
  ├─ 表单设计
  ├─ 多模态输入
  ├─ AI实时建议
  └─ 发送确认

□ 决策链可视化 (2天)
  ├─ 链式展示
  ├─ 节点状态
  └─ 时间线追踪
```

### Phase 5: 集成和测试 (Week 5)

```bash
□ Dashboard集成
  ├─ 添加短邮入口
  ├─ 待决策数量显示
  └─ 快速访问卡片

□ 端到端测试
  ├─ 创建→发送→接收→响应
  ├─ 对话线程测试
  └─ PWP记录验证

□ 移动端测试
  ├─ iOS Safari
  ├─ Android Chrome
  └─ 响应式验证
```

---

## 第四部分：开发时间估算

```
Phase 1: 数据库和后端核心  → 1周
Phase 2: 短邮核心功能      → 1周
Phase 3: PWP记录系统       → 1周
Phase 4: 移动端前端        → 1.5周
Phase 5: 集成和测试        → 0.5周

━━━━━━━━━━━━━━━━━━━━━━━━━━━
总计: 5周 (全职)
     或 7周 (兼职)

使用Claude Code加速 → 缩短30%
实际预计: 3.5-4周 (全职) ⚡
```

---

## 第五部分：核心功能详解

### 5.1 短邮收件箱

```
功能清单：

✅ 必须有（P0）:
├─ 短邮列表（最新优先）
├─ 状态过滤（待决策/已响应）
├─ 基本信息展示（发送者/摘要/时间）
├─ 点击查看详情
└─ 下拉刷新

✅ 重要（P1）:
├─ 搜索功能（按发送者/项目）
├─ 优先级标记
├─ AI建议标签
└─ 未读数量提示

⏳ 可延后（P2）:
├─ 批量操作
├─ 归档功能
└─ 标签分类
```

### 5.2 短邮详情

```
功能清单：

✅ 必须有（P0）:
├─ 完整内容展示
├─ 发送者信息
├─ 附件展示（图片/链接）
├─ 快速响应按钮
└─ 返回列表

✅ 重要（P1）:
├─ AI决策框架展示
├─ 对话线程（如果有回复）
├─ 协议类型标签
└─ 响应历史

⏳ 可延后（P2）:
├─ 转发功能
├─ 添加备注
└─ 分享链接
```

### 5.3 短邮创建

```
功能清单：

✅ 必须有（P0）:
├─ 接收者选择
├─ 项目选择
├─ 摘要输入（必填）
├─ 内容输入（可选）
├─ 发送确认
└─ 发送成功反馈

✅ 重要（P1）:
├─ 图片上传
├─ 链接添加
├─ AI实时建议（简化）
└─ 草稿保存

⏳ 可延后（P2）:
├─ 语音输入
├─ 视频上传
├─ 模板功能
└─ 定时发送
```

### 5.4 决策链可视化

```
功能清单：

✅ 必须有（P0）:
├─ 对话中的所有短邮展示
├─ 时间序列排序
├─ 节点状态区分（pending/responded/archived）
└─ 点击节点查看详情

✅ 重要（P1）:
├─ 决策流程可视化
├─ 参与者信息
└─ 关键决策高亮

⏳ 可延后（P2）:
├─ 导出决策链
├─ 分享决策链
└─ 决策链统计
```

---

## 第六部分：AI功能简化

### 6.1 保留的AI能力

```javascript
// 1. 协议类型识别
function detectProtocolType(summary, content) {
  // 规则引擎，基于关键词匹配

  if (含("提交", "完成", "设计稿")) {
    return "DELIVERABLE_SUBMISSION";
  }

  if (含("分配", "任务", "负责")) {
    return "TASK_ASSIGNMENT";
  }

  if (含("反馈", "意见", "建议")) {
    return "FEEDBACK_REQUEST";
  }

  if (含("决策", "选择", "方案")) {
    return "DECISION_REQUIRED";
  }

  return "GENERAL";
}

// 2. 复杂度评分
function calculateComplexity(summary, content, participantCount) {
  let score = 0;

  // 文本长度
  if (summary.length > 100) score += 3;
  if (content && content.length > 500) score += 2;

  // 关键词密度
  if (含("复杂", "权衡", "多个")) score += 2;

  // 参与人数
  if (participantCount >= 3) score += 2;

  return Math.min(score, 10);
}

// 3. 决策框架生成
function generateDecisionFramework(protocolType, summary) {
  const frameworks = {
    DELIVERABLE_SUBMISSION: {
      question: "这个交付物质量如何？",
      options: ["批准", "需要改", "需要讨论"],
      tips: "类似项目一次通过率: 88%"
    },
    TASK_ASSIGNMENT: {
      question: "是否接受此任务？",
      options: ["接受", "拒绝", "需要讨论"],
      tips: "预计工时: X小时"
    },
    // ... 其他协议类型
  };

  return frameworks[protocolType] || null;
}
```

### 6.2 移除的AI能力（Phase 2再加）

```
❌ 暂时移除:
├─ 建议线下讨论判断
├─ 线下对齐时间推荐
├─ 周六时间表生成
└─ 线下对齐质量评分

💡 保留架构扩展性:
├─ short_mails表保留扩展字段
├─ AI服务保留接口设计
└─ 未来可快速添加
```

---

## 第七部分：成功标准

### MVP上线检查清单（简化版）

```
短邮核心功能:
☑ 可以创建短邮
☑ 可以查看短邮列表
☑ 可以查看短邮详情
☑ 可以响应短邮
☑ 发送者收到响应通知
☑ 状态正确更新

AI功能:
☑ 协议类型识别准确
☑ 复杂度评分合理
☑ 决策框架显示清晰

对话线程:
☑ 可以查看对话历史
☑ 回复正确关联
☑ conversationId自动分配

PWP记录:
☑ 事件自动记录
☑ 可以查看个人时间线
☑ 决策链正确展示

移动端:
☑ 响应式适配完美
☑ 触摸交互流畅
☑ 加载速度 < 2秒

性能:
☑ 列表加载 < 1秒
☑ 创建短邮 < 1秒
☑ 无明显卡顿
```

---

## 第八部分：立即开始

### Step 1: 更新数据模型

```bash
# 1. 编辑 prisma/schema.prisma
# 添加 ShortMail 和 PWPRecord 模型

# 2. 运行迁移
npx prisma migrate dev --name add_shortmail_simplified

# 3. 生成Client
npx prisma generate
```

### Step 2: 创建后端文件

```bash
# 创建路由和服务
touch src/shortmails.js
touch src/pwp.js
touch src/services/shortmailService.js
touch src/services/aiRouterService.js
touch src/services/pwpRecordService.js

# 在 src/server.js 注册路由
```

### Step 3: 测试第一个API

```bash
# 创建短邮
curl -X POST http://localhost:3000/api/shortmails \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toUserId": "user-id",
    "projectId": "project-id",
    "summary": "测试短邮",
    "content": {"text": "这是简化版MVP"}
  }'
```

---

## 总结

### 简化后的优势

```
✅ 开发时间缩短 40%
   ├─ 从 7-8周 → 4-5周

✅ 复杂度降低 50%
   ├─ 数据库表: 3个 → 2个
   ├─ API端点: 18个 → 11个
   └─ 前端页面: 6个 → 4个

✅ 聚焦核心价值
   ├─ 移动端异步协作 ⭐
   ├─ 决策流程追踪 ⭐
   └─ AI智能辅助 ⭐

✅ 保持扩展性
   ├─ 架构设计可扩展
   ├─ 数据模型预留字段
   └─ Phase 2可快速添加线下对齐
```

### 下一步行动

```
立即可以开始的：
1. 数据库迁移（30分钟）
2. 创建第一个API（2小时）
3. 测试端到端流程（1小时）

本周可以完成的：
- Phase 1: 数据库和后端核心

下周可以完成的：
- Phase 2-3: 短邮功能 + PWP记录

4周后可以上线：
- 完整的MVP系统
```

---

**【五行属性】**：⚙️金（架构优化） + 🌳木（快速实现）
**【道法术势器】**：道→法（方向调整，架构简化）
**【心法】**：明道而不迷，立法而不散
