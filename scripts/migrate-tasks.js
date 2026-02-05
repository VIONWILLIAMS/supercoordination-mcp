// 任务数据迁移脚本: 从JSON迁移到PostgreSQL
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function migrateTasks() {
  try {
    console.log('🚀 开始迁移任务数据...\n');

    // 读取JSON文件
    const storePath = path.join(__dirname, '../data/store.json');
    if (!fs.existsSync(storePath)) {
      console.log('❌ 未找到store.json文件');
      return;
    }

    const storeData = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    console.log(`📊 找到 ${storeData.tasks?.length || 0} 个用户的任务数据\n`);

    let totalTasks = 0;
    let migratedTasks = 0;
    let skippedTasks = 0;

    // 遍历每个用户的任务
    for (const [userId, userTasks] of storeData.tasks || []) {
      console.log(`👤 处理用户 ${userId} 的任务...`);

      for (const [taskId, taskData] of userTasks) {
        totalTasks++;

        try {
          // 检查任务是否已存在
          const existing = await prisma.task.findUnique({
            where: { id: taskId }
          });

          if (existing) {
            console.log(`  ⏭️  任务已存在: ${taskData.title}`);
            skippedTasks++;
            continue;
          }

          // 检查创建者是否存在
          const creator = await prisma.user.findUnique({
            where: { id: taskData.created_by || userId }
          });

          if (!creator) {
            console.log(`  ⚠️  创建者不存在，跳过: ${taskData.title}`);
            skippedTasks++;
            continue;
          }

          // 迁移任务
          await prisma.task.create({
            data: {
              id: taskId,
              title: taskData.title,
              description: taskData.description || '',
              requiredSkills: taskData.skills_required || [],
              requiredWuxing: taskData.wuxing || {},
              assignedTo: taskData.assigned_to,
              createdBy: taskData.created_by || userId,
              status: taskData.status || 'pending',
              priority: taskData.priority || 'medium',
              progress: taskData.progress || 0,
              rewardPoints: taskData.reward_points || 20,
              estimatedHours: taskData.estimated_hours,
              createdAt: taskData.created_at ? new Date(taskData.created_at) : new Date(),
              updatedAt: taskData.updated_at ? new Date(taskData.updated_at) : new Date()
            }
          });

          console.log(`  ✅ 已迁移: ${taskData.title}`);
          migratedTasks++;
        } catch (error) {
          console.log(`  ❌ 迁移失败: ${taskData.title}`);
          console.log(`     错误: ${error.message}`);
          skippedTasks++;
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 迁移统计:');
    console.log(`  总任务数: ${totalTasks}`);
    console.log(`  成功迁移: ${migratedTasks}`);
    console.log(`  跳过/失败: ${skippedTasks}`);
    console.log('='.repeat(50) + '\n');

    if (migratedTasks > 0) {
      console.log('✅ 任务迁移完成！');
      console.log('💡 提示: 可以备份并删除 data/store.json 文件');
    } else {
      console.log('ℹ️  没有新任务需要迁移');
    }

  } catch (error) {
    console.error('❌ 迁移过程出错:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行迁移
migrateTasks()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
