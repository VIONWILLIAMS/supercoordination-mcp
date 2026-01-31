/**
 * AI守门人机制
 * 双层权限：候选者(candidate) vs 正式成员(member)
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

/**
 * 生成门票token
 */
function generateTicketToken() {
  return 'ticket_' + crypto.randomBytes(16).toString('hex');
}

/**
 * 发门票（正式成员才能发）
 */
async function issueTicket(issuerId, recipientEmail) {
  // 检查发起者是否是正式成员
  const issuer = await prisma.user.findUnique({
    where: { id: issuerId }
  });

  if (!issuer || issuer.status !== 'member') {
    throw new Error('只有正式成员才能发放门票');
  }

  // 检查发起者积分是否足够
  if (issuer.pointsBalance < 5) {
    throw new Error('积分不足（需要5积分）');
  }

  // 检查是否已经给这个邮箱发过未使用的门票
  const existingTicket = await prisma.ticket.findFirst({
    where: {
      recipientEmail,
      status: 'pending',
      expiresAt: { gt: new Date() }
    }
  });

  if (existingTicket) {
    throw new Error('该邮箱已有未使用的门票');
  }

  // 扣除积分
  await prisma.user.update({
    where: { id: issuerId },
    data: { pointsBalance: { decrement: 5 } }
  });

  // 创建积分交易记录
  await prisma.pointsTransaction.create({
    data: {
      userId: issuerId,
      amount: -5,
      transactionType: 'ticket_issue',
      description: `发放门票给 ${recipientEmail}`
    }
  });

  // 创建门票
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30天有效期

  const ticket = await prisma.ticket.create({
    data: {
      issuerId,
      recipientEmail,
      token: generateTicketToken(),
      expiresAt
    }
  });

  return ticket;
}

/**
 * 使用门票注册（创建候选者账号）
 */
async function redeemTicket(token, userData) {
  // 查找门票
  const ticket = await prisma.ticket.findUnique({
    where: { token }
  });

  if (!ticket) {
    throw new Error('无效的门票');
  }

  if (ticket.status !== 'pending') {
    throw new Error('门票已被使用');
  }

  if (ticket.expiresAt < new Date()) {
    throw new Error('门票已过期');
  }

  // 检查邮箱是否已注册
  const existingUser = await prisma.user.findUnique({
    where: { email: userData.email }
  });

  if (existingUser) {
    throw new Error('该邮箱已注册');
  }

  // 创建候选者账号
  const user = await prisma.user.create({
    data: {
      email: userData.email,
      passwordHash: userData.passwordHash,
      username: userData.username,
      status: 'candidate',
      invitedAt: new Date(),
      invitedById: ticket.issuerId,
      candidateData: {
        ticketToken: token,
        joinedAt: new Date(),
        browsingBehavior: {
          tasksViewed: 0,
          timeSpent: 0,
          dashboardVisits: 0,
          wuxingCheckClicks: 0
        }
      }
    }
  });

  // 更新门票状态
  await prisma.ticket.update({
    where: { token },
    data: { status: 'accepted' }
  });

  return user;
}

/**
 * 计算团队五行缺口
 */
async function calculateTeamWuxingGap() {
  const members = await prisma.user.findMany({
    where: { status: 'member' }
  });

  if (members.length === 0) {
    return { fire: 0, metal: 0, wood: 0, water: 0, earth: 0 };
  }

  const distribution = { fire: 0, metal: 0, wood: 0, water: 0, earth: 0 };

  members.forEach(member => {
    const wuxing = member.pwpProfile?.wuxing || {};
    Object.keys(distribution).forEach(element => {
      distribution[element] += wuxing[element] || 0;
    });
  });

  // 计算平均值
  Object.keys(distribution).forEach(element => {
    distribution[element] = distribution[element] / members.length;
  });

  return distribution;
}

/**
 * 计算候选者与团队的五行互补度
 */
function calculateWuxingComplementScore(candidateWuxing, teamDistribution) {
  let score = 0;

  const wuxingMap = {
    fire: '火',
    metal: '金',
    wood: '木',
    water: '水',
    earth: '土'
  };

  // 找出团队最缺的五行
  const sortedGap = Object.entries(teamDistribution)
    .sort((a, b) => a[1] - b[1]);

  // 候选者在团队最缺的五行上分数越高，互补度越高
  sortedGap.forEach(([ element, avgValue ], index) => {
    const candidateValue = candidateWuxing[element] || 0;
    const gapWeight = 5 - index; // 最缺的权重5，次缺的权重4，以此类推

    // 如果候选者在缺口属性上分数高，加分
    if (avgValue < 50 && candidateValue > 60) {
      score += gapWeight * 8;
    } else if (candidateValue > avgValue) {
      score += gapWeight * 3;
    }
  });

  return Math.min(score, 100); // 最高100分
}

/**
 * AI评估单个候选者
 */
