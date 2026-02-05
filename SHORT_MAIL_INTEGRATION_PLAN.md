# 短邮系统整合开发计划
## 超协体移动端功能 - 完整实施方案

**版本**: v1.0
**日期**: 2026-02-03
**定位**: 短邮 = 超协体的移动端功能，而非独立产品
**开发方式**: 整合到现有项目（方案A）

---

## 第一部分：核心定位

### 短邮在超协体中的角色

```
短邮不是新产品，而是超协体在移动端的协作界面
═══════════════════════════════════════════════════

桌面端（已有）              移动端（短邮）
├─ Dashboard               ├─ 短邮收件箱
├─ Projects                ├─ 快速项目动态
├─ Knowledge Crystals      ├─ 移动端晶体浏览
├─ Tasks                   ├─ 任务快速响应
└─ Members                 └─ 周六对齐时间表

共享后端:
├─ 用户系统 ✓
├─ 项目系统 ✓
├─ 知识晶体 ✓
├─ 任务系统 ✓
└─ 积分系统 ✓

新增功能:
├─ 短邮协议层（移动端优化的协作消息）
├─ AI智能路由（判断线上/线下）
├─ 线下对齐机制（周六开放日）
└─ PWP扩展记录（完整协作追踪）
```

---

## 第二部分：整合架构设计

### 2.1 数据库扩展

**新增3个核心表：**

```sql
┌─────────────────────────────────────────────┐
│ 1. short_mails （短邮核心表）               │
├─────────────────────────────────────────────┤
│ ✓ 关联现有User、Project                    │
│ ✓ 多模态内容（文字/图片/链接）             │
│ ✓ AI辅助（协议识别、决策建议）             │
│ ✓ 状态管理（pending/read/responded）       │
│ ✓ 对话线程（支持往返讨论）                 │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 2. offline_syncs （线下对齐表）             │
├─────────────────────────────────────────────┤
│ ✓ 周六开放日时间表                          │
│ ✓ 议题列表（来自待线下短邮）               │
│ ✓ 对齐记录（决策、行动项）                 │
│ ✓ 质量评分（满意度、有效性）               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 3. pwp_records （PWP事件记录表）            │
├─────────────────────────────────────────────┤
│ ✓ 自动记录所有协作事件                      │
│ ✓ 灵活的JSON结构                            │
│ ✓ 完整的时间线追踪                          │
│ ✓ 关联User、Project、ShortMail             │
└─────────────────────────────────────────────┘
```

**与现有系统的关联：**

```
ShortMail
├─ fromUser → User (已有)
├─ toUser → User (已有)
├─ project → Project (已有)
└─ offlineSync → OfflineSync (新增)

OfflineSync
├─ project → Project (已有)
├─ facilitator → User (已有)
├─ shortMails → ShortMail[] (新增)
└─ pwpRecords → PWPRecord[] (新增)

PWPRecord
├─ user → User (已有)
├─ project → Project (已有)
└─ relatedEntity → ShortMail | OfflineSync (新增)
```

### 2.2 API端点设计

**新增API路由（约18个端点）：**

```javascript
// ========== 短邮核心API ==========
POST   /api/shortmails              // 创建短邮
GET    /api/shortmails              // 短邮列表（支持过滤）
GET    /api/shortmails/:id          // 短邮详情
PUT    /api/shortmails/:id          // 更新短邮
DELETE /api/shortmails/:id          // 删除短邮

POST   /api/shortmails/:id/respond  // 响应短邮
POST   /api/shortmails/:id/read     // 标记已读
POST   /api/shortmails/analyze      // AI分析短邮（建议线下）

GET    /api/shortmails/conversations/:conversationId  // 对话线程

// ========== 线下对齐API ==========
POST   /api/syncs                   // 创建线下对齐
GET    /api/syncs                   // 对齐列表
GET    /api/syncs/saturday          // 本周六时间表
GET    /api/syncs/:id               // 对齐详情
PUT    /api/syncs/:id               // 更新对齐

POST   /api/syncs/:id/notes         // 提交对齐记录
POST   /api/syncs/:id/attend        // 确认参加

// ========== PWP记录API ==========
GET    /api/pwp/user/:userId        // 个人活动时间线
GET    /api/pwp/project/:projectId  // 项目活动时间线
POST   /api/pwp/record              // 手动记录事件（特殊场景）
```

