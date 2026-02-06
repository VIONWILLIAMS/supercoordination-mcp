// ============================================
// 五行指挥部 - HQ Coordination API
// ============================================
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();

// Token 单价（USD per 1K tokens）
const MODEL_PRICING = {
  'claude-opus-4-5': 0.015,
  'claude-sonnet-4-5': 0.003,
  'claude-haiku-4-5': 0.00025,
  'default': 0.003
};

// ============================================
// 任务管理
// ============================================

async function postMission(req, res) {
  try {
    const { teamId, content, phase, taskId } = req.body;
    if (!teamId || !content) {
      return res.status(400).json({ error: 'teamId and content are required' });
    }
    const mission = await prisma.mission.create({
      data: {
        teamId,
        content,
        phase: phase || 1,
        taskId: taskId || uuidv4()
      }
    });
    res.json({ missionId: mission.id, taskId: mission.taskId, status: 'posted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getMission(req, res) {
  try {
    const { teamId } = req.params;
    const mission = await prisma.mission.findFirst({
      where: { teamId, status: 'pending' },
      orderBy: { createdAt: 'desc' }
    });
    if (!mission) return res.json(null);
    // 标记为已接受
    await prisma.mission.update({
      where: { id: mission.id },
      data: { status: 'accepted' }
    });
    res.json({
      missionId: mission.id,
      content: mission.content,
      phase: mission.phase,
      taskId: mission.taskId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ============================================
// 状态同步
// ============================================

async function updateStatus(req, res) {
  try {
    const { teamId, status, progress, currentTask } = req.body;
    if (!teamId || !status) {
      return res.status(400).json({ error: 'teamId and status are required' });
    }
    await prisma.teamStatus.upsert({
      where: { teamId },
      update: { status, progress: progress || 0, currentTask },
      create: { teamId, status, progress: progress || 0, currentTask }
    });
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function checkStatus(req, res) {
  try {
    const { teamId } = req.params;
    const status = await prisma.teamStatus.findUnique({ where: { teamId } });
    if (!status) return res.json({ teamId, status: 'unknown', progress: 0 });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getAllStatus(req, res) {
  try {
    const teams = await prisma.teamStatus.findMany({ orderBy: { updatedAt: 'desc' } });
    res.json({ teams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ============================================
// 衔接物
// ============================================

async function postHandoff(req, res) {
  try {
    const { taskId, fromTeam, phase, artifactType, summary, filePaths } = req.body;
    if (!taskId || !fromTeam || !phase || !artifactType || !summary) {
      return res.status(400).json({ error: 'taskId, fromTeam, phase, artifactType, summary are required' });
    }
    const handoff = await prisma.handoff.create({
      data: { taskId, fromTeam, phase, artifactType, summary, filePaths }
    });
    res.json({ handoffId: handoff.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getHandoff(req, res) {
  try {
    const { taskId, phase } = req.params;
    const handoff = await prisma.handoff.findFirst({
      where: { taskId, phase: parseInt(phase) },
      orderBy: { createdAt: 'desc' }
    });
    res.json(handoff || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ============================================
// 信号通信
// ============================================

async function sendSignal(req, res) {
  try {
    const { fromTeam, toTeam, signalType, message } = req.body;
    if (!fromTeam || !signalType) {
      return res.status(400).json({ error: 'fromTeam and signalType are required' });
    }
    const signal = await prisma.signal.create({
      data: { fromTeam, toTeam: toTeam || 'hq', signalType, message }
    });
    res.json({ signalId: signal.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function pollSignals(req, res) {
  try {
    const { forTeam } = req.params;
    const signals = await prisma.signal.findMany({
      where: { toTeam: forTeam, read: false },
      orderBy: { createdAt: 'asc' }
    });
    // 标记为已读
    if (signals.length > 0) {
      await prisma.signal.updateMany({
        where: { id: { in: signals.map(s => s.id) } },
        data: { read: true }
      });
    }
    res.json({ signals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ============================================
// 经验系统
// ============================================

async function saveExperience(req, res) {
  try {
    const {
      taskId, taskName, classification, complexity,
      teamSequence, totalTokens, totalDuration, totalCost,
      firstPassRate, lessonsLearned, tags, fullRecord
    } = req.body;
    if (!taskId || !taskName || !classification || !complexity) {
      return res.status(400).json({ error: 'taskId, taskName, classification, complexity are required' });
    }
    const exp = await prisma.experience.create({
      data: {
        taskId,
        taskName,
        classification,
        complexity,
        teamSequence: JSON.stringify(teamSequence || []),
        totalTokens: totalTokens || 0,
        totalDuration: totalDuration || 0,
        totalCost: totalCost || 0,
        firstPassRate,
        lessonsLearned: JSON.stringify(lessonsLearned || []),
        tags: Array.isArray(tags) ? tags.join(' ') : (tags || ''),
        fullRecord
      }
    });
    res.json({ experienceId: exp.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function searchExperience(req, res) {
  try {
    const { tags, classification, complexity, limit } = req.query;
    const where = {};
    if (tags) where.tags = { contains: tags };
    if (classification) where.classification = classification;
    if (complexity) where.complexity = complexity;

    const records = await prisma.experience.findMany({
      where,
      take: parseInt(limit) || 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, taskName: true, classification: true,
        complexity: true, teamSequence: true, lessonsLearned: true,
        tags: true, totalTokens: true, totalCost: true, createdAt: true
      }
    });
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ============================================
// 成本追踪
// ============================================

async function logTokens(req, res) {
  try {
    const { taskId, teamId, phase, tokenCount, model } = req.body;
    if (!taskId || !teamId || !tokenCount) {
      return res.status(400).json({ error: 'taskId, teamId, tokenCount are required' });
    }
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
    const estimatedCost = (tokenCount / 1000) * pricing;

    const log = await prisma.costLog.create({
      data: {
        taskId, teamId,
        phase: phase || 1,
        tokenCount,
        model: model || 'default',
        estimatedCost
      }
    });
    res.json({ logId: log.id, estimatedCost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getCostSummary(req, res) {
  try {
    const { taskId } = req.params;
    const logs = await prisma.costLog.findMany({ where: { taskId } });

    const totalTokens = logs.reduce((sum, l) => sum + l.tokenCount, 0);
    const totalCost = logs.reduce((sum, l) => sum + l.estimatedCost, 0);

    const modelDistribution = {};
    logs.forEach(l => {
      modelDistribution[l.model] = (modelDistribution[l.model] || 0) + l.tokenCount;
    });

    res.json({
      totalTokens,
      totalCost: Math.round(totalCost * 10000) / 10000,
      breakdown: logs.map(l => ({
        teamId: l.teamId, phase: l.phase,
        tokenCount: l.tokenCount, model: l.model,
        estimatedCost: l.estimatedCost
      })),
      modelDistribution
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  postMission, getMission,
  updateStatus, checkStatus, getAllStatus,
  postHandoff, getHandoff,
  sendSignal, pollSignals,
  saveExperience, searchExperience,
  logTokens, getCostSummary
};
