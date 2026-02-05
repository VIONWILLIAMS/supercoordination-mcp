# 短邮系统实施 - 第二步
## 移动端界面 + API集成

**版本**: v1.0
**预计时间**: 2天
**目标**: 将静态原型改造为连接真实API的移动端应用

---

## 🎯 第二步目标

基于 Step 1 的 API 基础，完成以下4个任务：
1. ✅ Step 1 完成（PWP Records + API）
2. ⬜ 移动端认证系统
3. ⬜ 收件箱功能实现
4. ⬜ 决策交流完整流程

---

## 任务1: 移动端认证系统

### 1.1 创建登录页面

创建 `public/shortmail-login.html`：

**功能需求：**
- 邮箱/密码登录
- Token存储（localStorage）
- 自动登录
- 友好的移动端UI

**关键实现：**
```javascript
async function login(email, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();
  if (data.success) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = '/shortmail-app.html';
  }
}
```

### 1.2 添加认证检查

在主应用页面添加认证中间件：

```javascript
function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/shortmail-login.html';
    return null;
  }
  return token;
}
```

---

## 任务2: 改造主应用页面

### 2.1 重命名和重构

```bash
# 重命名原型文件
mv public/shortmail-mvp.html public/shortmail-app.html

# 添加API集成逻辑
```

### 2.2 核心功能模块

**模块1: 收件箱（Inbox）**

```javascript
async function loadInbox() {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));

  const response = await fetch(
    `/api/pwp/user/${user.id}/pending-decisions`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  const data = await response.json();
  renderInbox(data.records);
}

function renderInbox(records) {
  const container = document.querySelector('.mail-list');
  container.innerHTML = records.map(record => `
    <div class="mail-card" onclick="openDecisionDetail('${record.id}')">
      <div class="mail-header">
        <div class="sender-info">
          <div class="sender-name">${record.user.username}</div>
          <div class="project-tag">${record.project?.name || '独立任务'}</div>
        </div>
        <div class="time">${formatTime(record.occurred_at)}</div>
      </div>
      <div class="mail-content">
        <h3>${record.event_data.summary}</h3>
        ${record.event_data.content?.text || ''}
      </div>
      <div class="ai-suggestions">
        <div class="ai-tag">🤖 AI建议</div>
        <div class="suggestion-text">${record.event_data.aiSuggestions.question}</div>
        <div class="quick-actions">
          ${record.event_data.aiSuggestions.options.map(opt =>
            `<button class="quick-btn">${opt}</button>`
          ).join('')}
        </div>
      </div>
    </div>
  `).join('');
}
```

**模块2: 决策详情页**

```javascript
async function openDecisionDetail(recordId) {
  const token = localStorage.getItem('token');

  // 获取决策详情
  const response = await fetch(
    `/api/pwp/user/${getCurrentUserId()}/pending-decisions`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  const data = await response.json();
  const record = data.records.find(r => r.id === recordId);

  // 显示详情模态框
  showDecisionModal(record);
}

function showDecisionModal(record) {
  const modal = document.createElement('div');
  modal.className = 'decision-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${record.event_data.summary}</h2>
        <button onclick="closeModal()">✕</button>
      </div>

      <div class="modal-body">
        <div class="sender-section">
          <img src="${record.user.avatarUrl || '/default-avatar.png'}">
          <div>
            <div class="sender-name">${record.user.username}</div>
            <div class="time">${formatTime(record.occurred_at)}</div>
          </div>
        </div>

        <div class="content-section">
          ${record.event_data.content?.text || ''}
        </div>

        <div class="ai-section">
          <h3>🤖 AI决策建议</h3>
          <p>${record.event_data.aiSuggestions.question}</p>
          <div class="options">
            ${record.event_data.aiSuggestions.options.map(opt =>
              `<button class="option-btn" onclick="selectOption('${record.id}', '${opt}')">
                ${opt}
              </button>`
            ).join('')}
          </div>
          ${record.event_data.aiSuggestions.tips ?
            `<p class="tips">💡 ${record.event_data.aiSuggestions.tips}</p>` : ''}
        </div>

        <div class="response-section">
          <textarea id="response-comment" placeholder="添加你的评论（可选）"></textarea>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">取消</button>
        <button class="btn-primary" onclick="submitResponse('${record.id}')">确认响应</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}
```

