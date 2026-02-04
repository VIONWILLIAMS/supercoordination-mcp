/**
 * 超协体 Modal 对话框组件
 * 替代原生 confirm() 和 prompt()
 *
 * 用法：
 *   Modal.confirm('确认删除吗？', '删除后无法恢复').then(confirmed => {
 *       if (confirmed) { ... }
 *   });
 *
 *   Modal.prompt('请输入新名称', '默认值').then(value => {
 *       if (value !== null) { ... }
 *   });
 *
 *   Modal.alert('提示信息');
 */

class ModalManager {
    constructor() {
        this.overlay = null;
        this.currentModal = null;
        this.init();
    }

    init() {
        // 创建遮罩层
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.style.display = 'none';
        document.body.appendChild(this.overlay);

        // 点击遮罩层关闭（仅限非confirm模式）
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay && this.currentModal) {
                if (!this.currentModal.dataset.preventClose) {
                    this.close(false);
                }
            }
        });

        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentModal) {
                if (!this.currentModal.dataset.preventClose) {
                    this.close(false);
                }
            }
        });
    }

    /**
     * 显示确认对话框
     * @param {string} message - 主要消息
     * @param {string} description - 详细描述（可选）
     * @param {object} options - 配置选项
     * @returns {Promise<boolean>} 用户是否确认
     */
    confirm(message, description = '', options = {}) {
        return new Promise((resolve) => {
            const modal = this.createModal('confirm', {
                title: options.title || '确认操作',
                message,
                description,
                icon: options.icon || '⚠️',
                confirmText: options.confirmText || '确认',
                cancelText: options.cancelText || '取消',
                danger: options.danger || false
            });

            modal.dataset.preventClose = 'true';

            const confirmBtn = modal.querySelector('.modal-confirm-btn');
            const cancelBtn = modal.querySelector('.modal-cancel-btn');

            confirmBtn.onclick = () => {
                this.close(true);
                resolve(true);
            };

            cancelBtn.onclick = () => {
                this.close(false);
                resolve(false);
            };

            this.show(modal);
        });
    }

    /**
     * 显示输入对话框
     * @param {string} message - 提示消息
     * @param {string} defaultValue - 默认值
     * @param {object} options - 配置选项
     * @returns {Promise<string|null>} 用户输入的值，取消则返回null
     */
    prompt(message, defaultValue = '', options = {}) {
        return new Promise((resolve) => {
            const modal = this.createModal('prompt', {
                title: options.title || '请输入',
                message,
                defaultValue,
                placeholder: options.placeholder || '',
                confirmText: options.confirmText || '确定',
                cancelText: options.cancelText || '取消'
            });

            const input = modal.querySelector('.modal-input');
            const confirmBtn = modal.querySelector('.modal-confirm-btn');
            const cancelBtn = modal.querySelector('.modal-cancel-btn');

            // 自动聚焦输入框
            setTimeout(() => input.focus(), 100);

            const handleConfirm = () => {
                const value = input.value.trim();
                this.close(true);
                resolve(value);
            };

            const handleCancel = () => {
                this.close(false);
                resolve(null);
            };

            confirmBtn.onclick = handleConfirm;
            cancelBtn.onclick = handleCancel;

            // 回车确认
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    handleConfirm();
                } else if (e.key === 'Escape') {
                    handleCancel();
                }
            });

            this.show(modal);
        });
    }

    /**
     * 显示警告对话框
     * @param {string} message - 消息内容
     * @param {object} options - 配置选项
     * @returns {Promise<void>}
     */
    alert(message, options = {}) {
        return new Promise((resolve) => {
            const modal = this.createModal('alert', {
                title: options.title || '提示',
                message,
                icon: options.icon || 'ℹ️',
                confirmText: options.confirmText || '知道了'
            });

            const confirmBtn = modal.querySelector('.modal-confirm-btn');
            confirmBtn.onclick = () => {
                this.close(true);
                resolve();
            };

            this.show(modal);
        });
    }

    createModal(type, config) {
        const modal = document.createElement('div');
        modal.className = `modal modal-${type}`;

        if (type === 'confirm') {
            modal.innerHTML = `
                <div class="modal-header">
                    <div class="modal-icon">${config.icon}</div>
                    <div class="modal-title">${this.escapeHtml(config.title)}</div>
                </div>
                <div class="modal-body">
                    <div class="modal-message">${this.escapeHtml(config.message)}</div>
                    ${config.description ? `<div class="modal-description">${this.escapeHtml(config.description)}</div>` : ''}
                </div>
                <div class="modal-footer">
                    <button class="modal-btn modal-cancel-btn">${this.escapeHtml(config.cancelText)}</button>
                    <button class="modal-btn modal-confirm-btn ${config.danger ? 'danger' : ''}">${this.escapeHtml(config.confirmText)}</button>
                </div>
            `;
        } else if (type === 'prompt') {
            modal.innerHTML = `
                <div class="modal-header">
                    <div class="modal-title">${this.escapeHtml(config.title)}</div>
                </div>
                <div class="modal-body">
                    <div class="modal-message">${this.escapeHtml(config.message)}</div>
                    <input type="text" class="modal-input" value="${this.escapeHtml(config.defaultValue)}" placeholder="${this.escapeHtml(config.placeholder)}">
                </div>
                <div class="modal-footer">
                    <button class="modal-btn modal-cancel-btn">${this.escapeHtml(config.cancelText)}</button>
                    <button class="modal-btn modal-confirm-btn">${this.escapeHtml(config.confirmText)}</button>
                </div>
            `;
        } else if (type === 'alert') {
            modal.innerHTML = `
                <div class="modal-header">
                    <div class="modal-icon">${config.icon}</div>
                    <div class="modal-title">${this.escapeHtml(config.title)}</div>
                </div>
                <div class="modal-body">
                    <div class="modal-message">${this.escapeHtml(config.message)}</div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn modal-confirm-btn">${this.escapeHtml(config.confirmText)}</button>
                </div>
            `;
        }

        return modal;
    }

    show(modal) {
        this.currentModal = modal;
        this.overlay.appendChild(modal);
        this.overlay.style.display = 'flex';

        // 触发动画
        requestAnimationFrame(() => {
            this.overlay.classList.add('show');
            modal.classList.add('show');
        });
    }

    close(confirmed) {
        if (!this.currentModal) return;

        this.overlay.classList.remove('show');
        this.currentModal.classList.remove('show');

        setTimeout(() => {
            if (this.currentModal) {
                this.overlay.removeChild(this.currentModal);
                this.currentModal = null;
            }
            this.overlay.style.display = 'none';
        }, 300);
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 创建全局实例
const Modal = new ModalManager();

// 注入样式
const style = document.createElement('style');
style.textContent = `
/* Modal遮罩层 */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    opacity: 0;
    transition: opacity 0.3s ease;
}

.modal-overlay.show {
    opacity: 1;
}

/* Modal基础样式 */
.modal {
    background: white;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    max-width: 480px;
    width: 100%;
    transform: scale(0.9);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal.show {
    transform: scale(1);
    opacity: 1;
}

/* Modal头部 */
.modal-header {
    padding: 24px 24px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
}

.modal-icon {
    font-size: 32px;
    line-height: 1;
}

.modal-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-main);
}

/* Modal主体 */
.modal-body {
    padding: 0 24px 24px;
}

.modal-message {
    font-size: 15px;
    line-height: 1.6;
    color: var(--text-secondary);
    margin-bottom: 8px;
}

.modal-description {
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-secondary);
}

.modal-input {
    width: 100%;
    padding: 12px 16px;
    margin-top: 16px;
    border: 1px solid var(--surface-200);
    border-radius: var(--radius-sm);
    font-size: 15px;
    transition: border-color 0.2s;
    outline: none;
}

.modal-input:focus {
    border-color: var(--brand-purple);
}

/* Modal底部 */
.modal-footer {
    padding: 16px 24px 24px;
    display: flex;
    gap: 12px;
    justify-content: flex-end;
}

.modal-btn {
    padding: 10px 24px;
    border: none;
    border-radius: var(--radius-pill);
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 80px;
}

.modal-cancel-btn {
    background: var(--surface-100);
    color: var(--text-secondary);
}

.modal-cancel-btn:hover {
    background: var(--surface-200);
    color: var(--text-main);
}

.modal-confirm-btn {
    background: linear-gradient(135deg, var(--brand-purple) 0%, var(--brand-purple-dark) 100%);
    color: white;
}

.modal-confirm-btn:hover {
    transform: translateY(-1px);
    box-shadow: var(--glow-purple);
}

.modal-confirm-btn.danger {
    background: linear-gradient(135deg, var(--error) 0%, #EF4444 100%);
}

.modal-confirm-btn.danger:hover {
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

/* 移动端适配 */
@media (max-width: 640px) {
    .modal {
        max-width: 100%;
        margin: 20px;
    }

    .modal-header {
        padding: 20px 20px 12px;
    }

    .modal-body {
        padding: 0 20px 20px;
    }

    .modal-footer {
        padding: 12px 20px 20px;
        flex-direction: column-reverse;
    }

    .modal-btn {
        width: 100%;
    }
}
`;
document.head.appendChild(style);
