const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function loadStore(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function parseEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(([key, value]) => ({ key, value }));
}

async function main() {
  const storePath = path.join(__dirname, '..', 'data', 'store.json');
  const data = loadStore(storePath);
  if (!data) {
    console.log('[迁移] 未找到 data/store.json，跳过');
    return;
  }

  const taskGroups = parseEntries(data.tasks);
  const memberGroups = parseEntries(data.members);

  for (const group of memberGroups) {
    const ownerId = group.key;
    const members = parseEntries(group.value);
    for (const memberItem of members) {
      const memberId = memberItem.key;
      const m = memberItem.value || {};
      await prisma.workspaceMember.upsert({
        where: { id: memberId },
        update: {
          ownerId,
          name: m.name || '未命名成员',
          skills: m.skills || [],
          wuxingProfile: m.wuxing_profile || { 火: 20, 金: 20, 木: 20, 水: 20, 土: 20 },
          status: m.status || 'active',
          createdAt: m.created_at ? new Date(m.created_at) : undefined,
          updatedAt: m.updated_at ? new Date(m.updated_at) : undefined
        },
        create: {
          id: memberId,
          ownerId,
          name: m.name || '未命名成员',
          skills: m.skills || [],
          wuxingProfile: m.wuxing_profile || { 火: 20, 金: 20, 木: 20, 水: 20, 土: 20 },
          status: m.status || 'active',
          createdAt: m.created_at ? new Date(m.created_at) : new Date(),
          updatedAt: m.updated_at ? new Date(m.updated_at) : new Date()
        }
      });
    }
  }

  for (const group of taskGroups) {
    const ownerId = group.key;
    const tasks = parseEntries(group.value);
    for (const taskItem of tasks) {
      const taskId = taskItem.key;
      const t = taskItem.value || {};
      await prisma.workspaceTask.upsert({
        where: { id: taskId },
        update: {
          ownerId,
          title: t.title || '未命名任务',
          description: t.description || null,
          wuxing: t.wuxing || null,
          priority: t.priority || 'B',
          skillsRequired: t.skills_required || [],
          status: t.status || 'pending',
          progress: t.progress || 0,
          assignedMemberId: t.assigned_to || null,
          createdByUserId: t.created_by || ownerId,
          rewardPoints: t.reward_points || 20,
          notes: t.notes || null,
          aiExecutionResult: t.aiExecutionResult || null,
          multiAI: t.multiAI || null,
          createdAt: t.created_at ? new Date(t.created_at) : undefined,
          updatedAt: t.updated_at ? new Date(t.updated_at) : undefined
        },
        create: {
          id: taskId,
          ownerId,
          title: t.title || '未命名任务',
          description: t.description || null,
          wuxing: t.wuxing || null,
          priority: t.priority || 'B',
          skillsRequired: t.skills_required || [],
          status: t.status || 'pending',
          progress: t.progress || 0,
          assignedMemberId: t.assigned_to || null,
          createdByUserId: t.created_by || ownerId,
          rewardPoints: t.reward_points || 20,
          notes: t.notes || null,
          aiExecutionResult: t.aiExecutionResult || null,
          multiAI: t.multiAI || null,
          createdAt: t.created_at ? new Date(t.created_at) : new Date(),
          updatedAt: t.updated_at ? new Date(t.updated_at) : new Date()
        }
      });
    }
  }

  console.log('[迁移] 完成：已将 store.json 写入 workspace_tasks/workspace_members');
}

main()
  .catch((err) => {
    console.error('[迁移失败]', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
