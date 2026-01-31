# Super 启动命令使用说明

## ✅ 已完成配置

### 1. 启动脚本
文件：`~/super.sh`

**功能**：
- ✅ 自动检查并启动 MCP 服务器（后台运行）
- ✅ 自动启动 Claude Code 并进入超协体项目目录
- ✅ 自动设置专用任务列表 `CLAUDE_CODE_TASK_LIST_ID=supercoordination`
- ✅ 智能检测：如果服务器已在运行，不会重复启动

### 2. 快捷命令
在 `~/.zshrc` 中配置：
```bash
alias super='~/super.sh'
```

## 🚀 使用方法

### 使用场景说明

**场景1：在普通终端中使用**
- 用途：启动 MCP 服务器 + 打开 Claude Code
- 适合：每天开始工作时使用

**场景2：已在 Claude Code 中使用**
- 用途：只确保 MCP 服务器已启动
- 适合：在 Claude Code 会话中快速检查服务器状态

### 方法1：使用快捷命令（推荐）

**首次使用**，需要先加载配置：
```bash
source ~/.zshrc
super
```

**之后每次使用**（新终端窗口会自动加载）：
```bash
super
```

### 方法2：直接执行脚本

不需要加载 zshrc，直接运行：
```bash
~/super.sh
```

或者：
```bash
bash ~/super.sh
```

## 📋 启动流程

### 流程A：在普通终端中执行

```
1. 🚀 启动超协体项目...
   └─ 切换到项目目录

2. 🌟 检查 MCP 服务器状态
   ├─ 如果已运行 → ✅ 跳过启动
   └─ 如果未运行 → 后台启动服务器

3. ⏳ 等待服务器就绪（3秒）
   └─ 验证端口 3000 是否监听

4. 📝 显示服务器信息
   ├─ PID（进程ID）
   └─ 日志文件位置

5. 💼 启动 Claude Code
   ├─ 设置任务列表 ID: supercoordination
   └─ 在项目目录中打开 Claude Code
```

### 流程B：在 Claude Code 会话中执行

```
1. 🚀 启动超协体项目...
   └─ 切换到项目目录

2. 🌟 检查 MCP 服务器状态
   ├─ 如果已运行 → ✅ 跳过启动
   └─ 如果未运行 → 后台启动服务器

3. 💼 检测到已在 Claude Code 中
   └─ 显示当前状态和服务器信息
   └─ 无需再启动 Claude Code
```

## 🎯 启动后您会看到

### 输出A：在普通终端中（首次启动）

```
🚀 启动超协体项目...
🌟 启动 MCP 服务器 (后台运行)...
⏳ 等待服务器启动...
✅ MCP服务器启动成功 (PID: 12345)
📝 服务器日志: /tmp/supercoordination-server.log

🌟════════════════════════════════════════════════════🌟
  超协体项目已就绪
🌟════════════════════════════════════════════════════🌟

💼 启动 Claude Code (任务列表: supercoordination)...
```

然后 Claude Code 会自动打开，您可以立即开始工作。

### 输出B：在 Claude Code 会话中

```
🚀 启动超协体项目...
✅ MCP服务器已在运行 (端口3000)

🌟════════════════════════════════════════════════════🌟
  超协体项目已就绪
🌟════════════════════════════════════════════════════🌟

💼 检测到已在 Claude Code 会话中
✅ 服务器已启动，您可以直接开始工作！

📍 当前目录: /Users/personalworkplacce/ClaudeWorkspace/supercoordination-mcp
📍 任务列表: 使用 TodoWrite 工具管理任务
📍 服务器地址: http://192.168.1.3:3000/mcp
```

脚本会智能检测您已经在 Claude Code 中，不会重复启动。

## 🔍 验证配置

### 检查服务器状态
```bash
lsof -i :3000
```

预期输出：显示 node 进程监听 3000 端口

### 查看服务器日志
```bash
tail -f /tmp/supercoordination-server.log
```

### 检查任务列表 ID
在 Claude Code 中执行：
```bash
echo $CLAUDE_CODE_TASK_LIST_ID
```

