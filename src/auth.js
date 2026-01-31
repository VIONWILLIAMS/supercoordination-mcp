const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

const prisma = new PrismaClient();

// JWT密钥（生产环境应使用环境变量）
const JWT_SECRET = process.env.JWT_SECRET || 'supercoordination-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d'; // Token 7天过期

// ========================================
// 验证规则
// ========================================

const registerValidation = [
  body('email').isEmail().withMessage('请提供有效的邮箱地址'),
  body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
  body('username').isLength({ min: 2, max: 20 }).withMessage('用户名长度2-20字符')
];

const loginValidation = [
  body('email').isEmail().withMessage('请提供有效的邮箱地址'),
  body('password').notEmpty().withMessage('密码不能为空')
];

// ========================================
// 认证控制器
// ========================================

/**
 * 用户注册
 */
async function register(req, res) {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password, username } = req.body;

    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '该邮箱已被注册'
      });
    }

    // 检查用户名是否已存在
    const existingUsername = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: '该用户名已被使用'
      });
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        username,
        pwpProfile: {
          wuxing: { fire: 20, metal: 20, wood: 20, water: 20, earth: 20 },
          skills: [],
          pain_points: [],
          work_status: '',
          ideal_state: ''
        },
        pwpCompleted: false,
        pointsBalance: 50
      }
    });

    // 生成token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      message: '注册成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        pointsBalance: user.pointsBalance,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('[注册错误]', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，请稍后重试'
    });
  }
}

/**
 * 用户登录
 */
async function login(req, res) {
  try {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '邮箱或密码错误'
      });
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: '邮箱或密码错误'
      });
    }

    // 生成token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        pointsBalance: user.pointsBalance,
        pwpCompleted: user.pwpCompleted,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('[登录错误]', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，请稍后重试'
    });
  }
}

/**
 * 获取当前用户信息
 */
async function getCurrentUser(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        pwpProfile: true,
        pwpCompleted: true,
        pointsBalance: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('[获取用户信息错误]', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，请稍后重试'
    });
  }
}

// ========================================
// JWT认证中间件
// ========================================

/**
 * 验证JWT token
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: '未提供认证token'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Token无效或已过期'
      });
    }

    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  });
}

/**
 * 可选认证（有token就验证，没有就跳过）
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (!err) {
      req.userId = decoded.userId;
      req.userEmail = decoded.email;
    }
    next();
  });
}

// ========================================
// 导出
// ========================================

module.exports = {
  // 控制器
  register,
  login,
  getCurrentUser,

  // 验证规则
  registerValidation,
  loginValidation,

  // 中间件
  authenticateToken,
  optionalAuth,

  // Prisma客户端（供其他模块使用）
  prisma
};
