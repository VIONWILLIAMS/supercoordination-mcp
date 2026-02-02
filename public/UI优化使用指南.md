# 超协体 UI 优化使用指南

## 📦 新增的UI组件库

### 1. Toast 通知组件 (`toast.js`)

替代所有 `alert()` 调用，提供更优雅的用户反馈。

#### 基础用法

```javascript
// 成功提示
Toast.success('操作成功！');

// 错误提示
Toast.error('操作失败，请重试');

// 警告提示
Toast.warning('请注意安全风险');

// 信息提示
Toast.info('这是一条普通消息');
```

#### 高级用法

```javascript
// 自定义持续时间（默认3000ms）
Toast.success('5秒后自动关闭', 5000);

// 不自动关闭（需要用户手动点击X）
Toast.error('严重错误，请手动关闭', 0);

// 清除所有Toast
Toast.clear();
```

#### 替换示例

**之前：**
```javascript
alert('🎉 ' + data.message + '\n\n你的超协体序号：#' + data.member.serialNumber);
```

**之后：**
```javascript
Toast.success(`${data.message}\n你的超协体序号：#${data.member.serialNumber}`);
```

---

### 2. Modal 对话框组件 (`modal.js`)

替代 `confirm()` 和 `prompt()`，提供可定制的对话框。

#### confirm 确认对话框

```javascript
// 基础确认
const confirmed = await Modal.confirm('确认删除吗？', '删除后无法恢复');
if (confirmed) {
    // 用户点击了确认
}

// 危险操作（红色按钮）
const confirmed = await Modal.confirm(
    '确认删除所有数据？',
    '此操作不可逆，所有数据将永久丢失',
    {
        title: '危险操作',
        icon: '⚠️',
        confirmText: '确认删除',
        cancelText: '取消',
        danger: true  // 红色确认按钮
    }
);
```

#### prompt 输入对话框

```javascript
// 获取用户输入
const taskName = await Modal.prompt('请输入任务名称', '默认任务名');
if (taskName !== null) {
    // 用户输入了内容并点击确定
    console.log('任务名称:', taskName);
}

// 带占位符
const email = await Modal.prompt('请输入邮箱', '', {
    title: '绑定邮箱',
    placeholder: 'example@domain.com'
});
```

#### alert 警告对话框

```javascript
// 简单提示
await Modal.alert('操作完成！');

// 自定义标题和图标
await Modal.alert('重要通知：系统将在5分钟后维护', {
    title: '系统维护通知',
    icon: '🔧'
});
```

#### 替换示例

**之前：**
```javascript
if (!confirm('确认接受AI邀请，正式加入超协体？')) return;
```

**之后：**
```javascript
const confirmed = await Modal.confirm(
    '确认接受AI邀请，正式加入超协体？',
    '加入后将获得完整的协作权限'
);
if (!confirmed) return;
```

---

### 3. CSS 变量系统 (`variables.css`)

统一的设计令牌，支持主题切换。

#### 颜色使用

```css
/* 主色调 */
background: var(--gradient-primary);
color: var(--color-primary);

/* 语义色彩 */
background: var(--color-success);
background: var(--color-error);
background: var(--color-warning);
background: var(--color-info);

/* 文字颜色 */
color: var(--color-text-primary);
color: var(--color-text-secondary);
color: var(--color-text-tertiary);
```

#### 间距使用

```css
/* 替代固定像素值 */
padding: var(--space-4);          /* 16px */
margin-bottom: var(--space-6);    /* 24px */
gap: var(--space-3);              /* 12px */
```

#### 圆角使用

```css
border-radius: var(--radius-sm);   /* 4px */
border-radius: var(--radius-md);   /* 8px */
border-radius: var(--radius-lg);   /* 12px */
border-radius: var(--radius-xl);   /* 16px */
```

#### 阴影使用

```css
box-shadow: var(--shadow-sm);
box-shadow: var(--shadow-md);
box-shadow: var(--shadow-lg);
box-shadow: var(--shadow-xl);
```

---

### 4. 公共样式库 (`common.css`)

预定义的组件和工具类，减少重复代码。

#### 按钮样式

```html
<!-- 主按钮 -->
<button class="btn btn-primary">主要操作</button>

<!-- 成功按钮 -->
<button class="btn btn-success">确认</button>

<!-- 危险按钮 -->
<button class="btn btn-danger">删除</button>

<!-- 次要按钮 -->
<button class="btn btn-secondary">取消</button>

<!-- 幽灵按钮 -->
<button class="btn btn-ghost">了解更多</button>

<!-- 按钮尺寸 -->
<button class="btn btn-primary btn-sm">小按钮</button>
<button class="btn btn-primary">默认</button>
<button class="btn btn-primary btn-lg">大按钮</button>

<!-- 块级按钮 -->
<button class="btn btn-primary btn-block">全宽按钮</button>
```

#### 表单样式

```html
<div class="form-group">
    <label class="form-label">用户名</label>
    <input type="text" class="form-input" placeholder="请输入用户名">
    <span class="form-help">用户名需要6-20个字符</span>
</div>

<div class="form-group">
    <label class="form-label">描述</label>
    <textarea class="form-textarea"></textarea>
    <span class="form-error">此字段为必填项</span>
</div>
```

#### 卡片样式

```html
<div class="card">
    <div class="card-header">
        <h3 class="card-title">卡片标题</h3>
    </div>
    <div class="card-body">
        卡片内容...
    </div>
    <div class="card-footer">
        <button class="btn btn-primary">操作</button>
    </div>
