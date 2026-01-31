# 超协体 MCP 服务器 - Railway 云部署指南

## 🚀 为什么选择 Railway？

**优势**：
- ✅ 5分钟完成部署
- ✅ 自动 HTTPS + 免费域名
- ✅ 自动从 GitHub 部署和更新
- ✅ 每月 $5 免费额度（够小团队用）
- ✅ 支持环境变量和持久化存储

**成本**：
- 免费额度：$5/月（约 500 小时运行时间）
- 付费后：按用量计费，约 $5-10/月

---

## 📋 部署前准备

### 1. GitHub 账号
- 注册：https://github.com
- 用于托管代码

### 2. Railway 账号
- 注册：https://railway.app
- 使用 GitHub 登录（推荐）

### 3. 准备代码
- 已完成 ✅（你的超协体项目）

---

## 🛠️ 部署步骤

### 步骤一：准备项目文件

#### 1.1 创建 `.gitignore`

```bash
cd ~/ClaudeWorkspace/supercoordination-mcp
cat > .gitignore << 'EOF'
# Node modules
node_modules/

# 日志
*.log
npm-debug.log*

# 环境变量
.env

# 系统文件
.DS_Store

# 备份文件
backups/

# 临时文件
*.tmp
EOF
```

#### 1.2 确保 package.json 正确

```bash
# 检查 package.json
cat package.json
```

应该包含：
```json
{
  "name": "supercoordination-mcp-server",
  "version": "1.0.0",
  "scripts": {
    "start": "node src/server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "body-parser": "^1.20.2",
    "uuid": "^9.0.0"
  }
}
```

#### 1.3 创建数据目录初始化文件

```bash
# 确保 data 目录存在
mkdir -p data

# 如果 store.json 不存在，创建空的
if [ ! -f data/store.json ]; then
  cat > data/store.json << 'EOF'
{
  "tasks": [],
  "members": [],
  "resources": [],
  "saved_at": "2026-01-31T00:00:00.000Z"
}
EOF
fi
```

---

### 步骤二：推送到 GitHub

#### 2.1 初始化 Git 仓库

```bash
cd ~/ClaudeWorkspace/supercoordination-mcp

# 初始化（如果还没初始化）
git init

# 添加所有文件
git add .

# 创建第一个提交
git commit -m "feat: 超协体 MCP 服务器初始版本

- 10个协作工具
- Web 仪表盘
- 五行能量平衡系统
- 数据持久化

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

#### 2.2 创建 GitHub 仓库

**方法A：使用 GitHub CLI（推荐）**
```bash
# 安装 gh（如果还没装）
brew install gh

# 登录 GitHub
gh auth login

# 创建仓库并推送
gh repo create supercoordination-mcp --public --source=. --remote=origin --push
```

**方法B：手动创建**
1. 访问 https://github.com/new
2. 仓库名：`supercoordination-mcp`
3. 可见性：Public（或 Private，Railway 都支持）
4. 点击 "Create repository"

然后推送：
```bash
git remote add origin https://github.com/<你的用户名>/supercoordination-mcp.git
git branch -M main
git push -u origin main
```

---

### 步骤三：在 Railway 部署

#### 3.1 登录 Railway

1. 访问 https://railway.app
2. 点击 "Login" → "Login with GitHub"
3. 授权 Railway 访问你的 GitHub

#### 3.2 创建新项目

1. 点击 "New Project"
2. 选择 "Deploy from GitHub repo"
3. 选择 `supercoordination-mcp` 仓库
4. Railway 自动检测 Node.js 项目并开始部署

#### 3.3 等待部署完成

- ⏳ 初次部署需要 2-3 分钟
- ✅ 看到 "Success" 表示部署成功

#### 3.4 获取访问地址

1. 点击项目名称
2. 点击 "Settings"
3. 找到 "Domains" 部分
4. 点击 "Generate Domain"
5. 复制域名（例如：`supercoordination-production.up.railway.app`）

---

### 步骤四：配置环境变量（可选）

如果需要自定义端口或其他配置：

1. 在 Railway 项目中点击 "Variables"
2. 添加环境变量：
   - `PORT`：默认自动设置，无需修改
   - `NODE_ENV`：`production`

---

### 步骤五：验证部署

访问你的域名：
```
https://<你的项目名>.up.railway.app
```

应该看到超协体 Web 仪表盘！

**测试健康检查**：
```
https://<你的项目名>.up.railway.app/health
```

---

## 🔧 数据持久化（重要！）

### 问题：Railway 默认不持久化文件

Railway 的文件系统是**临时的**，重启后 `data/store.json` 会丢失。

### 解决方案：使用 Railway Volume（推荐）

#### 1. 在 Railway 项目中添加 Volume

1. 点击项目
2. 点击 "New" → "Volume"
3. 设置：
   - Name: `supercoordination-data`
   - Mount Path: `/app/data`
4. 点击 "Add Volume"

#### 2. 重新部署

Volume 添加后，Railway 会自动重新部署，数据将持久化到 Volume 中。

### 备选方案：使用数据库

如果需要更强大的数据管理，可以接入：
- **Railway PostgreSQL**（Railway 提供）
- **MongoDB Atlas**（免费 512MB）
- **Supabase**（免费 500MB）

---

## 🌐 自定义域名（可选）

### 前提：你拥有一个域名

#### 步骤：

1. **在 Railway 添加自定义域名**：
   - 项目 → Settings → Domains
   - 点击 "Custom Domain"
   - 输入域名：`supercoordination.yourdomain.com`

2. **在域名服务商添加 DNS 记录**：
   - 类型：CNAME
   - 名称：`supercoordination`
   - 值：`<你的项目名>.up.railway.app`
   - TTL：自动

3. **等待 DNS 生效**（5-30分钟）

4. **自动获得 SSL 证书**（Railway 自动配置）

---

## 📊 监控和日志

### 查看实时日志

1. Railway 项目 → Deployments
2. 点击最新部署
3. 点击 "View Logs"

### 查看资源使用

1. Railway 项目 → Metrics
2. 查看：
   - CPU 使用率
   - 内存使用
   - 网络流量

### 设置告警（可选）

Railway 会在资源超限时自动发送邮件通知。

---

## 💰 成本估算

### 免费额度

- **$5/月 免费额度**
- 足够支持：
  - 约 500 小时运行时间
  - 小团队（< 50 人）使用
  - 每天数千次访问

### 付费后成本

**估算**（小团队场景）：
- 基础资源：$5/月
- Volume 存储：$1/月（10GB）
- 流量费用：$1-2/月
- **总计**：约 $7-10/月

**对比腾讯云轻量服务器**：
- 腾讯云：¥50/年 ≈ $7/年
- Railway：$84-120/年

**Railway 优势**：
- 零运维（自动更新、备份、监控）
- 自动 HTTPS
- 全球 CDN
- 开箱即用

---

## 🔐 安全建议

### 1. 添加访问限制（推荐）

编辑 `src/server.js`，添加简单的 API Key 验证：

```javascript
// 在中间件部分添加
const API_KEY = process.env.API_KEY || 'your-secret-key';

