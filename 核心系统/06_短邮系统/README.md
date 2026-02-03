# 06_短邮系统

## 模块概述
基于PWP协议的AI增强决策通信工具，双端同步（移动+桌面）

## 核心文件
- **shortmail-login.html** - 移动端登录页（245行）
- **shortmail-app.html** - 移动端应用（1050行）
- **pwp.js** - PWP API路由（127行）
- **decisionService.js** - 决策服务层（282行）

## 主要功能

### 移动端
1. ✅ 登录认证
2. ✅ 收件箱（待处理决策）
3. ✅ 决策详情查看
4. ✅ 快速响应（AI建议）
5. ✅ 手动响应（自定义）
6. ✅ 创建决策请求
7. ✅ 决策链可视化

### 桌面端
1. ✅ 项目决策列表
2. ✅ 决策时间轴
3. ✅ 三种过滤（全部/进行中/已响应）
4. ✅ AI建议响应
5. ✅ 手动响应
6. ✅ 创建决策请求
7. ✅ conversationId线程分组

## API端点
```
POST /api/pwp/decision-requests              # 创建决策请求
POST /api/pwp/decision-responses             # 响应决策
GET  /api/pwp/user/:userId/pending-decisions # 获取待处理决策
GET  /api/pwp/project/:projectId/decisions   # 获取项目决策
GET  /api/pwp/conversations/:conversationId  # 获取对话线程
```

## 数据模型
```prisma
model PWPRecord {
  id                String   @id @default(uuid())
  userId            String
  projectId         String?
  eventType         String   # decision_requested, decision_made等
  eventData         Json     # 包含conversationId, aiSuggestions等
  status            String   @default("active")
  occurredAt        DateTime @default(now())
}
```

## 决策流程
```
创建请求 → AI生成建议 → 接收方查看 →
  ├─ 快速响应（选择AI建议）
  └─ 手动响应（自定义评论）
→ 更新状态 → 决策链记录 → 双端同步
```

## 核心特性
- **不可篡改**: PWP协议保证决策记录不可修改
- **AI增强**: 自动生成决策框架和建议
- **双端同步**: 移动和桌面完美数据同步
- **决策链**: conversationId关联完整对话
- **实时更新**: WebSocket推送（可选）

## 测试文档
完整测试指南见原项目：
- SHORTMAIL_TESTING_QUICKSTART.md（5分钟快速测试）
- SHORTMAIL_TESTING_PLAN.md（完整测试计划）
