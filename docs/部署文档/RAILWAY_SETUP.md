# Railway PostgreSQL 配置指南

## 🎯 当前状态

✅ **本地准备完成**：
- Prisma依赖已安装
- 数据库Schema已定义（含 Workspace 任务/成员）
- 数据迁移脚本已准备好

⏳ **等待操作**：在Railway添加PostgreSQL插件

---

## 📋 操作步骤（5分钟）

### 步骤1：访问Railway项目

打开浏览器，访问：
```
https://railway.app
```

### 步骤2：选择项目

点击您的项目：**supercoordination-mvp**

### 步骤3：添加PostgreSQL

1. 点击右上角的 **"New"** 按钮
2. 在下拉菜单中选择 **"Database"**
3. 选择 **"Add PostgreSQL"**

### 步骤4：等待部署

PostgreSQL会自动创建，大约需要30秒。

### 步骤5：验证配置

1. 点击新创建的PostgreSQL服务
2. 进入 **"Variables"** 标签页
3. 确认 `DATABASE_URL` 已自动生成（格式类似：`postgresql://postgres:xxxxx@containers-us-west-xx.railway.app:xxxx/railway`）

> 注意：`postgres.railway.internal` 是 Railway 内网地址，仅在 Railway 运行环境可用。  
> 如果要在本地开发，请使用 Public 连接串（host 通常为 `containers-*.railway.app`）。

### 步骤6：连接到主服务

**重要**：Railway会自动将PostgreSQL的环境变量注入到主服务（supercoordination-mvp），无需手动配置。

您可以在主服务的 **Variables** 页面确认 `DATABASE_URL` 已注入。

> 变量模板参考：`railway.env.example`

### 步骤7：配置必要变量
在主服务 Variables 中至少设置：
- `JWT_SECRET`（必需）

可选：
- `ANTHROPIC_API_KEY`
- `CORS_ORIGINS`

---

## ✅ 完成后通知

添加PostgreSQL完成后，请执行：

1. **生成Prisma客户端**：`npm run prisma:generate`
2. **同步数据库结构**：`npm run prisma:push`
3. **导入旧JSON数据（可选）**：`npm run migrate:store`
4. **验证健康检查**：`/health`

---

## 🔧 本地开发配置（可选）

如果您需要在本地开发，请：

1. 复制 `.env.example` 为 `.env`：
   ```bash
   cp .env.example .env
   ```

2. 从Railway获取数据库URL：
   - Railway → PostgreSQL → Variables → DATABASE_URL
   - 复制完整的连接字符串

3. 粘贴到 `.env` 文件中：
   ```
   DATABASE_URL="postgresql://postgres:xxxxx@containers-us-west-xx.railway.app:xxxx/railway"
   ```

4. 本地同步结构：
   ```bash
   npm run prisma:push
   ```

---

## 📊 数据库Schema预览

```
users                   (用户表)
├── id                  UUID 主键
├── email               邮箱
├── password_hash       密码hash
├── pwp_profile         PWP势能数据（JSON）
├── pwp_completed       PWP是否完成
├── points_balance      积分余额
└── ...

solutions               (方案表)
├── id                  UUID 主键
├── author_id           作者ID
├── title               标题
├── solution_content    方案内容
├── auto_tags           AI标签（JSON）
├── avg_rating          平均评分
└── ...

points_transactions     (积分交易表)
├── id                  UUID 主键
├── user_id             用户ID
├── amount              积分变动量
├── transaction_type    交易类型
└── ...

solution_references     (方案引用表)
solution_ratings        (方案评分表)
tasks                   (任务表)
```

---

## ❓ 常见问题

**Q: PostgreSQL创建失败怎么办？**
A: 刷新页面重试，或检查Railway账户是否有足够的配额。

**Q: DATABASE_URL没有自动注入？**
A: 等待1-2分钟，Railway需要时间同步环境变量。如果仍未注入，手动重启主服务。

**Q: 本地连接数据库报错？**
A: 确认DATABASE_URL格式正确，且网络能访问Railway的数据库端口。

---

**准备好后请告诉我，我将立即执行数据库迁移！** 🚀
