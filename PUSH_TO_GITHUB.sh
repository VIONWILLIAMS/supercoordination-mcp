#!/bin/bash
# 超协体 - GitHub 推送脚本

echo "🚀 准备推送到 GitHub..."
echo ""
echo "📍 目标仓库: https://github.com/VIONWILLIAMS/supercoordination-mcp"
echo ""

# 检查远程仓库是否已添加
if git remote | grep -q "origin"; then
    echo "✅ 远程仓库已配置"
else
    echo "📝 添加远程仓库..."
    git remote add origin https://github.com/VIONWILLIAMS/supercoordination-mcp.git
    echo "✅ 远程仓库已添加"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  需要 GitHub 认证"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "请选择认证方式："
echo ""
echo "1️⃣  方式一：使用个人访问令牌（推荐）"
echo "   - 访问: https://github.com/settings/tokens/new"
echo "   - 勾选 'repo' 权限"
echo "   - 生成令牌并复制"
echo ""
echo "2️⃣  方式二：先在网页创建仓库"
echo "   - 访问: https://github.com/new"
echo "   - 仓库名: supercoordination-mcp"
echo "   - 创建为 Public"
echo ""
read -p "请输入选择 (1/2): " choice

if [ "$choice" = "1" ]; then
    echo ""
    echo "请访问: https://github.com/settings/tokens/new"
    echo ""
    echo "配置："
    echo "- Note: supercoordination-mcp"
    echo "- Expiration: 90 days"
    echo "- Scopes: ✅ repo"
    echo ""
    echo "生成后复制令牌，然后回到这里..."
    echo ""
    read -p "按回车继续推送..."
    echo ""
    echo "🚀 开始推送（会要求输入用户名和密码）..."
    echo "   Username: VIONWILLIAMS"
    echo "   Password: [粘贴你的个人访问令牌]"
    echo ""
    git push -u origin main
elif [ "$choice" = "2" ]; then
    echo ""
    echo "📝 请先在浏览器完成以下步骤："
    echo ""
    echo "1. 打开浏览器访问: https://github.com/new"
    echo "2. Repository name: supercoordination-mcp"
    echo "3. 选择 Public"
    echo "4. 不要勾选任何选项（README、.gitignore、License）"
    echo "5. 点击 'Create repository'"
    echo ""
    read -p "创建完成后按回车继续..."
    echo ""
    echo "🚀 开始推送（会要求输入用户名和密码）..."
    echo "   Username: VIONWILLIAMS"
    echo "   Password: [粘贴你的个人访问令牌]"
    echo ""
    git push -u origin main
else
    echo "❌ 无效选择"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 推送完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 仓库地址: https://github.com/VIONWILLIAMS/supercoordination-mcp"
echo ""
echo "🎯 下一步: 部署到 Railway"
echo ""
echo "1. 访问: https://railway.app"
echo "2. 用 GitHub 登录"
echo "3. New Project → Deploy from GitHub repo"
echo "4. 选择 'supercoordination-mcp'"
echo "5. 等待部署完成"
echo "6. Settings → Domains → Generate Domain"
echo "7. 访问你的域名 🎉"
echo ""
