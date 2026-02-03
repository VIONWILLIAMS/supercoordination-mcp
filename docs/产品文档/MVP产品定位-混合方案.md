# MVP 1.0 产品定位 - 混合方案

**更新时间：** 2026-02-03
**核心洞察：** 任务优先，项目可选

---

## 一、核心产品定位

### 超协体 = 任务协作平台（主） + 项目管理能力（辅）

**Slogan：**
```
AI驱动的五行任务协作平台
让每个人都能找到适合自己的任务
```

---

## 二、双模式设计

### 模式1：独立任务模式（默认，MVP 1.0核心）

**适用场景：**
- 个人贡献者
- 新手用户
- 快速上手

**核心流程：**
```
1. 注册 → 填写五行画像
2. Dashboard立即显示：
   - 推荐任务（Top 5）
   - 全部任务（可筛选）
3. 认领任务 → 执行 → 完成 → 获得积分
4. 发布方案到方案库
```

**数据模型：**
```javascript
Task {
  projectId: null,  // ← 独立任务
  taskType: "standalone",
  status: "open",
  creator: User,
  assignee: User
}
```

**关键特性：**
- ✅ 无需创建项目
- ✅ 立即可用
- ✅ 门槛低
- ✅ 适合MVP冷启动

---

### 模式2：项目协作模式（进阶，1.5版本）

**适用场景：**
- 有明确目标的团队
- 复杂项目管理
- 企业客户

**核心流程：**
```
1. 创建项目（消耗50积分）
2. 邀请团队成员
3. 创建项目任务（自动关联项目）
4. 项目看板管理
5. 项目完成后归档
```

**数据模型：**
```javascript
Task {
  projectId: "project-uuid",  // ← 项目任务
  taskType: "project_task",
  status: "open",
  project: Project,
  creator: User,
  assignee: User
}
```

**关键特性：**
- ✅ 项目制组织
- ✅ 团队协作
- ✅ 积分预算池
- ✅ 适合企业客户

---

## 三、用户旅程设计

### 新手用户（第1-7天）

```
Day 1:
- 注册 → 五行画像 → 看到5个推荐任务
- 认领"编写AI应用案例" → 完成 → +20积分
- 体验：简单、即时、有成就感

Day 3:
- 看到更多推荐任务
- 发布第一个方案 → +50积分
- 被其他人引用 → +10积分

Day 7:
- 完成5个任务，积分150
- Dashboard提示："解锁项目模式，创建你的第一个项目"
- 用户可选择：继续独立任务 or 创建项目
```

### 进阶用户（第8-30天）

```
Day 10:
- 创建项目"AIGC内容工厂"（-50积分）
- 邀请2个协作成员
- 创建5个项目任务

Day 15:
- 项目进度50%
- 团队完成3个任务
- 发布项目方案

Day 30:
- 项目完成，归档
- 剩余积分退回
- 成员贡献排行
```

---

## 四、数据库设计（兼容双模式）

### Task表（统一）

```prisma
model Task {
  id              String   @id @default(uuid())
  title           String
  description     String?  @db.Text

  // 任务类型（双模式兼容）
  taskType        String   @default("standalone") // standalone/project_task
  projectId       String?  @map("project_id")
  project         Project? @relation(fields: [projectId], references: [id])

  // 任务分配
  creatorId       String   @map("creator_id")
  creator         User     @relation("TaskCreator", fields: [creatorId], references: [id])

  assigneeId      String?  @map("assignee_id")
  assignee        User?    @relation("TaskAssignee", fields: [assigneeId], references: [id])

  // 五行属性
  wuxingType      String?  // wood/fire/earth/metal/water

  // 状态
  status          String   @default("open") // open/in_progress/completed/archived

  // 积分
  pointsReward    Int      @default(20) @map("points_reward")

  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("tasks")
}
```

### Project表（可选）

```prisma
model Project {
  id              String   @id @default(uuid())
  name            String
  description     String?  @db.Text

  // 项目负责人
  ownerId         String   @map("owner_id")
  owner           User     @relation(fields: [ownerId], references: [id])

  // 状态
  status          String   @default("active") // active/paused/completed/archived

  // 关联
  tasks           Task[]
  members         ProjectMember[]

  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("projects")
}
```

**关键设计：**
- Task.projectId可以为null → 独立任务
- Task.projectId有值 → 项目任务
- 两种模式共存，互不干扰

---

## 五、前端页面优先级

### MVP 1.0（当前，必须有）

