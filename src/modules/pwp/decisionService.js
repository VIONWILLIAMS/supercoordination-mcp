const { PrismaClient, Prisma } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

class DecisionService {
  /**
   * 创建决策请求（即"发送短邮"）
   */
  async createDecisionRequest({
    fromUserId,
    toUserId,
    projectId,
    summary,
    content = null,
    attachments = [],
    protocolType = 'GENERAL'
  }) {
    // 1. 生成conversationId
    const conversationId = uuidv4();

    // 2. AI分析（简化版，未来可扩展）
    const aiSuggestions = this._generateAISuggestions(protocolType, summary);

    // 3. 创建PWP记录
    const record = await prisma.pWPRecord.create({
      data: {
        userId: fromUserId,
        projectId,
        eventType: this._getEventType(protocolType),
        status: 'active',
        eventData: {
          // 决策交流的完整数据
          summary,
          content,
          attachments,
          toUserId,
          protocolType,
          conversationId,

          // AI辅助
          aiSuggestions,
          complexity: this._calculateComplexity(summary, content),

          // 响应数据（初始为空）
          response: null,
          respondedBy: null,
          respondedAt: null
        }
      },
      include: {
        user: true,
        project: true
      }
    });

    return record;
  }

  /**
   * 响应决策请求（即"响应短邮"）
   */
  async respondToDecision(requestId, responderId, decision, comment = null) {
    // 1. 获取原请求
    const request = await prisma.pWPRecord.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      throw new Error('决策请求不存在');
    }

    // 2. 验证响应者
    if (request.eventData.toUserId !== responderId) {
      throw new Error('无权响应此决策请求');
    }

    // 3. 更新原请求状态
    await prisma.pWPRecord.update({
      where: { id: requestId },
      data: {
        status: 'responded',
        eventData: {
          ...request.eventData,
          response: decision,
          responseComment: comment,
          respondedBy: responderId,
          respondedAt: new Date().toISOString()
        }
      }
    });

    // 4. 创建响应记录
    const responseRecord = await prisma.pWPRecord.create({
      data: {
        userId: responderId,
        projectId: request.projectId,
        eventType: this._getResponseEventType(request.eventData.protocolType),
        status: 'active',
        eventData: {
          requestId,
          decision,
          comment,
          conversationId: request.eventData.conversationId
        }
      },
      include: {
        user: true,
        project: true
      }
    });

    return responseRecord;
  }

  /**
   * 获取用户的待决策事项（即"短邮收件箱"）
   */
  async getPendingDecisions(userId, projectId = null) {
    const where = {
      eventType: {
        in: [
          'decision_requested',
          'task_assignment_requested',
          'deliverable_submitted',
          'feedback_requested'
        ]
      },
      status: 'active'
    };

    // 使用Prisma的JSON查询
    const records = await prisma.$queryRaw`
      SELECT * FROM pwp_records
      WHERE event_type IN ('decision_requested', 'task_assignment_requested', 'deliverable_submitted', 'feedback_requested')
        AND status = 'active'
        AND event_data->>'toUserId' = ${userId}
        ${projectId ? Prisma.sql`AND project_id = ${projectId}` : Prisma.empty}
      ORDER BY occurred_at DESC
    `;

    return records;
  }

  /**
   * 获取对话线程
   */
  async getConversation(conversationId) {
    const records = await prisma.$queryRaw`
      SELECT * FROM pwp_records
      WHERE event_data->>'conversationId' = ${conversationId}
      ORDER BY occurred_at ASC
    `;

    return records;
  }

  /**
   * 获取项目的决策交流记录
   */
  async getProjectDecisions(projectId, filters = {}) {
    const where = {
      projectId,
      eventType: {
        in: [
          'decision_requested',
          'decision_made',
          'task_assignment_requested',
          'task_assignment_responded',
          'deliverable_submitted',
          'deliverable_reviewed',
          'feedback_requested',
          'feedback_provided'
        ]
      }
    };

    if (filters.status) {
      where.status = filters.status;
    }

    const records = await prisma.pWPRecord.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      include: {
        user: true,
        project: true
      }
    });

    return records;
  }

  // ========== 私有辅助方法 ==========

  _getEventType(protocolType) {
    const mapping = {
      TASK_ASSIGNMENT: 'task_assignment_requested',
      DELIVERABLE_SUBMISSION: 'deliverable_submitted',
      FEEDBACK_REQUEST: 'feedback_requested',
      DECISION_REQUIRED: 'decision_requested',
      GENERAL: 'decision_requested'
    };
    return mapping[protocolType] || 'decision_requested';
  }

  _getResponseEventType(protocolType) {
    const mapping = {
      TASK_ASSIGNMENT: 'task_assignment_responded',
      DELIVERABLE_SUBMISSION: 'deliverable_reviewed',
      FEEDBACK_REQUEST: 'feedback_provided',
      DECISION_REQUIRED: 'decision_made',
      GENERAL: 'decision_made'
    };
    return mapping[protocolType] || 'decision_made';
  }

  _generateAISuggestions(protocolType, summary) {
    // 简化版AI建议，基于协议类型
    const frameworks = {
      DELIVERABLE_SUBMISSION: {
        question: '这个交付物质量如何？',
        options: ['批准', '需要改', '需要讨论'],
        tips: '类似项目一次通过率: 88%'
      },
      TASK_ASSIGNMENT: {
        question: '是否接受此任务？',
        options: ['接受', '拒绝', '需要讨论'],
        tips: '建议先评估工作量'
      },
      FEEDBACK_REQUEST: {
        question: '你的反馈是？',
        options: ['同意', '不同意', '需要讨论'],
        tips: '提供建设性意见'
      },
      DECISION_REQUIRED: {
        question: '你的决策是？',
        options: ['方案A', '方案B', '需要讨论'],
        tips: '考虑长期影响'
      },
      GENERAL: {
        question: '请做出响应',
        options: ['确认', '需要讨论'],
        tips: null
      }
    };

    return frameworks[protocolType] || frameworks.GENERAL;
  }

  _calculateComplexity(summary, content) {
    let score = 0;

    // 文本长度
    if (summary && summary.length > 100) score += 3;
    if (content && JSON.stringify(content).length > 500) score += 2;

    // 关键词
    const complexKeywords = ['复杂', '权衡', '多个方案', '决策', '选择'];
    const text = (summary || '') + ' ' + JSON.stringify(content || '');
    complexKeywords.forEach(keyword => {
      if (text.includes(keyword)) score += 1;
    });

    return Math.min(score, 10);
  }
}

module.exports = new DecisionService();
