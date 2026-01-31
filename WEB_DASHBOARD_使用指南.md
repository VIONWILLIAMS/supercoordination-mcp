# 超协体 Web 仪表盘使用指南

## 🎉 部署完成！

**Web 仪表盘已成功部署并启动**

---

## 🌐 访问方式

### 本地访问（指挥官）
```
http://localhost:3000
```

### 局域网访问（社区成员）
```
http://192.168.1.3:3000
```

**在浏览器中打开以上任一地址即可查看！**

---

## 📊 功能特性

### 1️⃣ 实时统计面板

**四大核心指标**：
- 📈 总成员数
- 📋 总任务数
- 🔥 进行中任务
- ✅已完成任务

**自动更新**：每30秒刷新一次数据

### 2️⃣ 团队成员视图

**显示内容**：
- 👤 成员姓名
- 🎯 技能标签
- 📊 当前负载（任务数量）
- ⚡ 五行能量条（可视化）
- 🌈 主属性标识

**交互功能**：
- 🔄 手动刷新按钮
- 🎨 五行配色（悬停查看详情）

### 3️⃣ 协作任务视图

**显示内容**：
- 📝 任务标题
- 🚦 任务状态（待处理/进行中/已完成/阻塞）
- ⭐ 优先级（S/A/B/C）
- ⚡ 五行属性
- 👤 分配对象
- 📊 完成进度

**智能排序**：按优先级自动排序（S级最前）

### 4️⃣ 五行能量平衡

**可视化展示**：
- 🔥 火（叙事传播）
- ⚙️ 金（框架法则）
- 🌳 木（技术生产）
- 🌊 水（商业运营）
- 🏔️ 土（资产基础）

**智能诊断**：
- ✅ 平衡状态
- ⚠️ 过度警告
- ⚠️ 不足提示
- 📋 调整建议

---

## 🎨 界面特色

### 设计风格

**主题**：深色科技风
- 🌌 深蓝渐变背景
- 💎 玻璃拟态效果
- ✨ 悬停动画
- 🌈 五行配色系统

### 响应式设计

- 💻 桌面端：双栏布局
- 📱 移动端：单栏布局
- 🖥️ 平板端：自适应

### 交互体验

- 🎯 实时加载状态
- ⚡ 平滑动画过渡
- 🔄 一键刷新
- 🔔 自动刷新开关

---

## 🚀 快速开始

### 第一步：打开浏览器

```bash
# macOS
open http://localhost:3000

# Linux
xdg-open http://localhost:3000

# Windows
start http://localhost:3000
```

### 第二步：查看数据

界面会自动加载：
1. ✅ 团队成员列表
2. ✅ 协作任务列表
3. ✅ 五行能量平衡

### 第三步：开启自动刷新

点击页面底部的 **"自动刷新"** 开关：
- 🟢 开启：每30秒自动更新
- ⚪ 关闭：手动刷新

---

## 📱 分享给社区成员

### 方式一：局域网访问

**步骤**：
1. 确保成员在同一局域网
2. 分享地址：`http://192.168.1.3:3000`
3. 成员用浏览器打开即可

**权限**：只读查看（无需登录）

### 方式二：通过 VPN

**适用场景**：远程成员

**推荐方案**：
- Tailscale（免费）
- WireGuard（开源）
- ZeroTier（免费）

**配置后**：
```
http://<Tailscale-IP>:3000
```

---

## 🔒 安全提示

### 当前安全级别

⚠️ **仅观察模式**（只读）

**特性**：
- ✅ 可以查看所有数据
- ❌ 无法修改/删除数据
- ❌ 无法创建新成员/任务

**原因**：Web 界面仅调用查询类工具：
- `list_all_members`
- `list_all_tasks`
- `check_wuxing_balance`

### 访问控制建议

**当前阶段（小团队）**：
- ✅ 局域网访问（安全）
- ✅ 信任的成员

**未来升级**：
- 🔐 添加登录认证
- 🔑 API Key 验证
- 👥 角色权限控制