### 2.3 前端页面设计

**移动端优化的页面（PWA）：**

```
┌─────────────────────────────────────┐
│ 1. shortmail-inbox.html             │ ⭐ 核心
│    - 短邮收件箱                      │
│    - 待决策/已响应/已归档           │
│    - 下拉刷新、无限滚动             │
│    - AI建议标签显示                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 2. shortmail-detail.html            │ ⭐ 核心
│    - 短邮详情查看                    │
│    - AI决策建议展示                 │
│    - 快速响应操作                    │
│    - 对话线程展示                    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 3. shortmail-compose.html           │ ⭐ 核心
│    - 创建短邮                        │
│    - 多模态输入（文字/图片/语音）   │
│    - 接收者选择（项目成员）         │
│    - AI实时建议                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 4. saturday-schedule.html           │
│    - 周六开放日时间表                │
│    - 项目对齐会议列表                │
│    - 议题预览                        │
│    - 确认参加                        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 5. sync-detail.html                 │
│    - 线下对齐详情                    │
│    - 议题列表                        │
│    - 对齐记录表单                    │
│    - 行动项追踪                      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 6. mobile-dashboard.html            │
│    - 移动端主面板                    │
│    - 快速入口（项目/晶体/短邮）     │
│    - 今日待办                        │
│    - 周六提醒                        │
└─────────────────────────────────────┘
```

**复用现有页面：**
- Dashboard（移动端优化）
- Projects（简化视图）
- Crystals（浏览模式）

---

## 第三部分：开发任务清单

### Phase 1: 数据库和后端基础 (Week 1-2)

#### Task 1.1: 数据库迁移
```bash
□ 将 shortmail-extension.prisma 内容合并到 schema.prisma
□ 在 User model 中添加短邮关联
□ 在 Project model 中添加短邮关联
□ 运行 prisma migrate dev --name add_shortmail_system
□ 验证数据库表创建成功
```

#### Task 1.2: 后端API - 短邮CRUD
```bash
□ 创建 src/shortmails.js
  ├─ POST /api/shortmails - 创建短邮
  ├─ GET /api/shortmails - 列表（支持过滤）
  ├─ GET /api/shortmails/:id - 详情
  └─ PUT /api/shortmails/:id - 更新

□ 创建 src/services/shortmailService.js
  ├─ 创建短邮逻辑
  ├─ 查询过滤逻辑
  └─ 权限验证

□ 在 src/server.js 中注册路由
```

#### Task 1.3: AI智能路由服务
```bash
□ 创建 src/services/aiRouterService.js
  ├─ analyzeShortMail(summary, content) - 分析短邮
  ├─ detectProtocolType() - 识别协议类型
  ├─ calculateComplexity() - 计算复杂度
  ├─ suggestOffline() - 判断是否需要线下
  └─ generateDecisionFramework() - 生成决策框架

□ 实现规则引擎（不用LLM）
  ├─ 关键词匹配
  ├─ 文本长度分析
  ├─ 参与人数判断
  └─ 历史数据参考

□ POST /api/shortmails/analyze 端点
```

### Phase 2: 短邮核心功能 (Week 2-3)