**模块3: 响应决策**

```javascript
async function submitResponse(requestId) {
  const token = localStorage.getItem('token');
  const decision = document.querySelector('.option-btn.selected')?.textContent;
  const comment = document.getElementById('response-comment').value;

  if (!decision) {
    alert('请选择一个决策选项');
    return;
  }

  const response = await fetch('/api/pwp/decision-responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requestId,
      decision,
      comment
    })
  });

  const data = await response.json();

  if (data.success) {
    closeModal();
    showToast('✅ 决策已提交');
    loadInbox(); // 刷新收件箱
  } else {
    alert('提交失败：' + data.error);
  }
}
```

**模块4: 创建决策请求**

```javascript
function showCreateDecisionModal() {
  const modal = document.createElement('div');
  modal.className = 'decision-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>📤 创建决策请求</h2>
        <button onclick="closeModal()">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label>接收人</label>
          <select id="to-user">
            <!-- 动态加载项目成员 -->
          </select>
        </div>

        <div class="form-group">
          <label>项目</label>
          <select id="project">
            <!-- 动态加载用户项目 -->
          </select>
        </div>

        <div class="form-group">
          <label>摘要</label>
          <input type="text" id="summary" placeholder="简短描述决策事项">
        </div>

        <div class="form-group">
          <label>详细内容</label>
          <textarea id="content" placeholder="详细描述背景和需要决策的内容"></textarea>
        </div>

        <div class="form-group">
          <label>决策类型</label>
          <select id="protocol-type">
            <option value="DECISION_REQUIRED">一般决策</option>
            <option value="TASK_ASSIGNMENT">任务分配</option>
            <option value="DELIVERABLE_SUBMISSION">交付物提交</option>
            <option value="FEEDBACK_REQUEST">反馈请求</option>
          </select>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">取消</button>
        <button class="btn-primary" onclick="submitDecisionRequest()">发送</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  loadProjectMembers();
  loadUserProjects();
}

async function submitDecisionRequest() {
  const token = localStorage.getItem('token');

  const data = {
    toUserId: document.getElementById('to-user').value,
    projectId: document.getElementById('project').value,
    summary: document.getElementById('summary').value,
    content: {
      text: document.getElementById('content').value
    },
    protocolType: document.getElementById('protocol-type').value
  };

  const response = await fetch('/api/pwp/decision-requests', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  const result = await response.json();

  if (result.success) {
    closeModal();
    showToast('✅ 决策请求已发送');
  } else {
    alert('发送失败：' + result.error);
  }
}
```

**模块5: 决策链可视化**