</div>
```

#### 徽章样式

```html
<span class="badge badge-primary">主要</span>
<span class="badge badge-success">成功</span>
<span class="badge badge-error">错误</span>
<span class="badge badge-warning">警告</span>
<span class="badge badge-info">信息</span>
<span class="badge badge-gray">灰色</span>
```

#### 加载状态

```html
<div class="loading">
    <div class="spinner"></div>
    <div>加载中...</div>
</div>

<!-- 不同尺寸 -->
<div class="spinner spinner-sm"></div>
<div class="spinner"></div>
<div class="spinner spinner-lg"></div>
```

#### 空状态

```html
<div class="empty-state">
    <div class="empty-icon">📭</div>
    <div class="empty-title">暂无数据</div>
    <div class="empty-description">还没有创建任何内容</div>
    <button class="btn btn-primary">创建第一个</button>
</div>
```

---

## 🚀 快速迁移指南

### 步骤1：在HTML文件头部引入新样式和脚本

在所有 `.html` 文件的 `<head>` 标签中添加：

```html
<!-- CSS文件 -->
<link rel="stylesheet" href="/css/variables.css">
<link rel="stylesheet" href="/css/common.css">

<!-- JS文件（在</body>前） -->
<script src="/js/toast.js"></script>
<script src="/js/modal.js"></script>
```

### 步骤2：替换 alert()

**查找：** `alert(`
**替换为：** `Toast.success(` 或 `Toast.error(`

### 步骤3：替换 confirm()

**查找：** `if (!confirm('...')) return;`
**替换为：**
```javascript
const confirmed = await Modal.confirm('...');
if (!confirmed) return;
```

### 步骤4：替换 prompt()

**查找：** `const value = prompt('...');`
**替换为：** `const value = await Modal.prompt('...');`

### 步骤5：使用CSS变量替换硬编码值

**查找：** `color: #667eea;`
**替换为：** `color: var(--color-primary);`

**查找：** `padding: 16px;`
**替换为：** `padding: var(--space-4);`

---

## 📋 完整迁移清单

### Dashboard.html 需要修改的地方（示例）

1. **第873行** - `confirm('确认接受AI邀请...')` → `Modal.confirm()`
2. **第882行** - `alert('🎉 ' + data.message)` → `Toast.success()`
3. **第1181行** - `alert('提交成功！')` → `Toast.success()`
4. **第1192行** - `alert(data.message)` → `Toast.error()`
5. **第1196行** - `prompt('请输入任务名称')` → `Modal.prompt()`
6. **第1335行** - `confirm('确认删除...')` → `Modal.confirm(..., { danger: true })`

### 样式优化（所有文件）

将内联的渐变色替换为CSS变量：

```css
/* 之前 */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* 之后 */
background: var(--gradient-primary);
```

---

## 🎨 设计一致性建议

### 颜色使用规范

- **主要操作** → `var(--color-primary)` 或 `var(--gradient-primary)`
- **成功反馈** → `var(--color-success)` 或 `var(--gradient-success)`
- **错误警告** → `var(--color-error)` 或 `var(--gradient-error)`
- **中性信息** → `var(--color-text-secondary)`

### 间距规范

- **小间距** → `var(--space-2)` (8px)
- **默认间距** → `var(--space-4)` (16px)
- **大间距** → `var(--space-6)` (24px)
- **特大间距** → `var(--space-8)` (32px)

### 圆角规范

- **小组件**（按钮、输入框）→ `var(--radius-lg)` (12px)
- **卡片** → `var(--radius-xl)` (16px)
- **大容器** → `var(--radius-2xl)` (20px)

---

## ✅ 下一步行动

### 今日可完成（1-2小时）

1. ✅ 在 `dashboard.html` 头部引入新CSS和JS
2. ✅ 替换 `dashboard.html` 中所有 `alert()` → `Toast`
3. ✅替换 `dashboard.html` 中所有 `confirm()` → `Modal`
4. ✅ 测试新组件是否正常工作

### 本周完成（4-6小时）

5. ⬜ 迁移所有其他HTML文件
6. ⬜ 统一所有按钮样式为 `.btn` 类
7. ⬜ 提取内联CSS到 `common.css`
8. ⬜ 所有硬编码颜色改为CSS变量

### 后续优化（按需）

9. ⬜ 添加表单实时验证
10. ⬜ 实现骨架屏加载
11. ⬜ 优化移动端响应式
12. ⬜ 添加深色模式支持

---

## 🔍 验证方法

### 测试Toast

打开浏览器控制台，输入：

```javascript
Toast.success('测试成功提示');
Toast.error('测试错误提示');
Toast.warning('测试警告提示');
Toast.info('测试信息提示');
```

### 测试Modal

```javascript
Modal.confirm('这是确认对话框', '详细描述').then(result => {
    console.log('用户选择:', result);
});

Modal.prompt('请输入内容').then(value => {
    console.log('用户输入:', value);
});
```

### 测试CSS变量

在浏览器开发者工具中检查元素，看到以下样式即为成功：

```css
color: var(--color-primary); /* 而不是 #667eea */
padding: var(--space-4);     /* 而不是 16px */
```

---

## 📞 问题反馈

如果在使用过程中遇到问题，请检查：

1. ✅ CSS和JS文件路径是否正确
2. ✅ 是否在所有页面都引入了必要文件
3. ✅ 浏览器控制台是否有JavaScript错误
4. ✅ CSS变量是否在`:root`中正确定义

---

**文档版本：** V1.0
**更新时间：** 2026-02-03
**适用项目：** 超协体 v2.0

🎉 享受全新的UI体验！