#### Task 2.1: 短邮响应机制
```bash
□ POST /api/shortmails/:id/respond
  ├─ 根据协议类型验证响应格式
  ├─ 更新短邮状态
  ├─ 发送通知给发送者
  └─ 记录PWP事件

□ 多种响应类型支持
  ├─ TASK_ASSIGNMENT: 接受/拒绝/需要讨论
  ├─ DELIVERABLE_SUBMISSION: 批准/需要改/需要讨论
  ├─ FEEDBACK_REQUEST: 同意/不同意/需要讨论
  └─ DECISION_REQUIRED: 选项A/B/C/需要讨论
```

#### Task 2.2: 对话线程功能
```bash
□ GET /api/shortmails/conversations/:conversationId
  ├─ 获取对话中的所有短邮
  ├─ 按时间排序
  └─ 包含参与者信息

□ 自动分配 conversationId
  ├─ 回复时继承父级 conversationId
  └─ 新对话自动生成 UUID
```

#### Task 2.3: 多模态输入支持
```bash
□ 文件上传端点（复用现有或新建）
  ├─ POST /api/upload/image
  ├─ POST /api/upload/file
  └─ 返回文件URL

□ 短邮 attachments 字段支持
  ├─ 图片数组
  ├─ 文件数组
  ├─ 链接数组
  └─ 视频链接
```

### Phase 3: 线下对齐系统 (Week 3-4)

#### Task 3.1: 线下对齐API
```bash
□ 创建 src/offlineSyncs.js
  ├─ POST /api/syncs - 创建对齐
  ├─ GET /api/syncs - 列表
  ├─ GET /api/syncs/saturday - 周六时间表
  ├─ GET /api/syncs/:id - 详情
  └─ PUT /api/syncs/:id - 更新

□ 在 src/server.js 中注册路由
```

#### Task 3.2: 对齐记录功能
```bash
□ POST /api/syncs/:id/notes
  ├─ 提交对齐记录（decisions, actionItems）
  ├─ 更新对齐状态为 completed
  ├─ 关联的短邮状态更新
  └─ 生成PWP记录

□ 满意度评分
  ├─ satisfactionScore 字段
  └─ effectivenessScore 字段
```

#### Task 3.3: 周六时间表逻辑
```bash
□ GET /api/syncs/saturday 实现
  ├─ 获取本周六的日期
  ├─ 查询该日期的所有对齐
  ├─ 按时间排序
  ├─ 包含项目和参与者信息
  └─ 标记当前用户参与的对齐
```

### Phase 4: PWP记录系统 (Week 4-5)

#### Task 4.1: PWP自动记录
```bash
□ 创建 src/services/pwpRecordService.js
  ├─ recordEvent(userId, eventType, eventData)
  ├─ 在短邮创建时记录
  ├─ 在短邮响应时记录
  ├─ 在对齐完成时记录
  └─ 批量记录支持

□ 事件类型定义
  ├─ shortmail_sent
  ├─ shortmail_received
  ├─ shortmail_read
  ├─ shortmail_responded
  ├─ offline_sync_created
  ├─ offline_sync_attended
  └─ offline_sync_completed
```

#### Task 4.2: PWP查询API
```bash
□ 创建 src/pwp.js
  ├─ GET /api/pwp/user/:userId - 个人时间线
  ├─ GET /api/pwp/project/:projectId - 项目时间线
  └─ 支持分页和时间范围过滤

□ 在 src/server.js 中注册路由
```

### Phase 5: 移动端前端 (Week 5-7)

#### Task 5.1: 短邮收件箱
```bash
□ 创建 public/shortmail-inbox.html
  ├─ 短邮列表展示
  ├─ 状态过滤（待决策/已响应/已归档）
  ├─ AI建议标签显示
  ├─ 下拉刷新
  ├─ 无限滚动
  └─ 移动端优化

□ 响应式设计
  ├─ 适配手机屏幕
  ├─ 触摸友好的交互
  └─ PWA支持
```

