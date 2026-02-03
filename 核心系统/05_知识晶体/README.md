# 05_知识晶体

## 模块概述
方案沉淀与复用系统（原"方案系统"重命名）

## 核心文件
- **crystal-library.html** - 知识晶体库
- **crystal-create.html** - 创建晶体
- **crystal-detail.html** - 晶体详情
- **crystal-rankings.html** - 晶体排行榜
- **solutions.js** - 晶体后端服务

## 主要功能
1. ✅ 创建知识晶体
2. ✅ 浏览晶体库
3. ✅ 评分系统（5星）
4. ✅ 引用计数
5. ✅ 排行榜（评分/引用）
6. ✅ 标签分类
7. ✅ 搜索过滤

## API端点
```
GET  /api/solutions           # 获取晶体列表
POST /api/solutions           # 创建晶体
GET  /api/solutions/:id       # 获取晶体详情
PUT  /api/solutions/:id       # 更新晶体
POST /api/solutions/:id/rate  # 评分
GET  /api/solutions/rankings  # 排行榜
```

## 数据模型
```prisma
model Solution {
  id          String   @id @default(uuid())
  title       String
  content     String
  authorId    String
  score       Float    @default(0)
  ratingCount Int      @default(0)
  refCount    Int      @default(0)  # 引用次数
  tags        String[]
  createdAt   DateTime @default(now())
}

model SolutionRating {
  id         String   @id @default(uuid())
  solutionId String
  userId     String
  rating     Int      # 1-5星
}

model SolutionReference {
  id         String   @id @default(uuid())
  solutionId String
  taskId     String
}
```

## 知识沉淀流程
```
创建方案 → 标签分类 → 团队使用 → 任务引用 →
评分反馈 → 计算得分 → 排行榜展示 → 跨项目复用
```

## 排行规则
- **评分榜**: 按平均评分排序
- **引用榜**: 按引用次数排序
- **综合榜**: 评分 × 引用次数

## 核心价值
将成功的工作方法沉淀为可复用的知识资产
