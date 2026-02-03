/**
 * 超协体 Toast 通知组件
 * 替代原生 alert()，提供更好的用户体验
 *
 * 用法：
 *   Toast.success('操作成功！')
 *   Toast.error('操作失败，请重试')
 *   Toast.info('提示信息')
 *   Toast.warning('警告信息')
 */

class ToastManager {
    constructor() {
        this.container = null;
        this.toasts = [];
        this.maxToasts = 5;
        this.init();
    }

    init() {
        // 创建容器
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    /**
     * 显示Toast
     * @param {string} message - 消息内容
     * @param {string} type - 类型: success, error, warning, info
     * @param {number} duration - 持续时间(毫秒)，0表示不自动关闭
     */
    show(message, type = 'info', duration = 3000) {
        // 限制最大数量
        if (this.toasts.length >= this.maxToasts) {
            this.remove(this.toasts[0]);
        }

        const toast = this.createToast(message, type);
        this.toasts.push(toast);
        this.container.appendChild(toast);

        // 触发动画
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // 自动关闭
        if (duration > 0) {
            toast.autoCloseTimer = setTimeout(() => {
                this.remove(toast);
            }, duration);
        }

        return toast;
    }

    createToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icon = this.getIcon(type);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => this.remove(toast);

        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-message">${this.escapeHtml(message)}</div>
        `;
        toast.appendChild(closeBtn);

        // 鼠标悬停暂停自动关闭
        toast.addEventListener('mouseenter', () => {
            if (toast.autoCloseTimer) {
                clearTimeout(toast.autoCloseTimer);
            }
        });

        toast.addEventListener('mouseleave', () => {
            if (toast.autoCloseTimer) {
                toast.autoCloseTimer = setTimeout(() => {
                    this.remove(toast);
                }, 1000);
            }
        });

        return toast;
    }

    remove(toast) {
        if (!toast || !toast.parentElement) return;

        toast.classList.remove('show');
        toast.classList.add('hide');

        setTimeout(() => {
            if (toast.parentElement) {
                this.container.removeChild(toast);
            }
            const index = this.toasts.indexOf(toast);
            if (index > -1) {
                this.toasts.splice(index, 1);
            }
        }, 300);
    }

    getIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 快捷方法
    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration) {
        return this.show(message, 'info', duration);
    }

    // 清除所有Toast
    clear() {
        this.toasts.forEach(toast => this.remove(toast));
    }
}

// 创建全局实例
const Toast = new ToastManager();

// 注入样式
const style = document.createElement('style');
style.textContent = `
/* Toast容器 */
.toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    pointer-events: none;
}

/* Toast基础样式 */
.toast {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 280px;
    max-width: 400px;
    padding: 16px 20px;
    margin-bottom: 12px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
    pointer-events: auto;
    transform: translateX(120%);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 显示动画 */
.toast.show {
    transform: translateX(0);
    opacity: 1;
}

/* 隐藏动画 */
.toast.hide {
    transform: translateX(120%);
    opacity: 0;
}

/* Toast图标 */
.toast-icon {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: bold;
    color: white;
}

/* Toast消息 */
.toast-message {
    flex: 1;
    font-size: 14px;
    line-height: 1.5;
    color: #333;
    word-break: break-word;
}

/* 关闭按钮 */
.toast-close {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: #999;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    transition: color 0.2s;
}

.toast-close:hover {
    color: #333;
}

/* 成功样式 */
.toast-success {
    border-left: 4px solid #10b981;
}

.toast-success .toast-icon {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

/* 错误样式 */
.toast-error {
    border-left: 4px solid #ef4444;
}

.toast-error .toast-icon {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
}

/* 警告样式 */
.toast-warning {
    border-left: 4px solid #f59e0b;
}

.toast-warning .toast-icon {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

/* 信息样式 */
.toast-info {
    border-left: 4px solid #3b82f6;
}

.toast-info .toast-icon {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
}

/* 移动端适配 */
@media (max-width: 640px) {
    .toast-container {
        top: 10px;
        right: 10px;
        left: 10px;
    }

    .toast {
        min-width: auto;
        width: 100%;
    }
}
`;
document.head.appendChild(style);