#### Task 5.2: 短邮详情页
```bash
□ 创建 public/shortmail-detail.html
  ├─ 完整内容展示
  ├─ 多模态附件显示
  ├─ AI决策建议卡片
  ├─ 快速响应按钮
  ├─ 对话线程展示
  └─ 建议线下对齐提示

□ 复用 shortmail-v2.html 的设计
```

#### Task 5.3: 短邮创建页
```bash
□ 创建 public/shortmail-compose.html
  ├─ 接收者选择（用户列表）
  ├─ 项目选择（项目列表）
  ├─ 摘要输入（必填）
  ├─ 内容输入（富文本）
  ├─ 附件上传（图片/文件）
  ├─ AI实时建议
  └─ 发送确认

□ 复用 shortmail-prototype.html 的交互
```

#### Task 5.4: 周六开放日页面
```bash
□ 创建 public/saturday-schedule.html
  ├─ 时间表展示（09:00-15:30）
  ├─ 项目对齐会议列表
  ├─ 议题预览（来自短邮）
  ├─ 参与者显示
  ├─ 确认参加按钮
  └─ 地点信息

□ 复用 shortmail-v2.html 的周六开放日设计
```

#### Task 5.5: 对齐详情和记录
```bash
□ 创建 public/sync-detail.html
  ├─ 对齐基本信息
  ├─ 议题列表
  ├─ 相关短邮展示
  ├─ 对齐记录表单
  ├─ 决策输入
  ├─ 行动项输入
  └─ 满意度评分
```

#### Task 5.6: 移动端Dashboard
```bash
□ 创建 public/mobile-dashboard.html
  ├─ 快速入口（项目/晶体/短邮）
  ├─ 今日待办（待决策短邮）
  ├─ 周六提醒（如果有对齐）
  ├─ 最近活动
  └─ 统计数据

□ 或优化现有 dashboard.html
  ├─ 添加移动端适配
  ├─ 添加短邮入口
  └─ 添加周六提醒
```

### Phase 6: 通知和优化 (Week 7-8)

#### Task 6.1: 通知系统
```bash
□ 短邮通知
  ├─ 收到新短邮时通知
  ├─ 短邮被响应时通知
  └─ 简化为App内通知横幅

□ 周六提醒
  ├─ 周五下午提醒
  ├─ 周六早上提醒
  └─ 显示对齐数量和时间
```

#### Task 6.2: 性能优化
```bash
□ 数据库查询优化
  ├─ 添加必要索引
  ├─ 优化关联查询
  └─ 分页加载

□ 前端优化
  ├─ 图片懒加载
  ├─ 虚拟滚动
  └─ 缓存策略
```

### Phase 7: 测试和上线 (Week 8-9)

#### Task 7.1: 集成测试
```bash
□ 创建短邮端到端测试
  ├─ 创建→发送→接收→响应
  ├─ AI路由建议
  ├─ 线下对齐流程
  └─ PWP记录验证

□ 移动端测试
  ├─ iOS Safari测试
  ├─ Android Chrome测试
  └─ 响应式适配验证
```

#### Task 7.2: 文档
```bash
□ API文档
  ├─ 短邮API文档
  ├─ 线下对齐API文档
  └─ PWP API文档

□ 用户手册
  ├─ 短邮使用指南
  ├─ 周六开放日指南
  └─ 移动端操作指南
```

---

## 第四部分：开发时间估算

```
Phase 1: 数据库和后端基础    → 2周
Phase 2: 短邮核心功能        → 1.5周
Phase 3: 线下对齐系统        → 1.5周
Phase 4: PWP记录系统         → 1周
Phase 5: 移动端前端          → 2周
Phase 6: 通知和优化          → 1周
Phase 7: 测试和上线          → 1周

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
总计: 10周 (全职) 或 14-16周 (兼职)

使用Claude Code加速 → 可缩短30-40%
实际预计: 7-8周 (全职)
```

---

## 第五部分：立即开始的第一步

### Step 1: 数据库迁移

