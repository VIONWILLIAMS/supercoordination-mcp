// 认证工具函数

/**
 * 获取存储的token
 */
function getToken() {
    return localStorage.getItem('token');
}

/**
 * 获取存储的用户信息
 */
function getUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

/**
 * 检查是否已登录
 */
function isLoggedIn() {
    return !!getToken();
}

/**
 * 登出
 */
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

/**
 * 检查登录状态，如果未登录则跳转到登录页
 */
function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
}

/**
 * 获取认证请求头
 */
function getAuthHeaders() {
    const token = getToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

/**
 * 发起认证API请求
 */
async function authFetch(url, options = {}) {
    const headers = getAuthHeaders();

    const response = await fetch(url, {
        ...options,
        headers: {
            ...headers,
            ...options.headers
        }
    });

    // 如果返回401，说明token过期，跳转到登录页
    if (response.status === 401) {
        logout();
        throw new Error('登录已过期，请重新登录');
    }

    return response;
}

/**
 * 刷新用户信息
 */
async function refreshUserInfo() {
    try {
        const response = await authFetch('/api/auth/me');
        const data = await response.json();

        if (data.success) {
            localStorage.setItem('user', JSON.stringify(data.user));
            return data.user;
        }
    } catch (error) {
        console.error('刷新用户信息失败:', error);
    }
    return null;
}

/**
 * 显示用户信息（在页面头部）
 */
function displayUserInfo() {
    const user = getUser();
    if (!user) return;

    const userInfoEl = document.getElementById('userInfo');
    if (userInfoEl) {
        userInfoEl.innerHTML = `
            <div class="user-profile">
                <span class="username">${user.username}</span>
                <span class="points">💰 ${user.pointsBalance}积分</span>
                <button onclick="logout()" class="btn-logout">登出</button>
            </div>
        `;
    }
}

// 页面加载时自动执行
if (typeof window !== 'undefined') {
    // 在受保护的页面自动检查登录状态
    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
        requireAuth();
        displayUserInfo();
    }
}
