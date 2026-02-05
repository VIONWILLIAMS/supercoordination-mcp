const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./auth');
const decisionService = require('./services/decisionService');

// ========== 决策交流API ==========

/**
 * 创建决策请求（即"发送短邮"）
 */
router.post('/decision-requests', authenticateToken, async (req, res, next) => {
  try {
    const {
      toUserId,
      projectId,
      summary,
      content,
      attachments,
      protocolType
    } = req.body;

    // 验证必填字段
    if (!toUserId || !summary) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: toUserId, summary'
      });
    }

    const record = await decisionService.createDecisionRequest({
      fromUserId: req.userId,
      toUserId,
      projectId,
      summary,
      content,
      attachments,
      protocolType
    });

    res.json({
      success: true,
      record
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 响应决策请求（即"响应短邮"）
 */
router.post('/decision-responses', authenticateToken, async (req, res, next) => {
  try {
    const { requestId, decision, comment } = req.body;

    if (!requestId || !decision) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: requestId, decision'
      });
    }

    const record = await decisionService.respondToDecision(
      requestId,
      req.userId,
      decision,
      comment
    );

    res.json({
      success: true,
      record
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取用户的待决策事项（即"短邮收件箱"）
 */
router.get('/user/:userId/pending-decisions', authenticateToken, async (req, res, next) => {
  try {
    const { projectId } = req.query;

    const records = await decisionService.getPendingDecisions(
      req.params.userId,
      projectId
    );

    res.json({
      success: true,
      count: records.length,
      records
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取项目的决策交流记录
 */
router.get('/project/:projectId/decisions', authenticateToken, async (req, res, next) => {
  try {
    const records = await decisionService.getProjectDecisions(
      req.params.projectId,
      req.query
    );

    res.json({
      success: true,
      count: records.length,
      records
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 获取对话线程
 */
router.get('/conversations/:conversationId', authenticateToken, async (req, res, next) => {
  try {
    const records = await decisionService.getConversation(
      req.params.conversationId
    );

    res.json({
      success: true,
      count: records.length,
      records
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