---

## 🛠️ 技术架构

### 前端技术栈

```
纯前端实现（无需构建）
├── HTML5
├── CSS3（渐变、动画、网格布局）
└── Vanilla JavaScript（原生 JS）
```

**优势**：
- ⚡ 加载快速
- 🎯 无依赖
- 📦 体积小（单文件）
- 🔧 易于修改

### 数据流

```
浏览器
  ↓ HTTP GET
静态文件服务（public/index.html）
  ↓ JavaScript
调用 MCP API（/mcp/tools/call）
  ↓ POST JSON
MCP 服务器处理
  ↓ 返回 JSON
前端渲染显示
```

---

## 🎯 自定义修改

### 修改刷新间隔

编辑 `public/index.html`，找到：
```javascript
autoRefreshInterval = setInterval(refreshAll, 30000);
                                           // ↑ 30000 = 30秒
```

改为：
```javascript
autoRefreshInterval = setInterval(refreshAll, 10000); // 10秒
```

### 修改配色

编辑 CSS 部分的五行配色变量：
```css
.wuxing-huo { color: #ef4444; }  /* 火：红色 */
.wuxing-jin { color: #f59e0b; }  /* 金：橙色 */
.wuxing-mu { color: #22c55e; }   /* 木：绿色 */
.wuxing-shui { color: #3b82f6; } /* 水：蓝色 */
.wuxing-tu { color: #a16207; }   /* 土：棕色 */
```

### 添加新功能

**示例：添加成员详情弹窗**

1. 在 HTML 中添加模态框
2. 在成员项添加点击事件
3. 调用 MCP API 获取详细信息

---

## 🐛 常见问题

### Q1: 页面显示"加载失败"

**原因**：MCP 服务器未启动

**解决**：
```bash
cd ~/ClaudeWorkspace/supercoordination-mcp
npm start
```

### Q2: 数据不刷新

**原因**：自动刷新未开启

**解决**：点击页面底部的"自动刷新"开关

### Q3: 局域网访问失败

**原因**：防火墙阻止

**解决**：
```bash
# macOS 允许端口 3000
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node
```

### Q4: 样式显示异常

**原因**：浏览器缓存

**解决**：强制刷新（Cmd+Shift+R 或 Ctrl+Shift+F5）

---

## 📈 未来功能规划

### 近期（2周内）

- [ ] 📊 任务时间线图表
- [ ] 🔔 实时通知（WebSocket）
- [ ] 📥 导出数据功能（JSON/CSV）
- [ ] 🔍 搜索和过滤

### 中期（1-2个月）

- [ ] 🔐 用户登录认证
- [ ] ✏️ 在线编辑任务
- [ ] 📱 PWA 支持（可添加到桌面）
- [ ] 🌙 明暗主题切换

### 长期（3-6个月）

- [ ] 📊 高级数据可视化（ECharts）
- [ ] 🤖 AI 助手集成
- [ ] 🔄 实时协作（多人同时查看）
- [ ] 📧 邮件通知集成

---

## 📚 相关文档

- **MCP 服务器文档**：`~/ClaudeWorkspace/supercoordination-mcp/README.md`
- **安全指南**：`~/ClaudeWorkspace/supercoordination-mcp/SECURITY_QUICKSTART.md`
- **权限控制方案**：`~/ClaudeWorkspace/supercoordination-mcp/权限控制方案.md`

---

## 🎓 技术支持

**问题反馈**：
- 查看服务器日志：`tail -f /private/tmp/claude/-Users-personalworkplacce/tasks/b43cc05.output`
- 健康检查：`curl http://localhost:3000/health`

**修改建议**：
- 源文件位置：`~/ClaudeWorkspace/supercoordination-mcp/public/index.html`
- 修改后刷新浏览器即可生效（无需重启服务器）

---

**[🔥火 | 器]**

**Web 仪表盘是超协体的"窗口"**，让协作状态透明可见，降低信息不对称！

现在打开浏览器试试吧：**http://localhost:3000** 🚀