```bash
# 1. 合并数据模型
cd /Users/personalworkplacce/ClaudeWorkspace/supercoordination-mcp

# 2. 编辑 prisma/schema.prisma，添加扩展内容

# 3. 运行迁移
npx prisma migrate dev --name add_shortmail_system

# 4. 重新生成Prisma Client
npx prisma generate
```

### Step 2: 创建后端基础

```bash
# 1. 创建短邮路由文件
touch src/shortmails.js

# 2. 创建服务文件
mkdir -p src/services
touch src/services/shortmailService.js
touch src/services/aiRouterService.js
touch src/services/pwpRecordService.js

# 3. 在 src/server.js 中注册路由
```

### Step 3: 测试第一个API

```bash
# 创建短邮测试
curl -X POST http://localhost:3000/api/shortmails \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toUserId": "user-id",
    "projectId": "project-id",
    "summary": "测试短邮",
    "content": {"text": "这是一条测试短邮"}
  }'
```

---

## 第六部分：成功标准

### MVP上线检查清单

```
认证和权限:
☑ 短邮创建需要登录
☑ 只能查看发给自己的短邮
☑ 只能响应发给自己的短邮

短邮核心:
☑ 可以创建短邮（文字+图片）
☑ 可以查看短邮列表
☑ 可以查看短邮详情
☑ 可以响应短邮
☑ 发送者收到响应通知

AI功能:
☑ AI能识别协议类型
☑ AI能判断是否需要线下
☑ AI建议显示清晰
☑ 决策框架生成正确

线下对齐:
☑ 可以查看周六时间表
☑ 可以记录对齐结果
☑ 待线下短邮正确关联
☑ 对齐完成后短邮状态更新

PWP记录:
☑ 事件自动记录
☑ 可以查看个人时间线
☑ 可以查看项目时间线
☑ 时间线数据完整

移动端:
☑ 响应式适配完美
☑ 触摸交互流畅
☑ 加载速度 < 2秒
☑ PWA安装正常
```

---

## 第七部分：与现有系统的协同

### 复用现有功能

```
✓ 用户系统 → 短邮的发送者/接收者
✓ 项目系统 → 短邮关联项目
✓ 积分系统 → 未来可扩展短邮奖励
✓ 知识晶体 → 可以从短邮创建晶体
✓ 任务系统 → 短邮可以创建任务

新增价值:
+ 移动端优化的协作方式
+ AI智能路由决策
+ 线上线下融合机制
+ 完整的协作记录追踪
```

### Dashboard集成

```javascript
// 在 dashboard.html 中添加短邮入口

// 1. 顶部导航添加
<a href="/shortmail-inbox.html" class="nav-link">
  📬 短邮
  <span class="badge">3</span> <!-- 未读数 -->
</a>

// 2. 快速访问卡片
<div class="card">
  <h3>📬 待决策短邮</h3>
  <div class="count">5</div>
  <a href="/shortmail-inbox.html">查看全部</a>
</div>

// 3. 周六提醒卡片
<div class="card saturday-reminder">
  <h3>📅 本周六对齐</h3>
  <div>2个项目对齐，共5个议题</div>
  <a href="/saturday-schedule.html">查看时间表</a>
</div>
```

---

## 总结

这个整合方案：

```
✅ 充分复用现有系统（User、Project、Auth）
✅ 最小化数据库变更（3个新表）
✅ 清晰的开发路径（7个Phase）
✅ 移动优先的体验（PWA）
✅ AI智能辅助（规则引擎）
✅ 完整的协作闭环（线上+线下）
✅ 可追踪的进度（PWP记录）

预计开发时间: 7-8周（全职，使用Claude Code）
```

**现在可以开始第一步：数据库迁移！**

---

**【五行属性】**：⚙️金（架构设计） + 🌳木（技术实现）
**【道法术势器】**：道→法→术（从定位到架构到实现）
**【战略目标】**：目标一 - 超协体生态根基