| 优先级 | 页面 | 状态 | 用途 |
|-------|------|------|------|
| P0 | dashboard.html | ✅ 已完成 | 主控制台 |
| P0 | task-create.html | ✅ 已完成 | 创建独立任务 |
| P0 | task-detail.html | ✅ 已完成 | 任务详情+AI助手 |
| P0 | my-tasks.html | ✅ 已完成 | 我的任务 |
| P0 | solution-library.html | ✅ 已完成 | 方案库 |
| P0 | solution-create.html | ✅ 已完成 | 发布方案 |

### MVP 1.5（下一阶段，可选）

| 优先级 | 页面 | 状态 | 用途 |
|-------|------|------|------|
| P1 | projects.html | ❌ 未开发 | 项目列表 |
| P1 | project-detail.html | ❌ 未开发 | 项目详情+看板 |
| P1 | project-create.html | ❌ 未开发 | 创建项目 |
| P2 | project-settings.html | ❌ 未开发 | 项目设置 |

---

## 六、产品路线图

### 阶段1：MVP 1.0（当前）✅
**定位：** 任务协作平台
**核心：** 独立任务模式
**状态：** 90%完成

**待完成：**
- [ ] 验证解决方案系统
- [ ] 补充单元测试
- [ ] 优化任务推荐算法

### 阶段2：MVP 1.5（1-2周后）
**定位：** 任务协作 + 项目管理
**核心：** 双模式共存
**开发量：** 12小时

**功能清单：**
- [ ] 添加Project表
- [ ] 项目管理API
- [ ] 项目相关页面
- [ ] Dashboard集成项目模块

### 阶段3：2.0（1-2个月后）
**定位：** 企业级项目协作平台
**核心：** 项目制为主，任务为辅

**功能清单：**
- [ ] 高级项目看板
- [ ] 团队权限管理
- [ ] 项目数据分析
- [ ] 企业级集成

---

## 七、战略决策建议

### 现在应该做什么？

**答案：聚焦MVP 1.0，巩固任务协作核心**

#### 优先级排序（修正版）

```
P0（立即做）：
1. ✅ 验证解决方案系统（1-2h）
   - 创建测试数据
   - 验证评分/引用/排行榜
   - 发现并修复bug

2. ✅ 补充核心模块单元测试（2-3h）
   - 用户认证
   - 任务管理
   - 积分系统
   - 方案系统

3. ✅ 优化Dashboard体验（1h）
   - 任务推荐展示
   - 加载性能优化
   - 移动端适配

---

P1（下周做）：
4. 🔄 开放API平台（4h）
   - 为外部开发者提供API
   - 支持第三方集成

5. 🔄 数据库完全迁移验证（2h）
   - 确保所有功能使用PostgreSQL
   - 移除JSON文件依赖

---

P2（2周后做）：
6. 🆕 项目制团队管理（12h）
   - 在MVP 1.0稳定后
   - 作为1.5版本的核心功能
```

---

## 八、产品定位声明（修正版）

### 超协体 MVP 1.0

**我们是谁：**
```
AI驱动的五行任务协作平台
通过五行理论+智能推荐，帮助个人找到最适合自己的任务
```

**我们不是：**
```
❌ 不是重量级项目管理工具（Asana/Jira）
❌ 不是企业级协作平台（Notion/Confluence）
```

**我们的差异化：**
```
✅ 五行理论驱动的AI推荐
✅ 轻量级任务协作
✅ 积分经济激励
✅ 快速上手（<5分钟）
```

**未来演进：**
```
1.0 → 任务协作（个人）
1.5 → 任务协作 + 项目管理（团队）
2.0 → 企业级项目协作平台（组织）
```

---

## 九、关键决策点

### 给指挥官的建议

**战略级问题：**
超协体到底要做什么？

**我的建议：**
```
短期（3个月）：
专注任务协作平台
- 个人效能提升
- 五行智能推荐
- 轻量、快速、好用

中期（6个月）：
引入项目管理能力
- 支持团队协作
- 项目制组织
- 双模式共存

长期（12个月）：
升级为企业级平台
- 项目制为主
- 企业客户
- 高客单价
```

**当前最关键：**
不要被"项目制"的完美设计诱惑，先把任务协作做到极致。

**心法：**
```
势未成，不先器
道未明，不改向
```

---

**[五行: 🔥火70% + ⚙️金30% | 层级: 道（定向） | KR: 战略目标一]**

**核心洞察：** 产品定位必须清晰，MVP 1.0应该聚焦任务协作，项目管理是1.5版本的事。
