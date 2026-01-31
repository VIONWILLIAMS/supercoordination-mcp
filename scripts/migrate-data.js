#!/usr/bin/env node
/**
 * 数据迁移脚本：data/store.json → PostgreSQL
 *
 * 执行前提：
 * 1. Railway已添加PostgreSQL插件
 * 2. DATABASE_URL环境变量已配置
 * 3. 已运行 prisma migrate dev
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function migrateData() {
  console.log('🚀 开始数据迁移...\n');

  try {
    // 1. 读取旧数据
    const storePath = path.join(__dirname, '..', 'data', 'store.json');

    if (!fs.existsSync(storePath)) {
      console.log('⚠️  未找到 data/store.json，跳过数据迁移');
      return;
    }

    const storeData = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    console.log('✅ 读取旧数据成功');
    console.log(`   - 成员数量: ${storeData.members?.length || 0}`);
    console.log(`   - 任务数量: ${storeData.tasks?.length || 0}`);
    console.log(`   - 资源数量: ${storeData.resources?.length || 0}\n`);

    // 2. 迁移成员数据 → users表
    if (storeData.members && storeData.members.length > 0) {
      console.log('📦 迁移成员数据...');

      for (const member of storeData.members) {
        // 将旧的wuxingProfile转换为新的pwpProfile格式
        const pwpProfile = {
          wuxing: member.wuxingProfile || { fire: 0, metal: 0, wood: 0, water: 0, earth: 0 },
          skills: member.skills || [],
          pain_points: [],
          work_status: '',
          ideal_state: ''
        };

        await prisma.user.upsert({
          where: { id: member.id },
          update: {},
          create: {
            id: member.id,
            email: member.email || `user_${member.id}@example.com`, // 如果缺少email，生成一个
            passwordHash: '$2b$10$dummyHashForMigration1234567890', // 临时密码hash，用户需重置
            username: member.name || `user_${member.id.substring(0, 8)}`,
            avatarUrl: member.avatarUrl || null,
            pwpProfile: pwpProfile,
            pwpCompleted: false, // 旧数据默认未完成PWP
            pointsBalance: 50, // 初始积分
            createdAt: member.joinedAt ? new Date(member.joinedAt) : new Date(),
          },
        });

        console.log(`   ✓ 迁移成员: ${member.name || member.id}`);
      }

      console.log(`✅ 成员迁移完成: ${storeData.members.length} 条\n`);
    }

    // 3. 迁移任务数据 → tasks表
    if (storeData.tasks && storeData.tasks.length > 0) {
      console.log('📦 迁移任务数据...');

      for (const task of storeData.tasks) {
        await prisma.task.upsert({
          where: { id: task.id },
          update: {},
          create: {
            id: task.id,
            title: task.title,
            description: task.description || '',
            requiredSkills: task.requiredSkills || [],
            requiredWuxing: task.requiredWuxing || {},
            assignedTo: task.assignedTo || null,
            status: task.status || 'pending',
            createdAt: task.createdAt ? new Date(task.createdAt) : new Date(),
          },
        });

        console.log(`   ✓ 迁移任务: ${task.title}`);
      }

      console.log(`✅ 任务迁移完成: ${storeData.tasks.length} 条\n`);
    }

    // 4. 备份原文件
    const backupPath = storePath + '.backup';
    fs.copyFileSync(storePath, backupPath);
    console.log(`✅ 原数据已备份到: ${backupPath}\n`);

    // 5. 验证迁移结果
    console.log('🔍 验证迁移结果...');
    const userCount = await prisma.user.count();
    const taskCount = await prisma.task.count();
    console.log(`   - 用户总数: ${userCount}`);
    console.log(`   - 任务总数: ${taskCount}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 数据迁移完成！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚠️  重要提示：');
    console.log('   - 所有用户的密码已重置为临时密码');
    console.log('   - 用户需要通过注册流程重新设置密码');
    console.log('   - 原数据已备份到 data/store.json.backup\n');

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行迁移
migrateData()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