async function evaluateCandidate(candidateId) {
  const candidate = await prisma.user.findUnique({
    where: { id: candidateId }
  });

  if (!candidate || candidate.status !== 'candidate') {
    throw new Error('无效的候选者');
  }

  let score = 0;
  const reasons = [];

  // 1. 五行画像完整度（30分）
  const wuxing = candidate.pwpProfile?.wuxing || {};
  const hasCompleteProfile = Object.values(wuxing).every(v => v > 0);

  if (hasCompleteProfile) {
    score += 30;
    reasons.push('✅ 五行画像完整');
  } else {
    reasons.push('⚠️ 五行画像未完成');
  }

  // 2. 候选天数（10分）
  if (candidate.invitedAt) {
    const daysSinceInvited = Math.floor(
      (new Date() - new Date(candidate.invitedAt)) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceInvited >= 1) {
      score += 10;
      reasons.push(`✅ 观察期 ${daysSinceInvited} 天`);
    }
  }

  // 3. 五行互补度（40分）
  const teamDistribution = await calculateTeamWuxingGap();
  const complementScore = calculateWuxingComplementScore(wuxing, teamDistribution);

  const complementPoints = Math.floor(complementScore * 0.4);
  score += complementPoints;

  if (complementPoints > 30) {
    reasons.push(`✅ 五行高度互补（${Math.floor(complementScore)}%）`);
  } else if (complementPoints > 20) {
    reasons.push(`🔶 五行中度互补（${Math.floor(complementScore)}%）`);
  } else {
    reasons.push(`⚠️ 五行互补度较低（${Math.floor(complementScore)}%）`);
  }

  // 4. 行为数据（20分） - 如果有的话
  const behavior = candidate.candidateData?.browsingBehavior || {};
  let behaviorScore = 0;

  if (behavior.tasksViewed >= 3) behaviorScore += 5;
  if (behavior.timeSpent >= 1800) behaviorScore += 5; // 30分钟以上
  if (behavior.dashboardVisits >= 2) behaviorScore += 5;
  if (behavior.wuxingCheckClicks >= 1) behaviorScore += 5;

  score += behaviorScore;
  if (behaviorScore > 15) {
    reasons.push('✅ 积极探索平台');
  }

  // 判定结果
  const decision = score >= 80 ? 'approved' : (score >= 60 ? 'pending' : 'rejected');

  const reasoning = `
评估总分：${score}/100

${reasons.join('\n')}

${decision === 'approved' ?
  '✅ 通过评估！你的五行能量将为超协体带来平衡与活力。' :
  decision === 'pending' ?
  '🔶 继续观察中。建议完善五行画像并多探索平台。' :
  '⚠️ 暂不适合加入。团队当前需要其他五行属性的成员。'
}
  `.trim();

  // 创建评估记录
  const evaluation = await prisma.aIEvaluation.create({
    data: {
      candidateId,
      score,
      reasoning,
      decision
    }
  });

  // 更新候选者的AI评分
  await prisma.user.update({
    where: { id: candidateId },
    data: {
      aiScore: score,
      evaluatedAt: new Date()
    }
  });

  return evaluation;
}

/**
 * 批量评估所有候选者（Cron Job）
 */
async function evaluateAllCandidates() {
  const candidates = await prisma.user.findMany({
    where: { status: 'candidate' }
  });

  const results = [];

  for (const candidate of candidates) {
    try {
      const evaluation = await evaluateCandidate(candidate.id);
      results.push({
        candidateId: candidate.id,
        email: candidate.email,
        score: evaluation.score,
        decision: evaluation.decision
      });
    } catch (error) {
      console.error(`评估候选者 ${candidate.email} 失败:`, error);
      results.push({
        candidateId: candidate.id,
        email: candidate.email,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * 接受AI邀请（候选者升级为正式成员）
 */
async function acceptAIInvitation(candidateId) {
  const candidate = await prisma.user.findUnique({
    where: { id: candidateId }
  });

  if (!candidate || candidate.status !== 'candidate') {
    throw new Error('无效的候选者');
  }

  // 检查是否通过AI评估
  const latestEvaluation = await prisma.aIEvaluation.findFirst({
    where: { candidateId },
    orderBy: { evaluatedAt: 'desc' }
  });

  if (!latestEvaluation || latestEvaluation.decision !== 'approved') {
    throw new Error('尚未通过AI评估，无法接受邀请');
  }

  // 分配超协体序号
  const maxSerialNumber = await prisma.user.findFirst({
    where: { serialNumber: { not: null } },
    orderBy: { serialNumber: 'desc' },
    select: { serialNumber: true }
  });

  const newSerialNumber = (maxSerialNumber?.serialNumber || 0) + 1;

  // 升级为正式成员
  const member = await prisma.user.update({
    where: { id: candidateId },
    data: {
      status: 'member',
      serialNumber: newSerialNumber,
      approvedAt: new Date(),
      approvedBy: 'AI',
      pointsBalance: { increment: 50 } // 新人礼包
    }
  });

  // 创建积分交易记录
  await prisma.pointsTransaction.create({
    data: {
      userId: candidateId,
      amount: 50,
      transactionType: 'new_member_bonus',
      description: 'AI批准加入，新人礼包'
    }
  });

  // 返还门票发起者积分+奖励
  if (candidate.invitedById) {
    await prisma.user.update({
      where: { id: candidate.invitedById },
      data: { pointsBalance: { increment: 25 } } // 返还5+奖励20
    });

    await prisma.pointsTransaction.create({
      data: {
        userId: candidate.invitedById,
        amount: 25,
        transactionType: 'ticket_success_reward',
        description: `邀请 ${member.username} 成功加入`
      }
    });
  }

  return member;
}

/**
 * 权限中间件：只允许正式成员
 */
async function requireMember(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({
      success: false,
      message: '请先登录'
    });
  }

  try {
    // 查询用户状态
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        status: true,
        aiScore: true,
        evaluatedAt: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    if (user.status !== 'member') {
      return res.status(403).json({
        success: false,
        message: '此功能仅对正式成员开放',
        hint: '你当前是观察者。等待AI评估完成后，将收到正式邀请。',
        candidateStatus: {
          aiScore: user.aiScore,
          evaluatedAt: user.evaluatedAt
        }
      });
    }

    // 将用户信息附加到req
    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: '权限检查失败'
    });
  }
}

module.exports = {
  issueTicket,
  redeemTicket,
  evaluateCandidate,
  evaluateAllCandidates,
  acceptAIInvitation,
  requireMember,
  calculateTeamWuxingGap,
  calculateWuxingComplementScore
};
