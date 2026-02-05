// WebSocket实时协作服务
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// 在线用户映射 { userId: { socketId, username, role, lastActive } }
const onlineUsers = new Map();

// 房间管理 { taskId: Set of socketIds }
const taskRooms = new Map();

/**
 * 初始化WebSocket服务
 */
function initializeWebSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // 认证中间件
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('未提供认证token'));
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      next();
    } catch (error) {
      next(new Error('Token无效或已过期'));
    }
  });

  // 连接处理
  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`[WebSocket] 用户连接: ${userId} (${socket.id})`);

    try {
      // 获取用户信息（需要传入prisma实例）
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, role: true, status: true }
      });

      await prisma.$disconnect();

      if (!user) {
        socket.disconnect();
        return;
      }

      // 记录在线用户
      onlineUsers.set(userId, {
        socketId: socket.id,
        username: user.username,
        role: user.role,
        status: user.status,
        connectedAt: new Date()
      });

      // 通知所有人该用户上线
      io.emit('user:online', {
        userId: user.id,
        username: user.username,
        role: user.role,
        onlineCount: onlineUsers.size
      });

      // 发送在线用户列表给新连接的用户
      socket.emit('users:online-list', {
        users: Array.from(onlineUsers.entries()).map(([id, info]) => ({
          userId: id,
          username: info.username,
          role: info.role,
          connectedAt: info.connectedAt
        })),
        total: onlineUsers.size
      });

      // 加入任务房间
      socket.on('task:join', (taskId) => {
        socket.join(`task:${taskId}`);
        if (!taskRooms.has(taskId)) {
          taskRooms.set(taskId, new Set());
        }
        taskRooms.get(taskId).add(socket.id);

        console.log(`[WebSocket] 用户 ${userId} 加入任务房间: ${taskId}`);

        // 通知房间内其他人
        socket.to(`task:${taskId}`).emit('task:user-joined', {
          taskId,
          userId: user.id,
          username: user.username
        });
      });

      // 离开任务房间
      socket.on('task:leave', (taskId) => {
        socket.leave(`task:${taskId}`);
        if (taskRooms.has(taskId)) {
          taskRooms.get(taskId).delete(socket.id);
          if (taskRooms.get(taskId).size === 0) {
            taskRooms.delete(taskId);
          }
        }

        console.log(`[WebSocket] 用户 ${userId} 离开任务房间: ${taskId}`);

        // 通知房间内其他人
        socket.to(`task:${taskId}`).emit('task:user-left', {
          taskId,
          userId: user.id,
          username: user.username
        });
      });

      // 任务状态更新（由客户端触发，广播给其他人）
      socket.on('task:status-updated', (data) => {
        console.log(`[WebSocket] 任务状态更新: ${data.taskId} -> ${data.status}`);

        // 广播给所有其他用户
        socket.broadcast.emit('task:status-changed', {
          taskId: data.taskId,
          status: data.status,
          updatedBy: user.username,
          updatedAt: new Date()
        });
      });

      // 任务分配更新
      socket.on('task:assignment-updated', (data) => {
        console.log(`[WebSocket] 任务分配更新: ${data.taskId}`);

        socket.broadcast.emit('task:assignment-changed', {
          taskId: data.taskId,
          assignedTo: data.assignedTo,
          assignedBy: user.username,
          updatedAt: new Date()
        });
      });

      // 新任务创建
      socket.on('task:created', (data) => {
        console.log(`[WebSocket] 新任务创建: ${data.taskId}`);

        socket.broadcast.emit('task:new', {
          task: data.task,
          createdBy: user.username,
          createdAt: new Date()
        });
      });

      // 用户正在编辑任务（实时协作提示）
      socket.on('task:editing', (data) => {
        socket.to(`task:${data.taskId}`).emit('task:user-editing', {
          taskId: data.taskId,
          userId: user.id,
          username: user.username,
          field: data.field // 正在编辑的字段
        });
      });

      // 用户停止编辑
      socket.on('task:stop-editing', (data) => {
        socket.to(`task:${data.taskId}`).emit('task:user-stop-editing', {
          taskId: data.taskId,
          userId: user.id
        });
      });

      // 系统通知广播
      socket.on('notification:send', (data) => {
        if (user.role === 'admin') {
          io.emit('notification:received', {
            type: data.type || 'info',
            message: data.message,
            from: user.username,
            timestamp: new Date()
          });
        }
      });

      // 断开连接
      socket.on('disconnect', () => {
        console.log(`[WebSocket] 用户断开: ${userId}`);

        // 从在线列表移除
        onlineUsers.delete(userId);

        // 从所有任务房间移除
        taskRooms.forEach((sockets, taskId) => {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id);
            socket.to(`task:${taskId}`).emit('task:user-left', {
              taskId,
              userId: user.id,
              username: user.username
            });
          }
        });

        // 通知所有人该用户下线
        io.emit('user:offline', {
          userId: user.id,
          username: user.username,
          onlineCount: onlineUsers.size
        });
      });

    } catch (error) {
      console.error('[WebSocket] 连接处理错误:', error);
      socket.disconnect();
    }
  });

  console.log('✅ WebSocket服务已启动');

  return io;
}

/**
 * 获取在线用户数量
 */
function getOnlineUsersCount() {
  return onlineUsers.size;
}

/**
 * 获取在线用户列表
 */
function getOnlineUsers() {
  return Array.from(onlineUsers.entries()).map(([id, info]) => ({
    userId: id,
    username: info.username,
    role: info.role,
    connectedAt: info.connectedAt
  }));
}

/**
 * 向特定用户发送消息
 */
function sendToUser(io, userId, event, data) {
  const userInfo = onlineUsers.get(userId);
  if (userInfo) {
    io.to(userInfo.socketId).emit(event, data);
    return true;
  }
  return false;
}

/**
 * 广播消息给所有在线用户
 */
function broadcast(io, event, data) {
  io.emit(event, data);
}

module.exports = {
  initializeWebSocket,
  getOnlineUsersCount,
  getOnlineUsers,
  sendToUser,
  broadcast
};
