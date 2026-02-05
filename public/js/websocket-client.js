// WebSocket客户端 - 实时协作
class WebSocketClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.onlineUsers = new Map();
    this.listeners = new Map();
  }

  /**
   * 连接到WebSocket服务器
   */
  connect() {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('[WebSocket] 未找到token，跳过连接');
      return;
    }

    // 加载socket.io客户端
    if (typeof io === 'undefined') {
      console.error('[WebSocket] socket.io客户端未加载');
      return;
    }

    this.socket = io({
      auth: {
        token: token
      }
    });

    // 连接成功
    this.socket.on('connect', () => {
      console.log('[WebSocket] 已连接');
      this.connected = true;
      this.emit('connected');
    });

    // 连接错误
    this.socket.on('connect_error', (error) => {
      console.error('[WebSocket] 连接错误:', error.message);
      this.connected = false;
    });

    // 断开连接
    this.socket.on('disconnect', () => {
      console.log('[WebSocket] 已断开');
      this.connected = false;
      this.emit('disconnected');
    });

    // 监听用户上线
    this.socket.on('user:online', (data) => {
      console.log(`[WebSocket] 用户上线: ${data.username}`);
      this.onlineUsers.set(data.userId, data);
      this.emit('user-online', data);
      this.updateOnlineCount(data.onlineCount);
    });

    // 监听用户下线
    this.socket.on('user:offline', (data) => {
      console.log(`[WebSocket] 用户下线: ${data.username}`);
      this.onlineUsers.delete(data.userId);
      this.emit('user-offline', data);
      this.updateOnlineCount(data.onlineCount);
    });

    // 在线用户列表
    this.socket.on('users:online-list', (data) => {
      console.log(`[WebSocket] 在线用户: ${data.total}人`);
      this.onlineUsers.clear();
      data.users.forEach(user => {
        this.onlineUsers.set(user.userId, user);
      });
      this.emit('online-users-updated', data.users);
      this.updateOnlineCount(data.total);
    });

    // 任务状态变更
    this.socket.on('task:status-changed', (data) => {
      console.log(`[WebSocket] 任务状态更新: ${data.taskId} -> ${data.status}`);
      this.emit('task-status-changed', data);
      this.showNotification(`${data.updatedBy}更新了任务状态`, 'info');
    });

    // 任务分配变更
    this.socket.on('task:assignment-changed', (data) => {
      console.log(`[WebSocket] 任务分配更新: ${data.taskId}`);
      this.emit('task-assignment-changed', data);
      this.showNotification(`${data.assignedBy}分配了任务`, 'info');
    });

    // 新任务创建
    this.socket.on('task:new', (data) => {
      console.log(`[WebSocket] 新任务: ${data.task.title}`);
      this.emit('task-created', data);
      this.showNotification(`${data.createdBy}创建了新任务`, 'success');
    });

    // 用户加入任务房间
    this.socket.on('task:user-joined', (data) => {
      console.log(`[WebSocket] ${data.username} 加入任务: ${data.taskId}`);
      this.emit('task-user-joined', data);
    });

    // 用户离开任务房间
    this.socket.on('task:user-left', (data) => {
      console.log(`[WebSocket] ${data.username} 离开任务: ${data.taskId}`);
      this.emit('task-user-left', data);
    });

    // 用户正在编辑
    this.socket.on('task:user-editing', (data) => {
      this.emit('task-user-editing', data);
    });

    // 用户停止编辑
    this.socket.on('task:user-stop-editing', (data) => {
      this.emit('task-user-stop-editing', data);
    });

    // 系统通知
    this.socket.on('notification:received', (data) => {
      this.showNotification(data.message, data.type);
      this.emit('notification-received', data);
    });
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * 加入任务房间
   */
  joinTask(taskId) {
    if (this.socket && this.connected) {
      this.socket.emit('task:join', taskId);
    }
  }

  /**
   * 离开任务房间
   */
  leaveTask(taskId) {
    if (this.socket && this.connected) {
      this.socket.emit('task:leave', taskId);
    }
  }

  /**
   * 通知任务状态更新
   */
  notifyTaskStatusUpdate(taskId, status) {
    if (this.socket && this.connected) {
      this.socket.emit('task:status-updated', { taskId, status });
    }
  }

  /**
   * 通知任务分配更新
   */
  notifyTaskAssignmentUpdate(taskId, assignedTo) {
    if (this.socket && this.connected) {
      this.socket.emit('task:assignment-updated', { taskId, assignedTo });
    }
  }

  /**
   * 通知任务创建
   */
  notifyTaskCreated(task) {
    if (this.socket && this.connected) {
      this.socket.emit('task:created', { taskId: task.id, task });
    }
  }

  /**
   * 通知正在编辑
   */
  notifyEditing(taskId, field) {
    if (this.socket && this.connected) {
      this.socket.emit('task:editing', { taskId, field });
    }
  }

  /**
   * 通知停止编辑
   */
  notifyStopEditing(taskId) {
    if (this.socket && this.connected) {
      this.socket.emit('task:stop-editing', { taskId });
    }
  }

  /**
   * 发送系统通知（仅管理员）
   */
  sendNotification(type, message) {
    if (this.socket && this.connected) {
      this.socket.emit('notification:send', { type, message });
    }
  }

  /**
   * 注册事件监听器
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * 移除事件监听器
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[WebSocket] 事件处理错误 (${event}):`, error);
        }
      });
    }
  }

  /**
   * 获取在线用户数
   */
  getOnlineCount() {
    return this.onlineUsers.size;
  }

  /**
   * 获取在线用户列表
   */
  getOnlineUsers() {
    return Array.from(this.onlineUsers.values());
  }

  /**
   * 更新在线人数显示
   */
  updateOnlineCount(count) {
    const elements = document.querySelectorAll('.online-count');
    elements.forEach(el => {
      el.textContent = count || this.onlineUsers.size;
    });
  }

  /**
   * 显示通知
   */
  showNotification(message, type = 'info') {
    // 使用浏览器通知API
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('超协体', {
        body: message,
        icon: '/favicon.ico'
      });
    }

    // 在页面上显示toast通知
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 10000;
      animation: slideInRight 0.3s ease-out;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// 全局WebSocket客户端实例
window.wsClient = new WebSocketClient();

// 页面加载时自动连接
window.addEventListener('load', () => {
  const token = localStorage.getItem('token');
  if (token) {
    // 请求通知权限
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // 延迟连接，确保页面完全加载
    setTimeout(() => {
      window.wsClient.connect();
    }, 500);
  }
});

// 页面卸载时断开连接
window.addEventListener('beforeunload', () => {
  if (window.wsClient) {
    window.wsClient.disconnect();
  }
});

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOutRight {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