预期输出：`supercoordination`

## ❓ 常见问题

### Q: 执行 `super` 提示 "command not found"

**原因**：zshrc 配置未加载

**解决方案**：
```bash
# 方案1：加载配置
source ~/.zshrc
super

# 方案2：直接用脚本
~/super.sh
```

### Q: 服务器启动失败

**排查步骤**：
1. 查看错误日志：
   ```bash
   cat /tmp/supercoordination-server.log
   ```

2. 检查端口占用：
   ```bash
   lsof -i :3000
   ```

3. 如果端口被占用，停止旧进程：
   ```bash
   pkill -f "node src/server.js"
   ```

4. 重新启动：
   ```bash
   super
   ```

### Q: Claude Code 没有自动进入项目目录

**原因**：脚本已经切换了目录，Claude Code 会在项目目录中打开

**验证**：在 Claude Code 中执行 `pwd`，应该显示：
```
/Users/personalworkplacce/ClaudeWorkspace/supercoordination-mcp
```

### Q: 如何停止 MCP 服务器？

**方法1：按进程 ID 停止**
```bash
# 先找到 PID（启动时会显示）
kill <PID>
```

**方法2：按名称停止**
```bash
pkill -f "node src/server.js"
```

**方法3：按端口停止**
```bash
lsof -ti :3000 | xargs kill
```

### Q: 如何查看正在运行的后台服务器？

```bash
ps aux | grep "node src/server.js"
```

## 🔄 完整工作流程示例

### 场景1：首次启动（今天第一次）

```bash
# 在任意目录执行
source ~/.zshrc  # 首次需要加载配置
super

# 输出：
# 🚀 启动超协体项目...
# 🌟 启动 MCP 服务器 (后台运行)...
# ✅ MCP服务器启动成功
# 💼 启动 Claude Code...

# Claude Code 打开，您可以开始工作
```

### 场景2：服务器已在运行

```bash
super

# 输出：
# 🚀 启动超协体项目...
# ✅ MCP服务器已在运行 (端口3000)
# 💼 启动 Claude Code...

# Claude Code 打开，直接使用现有服务器
```

### 场景3：关闭一切后重新开始

```bash
# 1. 停止服务器
pkill -f "node src/server.js"

# 2. 重新启动
super

# 一切重新初始化
```

## 🎓 最佳实践

### 每天工作流程

**开始工作**：
```bash
super  # 一个命令搞定
```

**工作期间**：
- MCP 服务器持续在后台运行
- 可以多次打开/关闭 Claude Code，服务器不受影响
- 团队成员可以连接到您的服务器

**结束工作**：
```bash
# 可选：如果要关机或希望节省资源
pkill -f "node src/server.js"
```

### 新终端窗口

每次打开新终端窗口，`super` 别名会自动可用（zsh 会自动加载 ~/.zshrc）

### 多项目切换

```bash
# 超协体项目
super

# 其他项目（如果也配置了）
other-project-command
```

## 📊 脚本特性对比

| 特性 | 旧方案 | 新方案 (super) |
|------|--------|---------------|
| 启动服务器 | 手动 | ✅ 自动 |
| 启动 Claude Code | 手动 | ✅ 自动 |
| 任务列表隔离 | ❌ | ✅ 自动设置 |
| 重复启动检测 | ❌ | ✅ 智能检测 |
| 后台运行 | 需手动 & | ✅ 自动后台 |
| 日志记录 | 无 | ✅ 自动保存 |
| 启动验证 | ❌ | ✅ 自动验证 |
| 命令长度 | 很长 | ✅ 5个字符 |

## 🔗 相关文档

- [任务列表使用说明.md](./任务列表使用说明.md) - 任务列表功能详解
- [快速启动指南.md](./快速启动指南.md) - 其他启动方式
- [项目文档结构.md](./项目文档结构.md) - 完整文档导航

---

**配置完成时间**: 2026-01-24
**脚本位置**: `~/super.sh`
**快捷命令**: `super`
**状态**: ✅ 已就绪