app.use((req, res, next) => {
  // 跳过健康检查和静态文件
  if (req.path === '/health' || req.path.startsWith('/') && !req.path.startsWith('/mcp')) {
    return next();
  }

  // 验证 API Key
  const providedKey = req.headers['x-api-key'];
  if (providedKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
});
```

然后在 Railway 添加环境变量：
- `API_KEY`：`你的密钥`

### 2. 启用 CORS 白名单

```javascript
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
```

### 3. 添加速率限制

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100 // 最多100个请求
});

app.use('/mcp', limiter);
```

---

## 🎯 部署后清单

### ✅ 基础验证

- [ ] Web 仪表盘可以访问
- [ ] 健康检查返回 200
- [ ] 能够查看成员列表
- [ ] 能够查看任务列表
- [ ] 五行能量图表正常显示

### ✅ 分享给团队

```
🌐 超协体协作中枢已上线！

📍 访问地址：https://<你的域名>.up.railway.app
📊 查看团队成员、任务进度、五行能量平衡

🔒 仅供查看（只读模式）
⚡ 实时数据，每30秒自动刷新
```

### ✅ 后续优化

- [ ] 添加自定义域名
- [ ] 配置数据库（如需要）
- [ ] 添加用户认证
- [ ] 接入监控告警
- [ ] 配置 CI/CD 自动部署

---

## 📚 相关资源

- **Railway 文档**：https://docs.railway.app
- **GitHub 仓库模板**：https://github.com/railwayapp/examples
- **Railway 社区**：https://railway.app/discord

---

## 🆘 常见问题

### Q1: 部署失败怎么办？

**查看日志**：
1. Railway 项目 → Deployments
2. 点击失败的部署
3. 查看 Build Logs 和 Deploy Logs

**常见原因**：
- `package.json` 缺少依赖
- `start` 脚本错误
- 端口配置错误（Railway 自动设置 PORT，不要硬编码）

### Q2: 数据丢失了？

**确认 Volume 已挂载**：
1. Railway 项目 → 点击 Volume
2. 确认 Mount Path 是 `/app/data`
3. 重新部署

### Q3: 访问很慢？

**原因**：Railway 服务器在国外

**解决方案**：
- 使用腾讯云/阿里云（国内服务器）
- 或者接受 2-3 秒延迟（可接受）

### Q4: 如何更新代码？

**自动部署**（推荐）：
```bash
# 本地修改代码后
git add .
git commit -m "feat: 新功能"
git push

# Railway 自动检测并重新部署
```

**手动触发**：
Railway 项目 → Deployments → "Redeploy"

---

**准备好了吗？开始部署吧！** 🚀

如果遇到问题，随时告诉我！
