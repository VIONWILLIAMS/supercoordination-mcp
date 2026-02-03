# 01_用户系统

## 模块概述
用户注册、登录、认证和PWP五行画像系统

## 核心文件
- **login.html** - 用户登录页面
- **register.html** - 用户注册页面
- **profile.html** - 个人主页（PWP画像）
- **auth.js** - JWT认证服务

## 主要功能
1. ✅ 用户注册（邮箱+密码）
2. ✅ 用户登录（JWT Token）
3. ✅ PWP五行画像填写
4. ✅ 积分系统
5. ✅ AI守门人审核

## API端点
```
POST /api/auth/register     # 注册
POST /api/auth/login        # 登录
GET  /api/auth/me           # 获取当前用户
PUT  /api/auth/profile      # 更新资料
POST /api/auth/pwp-profile  # 更新PWP画像
```

## 数据模型
```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  password     String
  name         String
  pwpProfile   Json?    # PWP五行画像
  points       Int      @default(0)
  status       String   @default("pending")
  createdAt    DateTime @default(now())
}
```

## 认证流程
```
注册 → AI评估 → 审核 → 激活 → 登录 → JWT Token → 访问系统
```