```javascript
async function loadDecisionChain() {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));

  // 获取用户参与的所有项目
  const projectsResponse = await fetch('/api/projects', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const projectsData = await projectsResponse.json();

  // 获取每个项目的决策记录
  const allDecisions = [];
  for (const project of projectsData.projects) {
    const decisionsResponse = await fetch(
      `/api/pwp/project/${project.id}/decisions`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    const decisionsData = await decisionsResponse.json();
    allDecisions.push(...decisionsData.records);
  }

  // 按conversationId分组
  const conversations = groupByConversation(allDecisions);
  renderDecisionChain(conversations);
}

function renderDecisionChain(conversations) {
  const container = document.querySelector('.decision-chain');
  container.innerHTML = conversations.map(conv => `
    <div class="chain-item">
      <div class="chain-timeline">
        ${conv.records.map((record, index) => `
          <div class="timeline-node ${record.status}">
            <div class="node-icon">${getEventIcon(record.event_type)}</div>
            <div class="node-content">
              <div class="node-title">${getEventTitle(record.event_type)}</div>
              <div class="node-summary">${record.event_data.summary || record.event_data.decision}</div>
              <div class="node-time">${formatTime(record.occurred_at)}</div>
            </div>
            ${index < conv.records.length - 1 ? '<div class="connector"></div>' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}
```

---

## 任务3: UI/UX优化

### 3.1 添加加载状态

```javascript
function showLoading() {
  const loader = document.createElement('div');
  loader.className = 'loading-overlay';
  loader.innerHTML = `
    <div class="spinner"></div>
    <p>加载中...</p>
  `;
  document.body.appendChild(loader);
}

function hideLoading() {
  const loader = document.querySelector('.loading-overlay');
  if (loader) loader.remove();
}
```

### 3.2 添加Toast提示

```javascript
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
```

### 3.3 添加下拉刷新

```javascript
let startY = 0;
let isPulling = false;

document.addEventListener('touchstart', (e) => {
  if (window.scrollY === 0) {
    startY = e.touches[0].pageY;
    isPulling = true;
  }
});

document.addEventListener('touchmove', (e) => {
  if (isPulling) {
    const currentY = e.touches[0].pageY;
    const pullDistance = currentY - startY;

    if (pullDistance > 100) {
      showRefreshIndicator();
    }
  }
});

document.addEventListener('touchend', (e) => {
  if (isPulling) {
    const pullDistance = e.changedTouches[0].pageY - startY;
    if (pullDistance > 100) {
      refreshData();
    }
    isPulling = false;
    hideRefreshIndicator();
  }
});
```

---

## 任务4: 样式优化

### 4.1 添加模态框样式

```css
.decision-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  z-index: 1000;
  animation: fadeIn 0.3s;
}

.modal-content {
  background: white;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  animation: slideUp 0.3s;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.modal-header {
  padding: 20px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  padding: 20px;
  border-top: 1px solid #eee;
  display: flex;
  gap: 10px;
}
```

### 4.2 添加Toast样式

```css
.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%) translateY(-100px);
  background: white;
  padding: 15px 25px;
  border-radius: 25px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
  z-index: 2000;
  opacity: 0;
  transition: all 0.3s;
}

.toast.show {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

.toast-success {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}
```

### 4.3 添加加载动画

```css
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## 验收标准

```
✅ 认证系统
   ├─ 登录页面美观且功能正常
   ├─ Token持久化存储
   ├─ 自动登录检查
   └─ 登出功能

✅ 收件箱功能
   ├─ 正确显示待决策事项
   ├─ AI建议清晰展示
   ├─ 卡片交互流畅
   └─ 下拉刷新可用

✅ 决策详情
   ├─ 完整显示决策信息
   ├─ 快速响应按钮可用
   ├─ 评论输入正常
   └─ 提交成功反馈

✅ 创建决策请求
   ├─ 表单验证完整
   ├─ 项目和成员动态加载
   ├─ 发送成功
   └─ 错误提示友好

✅ 决策链
   ├─ 对话线程可视化
   ├─ 时间轴清晰
   ├─ 状态区分明显
   └─ 点击可查看详情

✅ UI/UX
   ├─ 移动端适配完美
   ├─ 触摸交互流畅
   ├─ 加载状态友好
   └─ 错误提示清晰
```

---

## 测试流程

### 端到端测试场景

**场景1: 用户登录并查看收件箱**
1. 打开 /shortmail-login.html
2. 输入账号密码登录
3. 自动跳转到收件箱
4. 看到待决策列表

**场景2: 响应决策请求**
1. 点击收件箱中的短邮卡片
2. 查看决策详情
3. 查看AI建议
4. 选择决策选项
5. 添加评论
6. 提交响应
7. 看到成功提示
8. 收件箱刷新

**场景3: 创建决策请求**
1. 点击"+"按钮
2. 选择接收人
3. 选择项目
4. 填写摘要和内容
5. 选择决策类型
6. 提交
7. 看到成功提示

**场景4: 查看决策链**
1. 切换到"决策链"标签
2. 看到所有对话线程
3. 点击查看详情
4. 时间轴正确显示

---

## 下一步

Step 2 完成后，继续：
- **Step 3**: 桌面端集成（在 project-detail.html 中展示决策交流）
- **Step 4**: 测试和优化
- **Step 5**: 部署和上线

---

**预计时间**: 12-16小时（2个工作日）

**【五行属性】**: 🌳木（产品实现） + 🔥火（用户体验）
**【道法术势器】**: 器（产出产品）
**【心法】**: 造器以成其事，用户体验至上

