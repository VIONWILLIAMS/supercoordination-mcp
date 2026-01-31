#!/bin/bash
# 超协体 - 一键部署脚本

echo "🚀 超协体 MCP 服务器 - 云部署助手"
echo "=================================="
echo ""

# 检查是否已经初始化 git
if [ ! -d .git ]; then
    echo "📦 初始化 Git 仓库..."
    git init
    echo "   ✅ Git 初始化完成"
    echo ""
fi

# 检查是否有未提交的更改
if git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "📋 没有新的更改需要提交"
else
    echo "📝 检测到新的更改，准备提交..."

    # 添加所有文件
    git add .

    # 创建提交
    echo ""
    echo "请输入提交信息（直接回车使用默认信息）:"
    read -r commit_message

    if [ -z "$commit_message" ]; then
        commit_message="feat: 更新超协体 MCP 服务器

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
    fi

    git commit -m "$commit_message"
    echo "   ✅ 提交完成"
    echo ""
fi

# 检查是否已经设置了远程仓库
if git remote | grep -q "origin"; then
    echo "🔄 推送到 GitHub..."
    git push origin main
    echo "   ✅ 推送完成"
    echo ""

    # 获取远程仓库 URL
    REPO_URL=$(git remote get-url origin)
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ 代码已推送到 GitHub"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📍 GitHub 仓库: $REPO_URL"
    echo ""
    echo "🎯 下一步: 在 Railway 部署"
    echo ""
    echo "1. 访问 https://railway.app"
    echo "2. 登录并点击 'New Project'"
    echo "3. 选择 'Deploy from GitHub repo'"
    echo "4. 选择你的仓库并部署"
    echo ""
else
    echo "🔗 准备连接到 GitHub..."
    echo ""
    echo "请选择创建仓库的方式："
    echo "1) 使用 GitHub CLI (gh) - 推荐"
    echo "2) 手动创建仓库"
    echo ""
    read -p "请选择 (1/2): " choice

    if [ "$choice" = "1" ]; then
        # 检查是否安装了 gh
        if ! command -v gh &> /dev/null; then
            echo "❌ 未安装 GitHub CLI"
            echo "安装命令: brew install gh"
            exit 1
        fi

        # 检查是否已登录
        if ! gh auth status &> /dev/null; then
            echo "📝 需要登录 GitHub..."
            gh auth login
        fi

        echo ""
        echo "📦 创建 GitHub 仓库..."

        # 询问仓库可见性
        echo "仓库可见性："
        echo "1) Public (公开)"
        echo "2) Private (私有)"
        read -p "请选择 (1/2, 默认公开): " visibility

        if [ "$visibility" = "2" ]; then
            visibility_flag="--private"
        else
            visibility_flag="--public"
        fi

        # 创建并推送
        gh repo create supercoordination-mcp $visibility_flag --source=. --remote=origin --push

        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "✅ GitHub 仓库创建成功！"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""

        # 获取仓库 URL
        REPO_URL=$(gh repo view --json url -q .url)
        echo "📍 仓库地址: $REPO_URL"
        echo ""
        echo "🎯 下一步: 在 Railway 部署"
        echo ""
        echo "1. 访问 https://railway.app"
        echo "2. 登录并点击 'New Project'"
        echo "3. 选择 'Deploy from GitHub repo'"
        echo "4. 选择 'supercoordination-mcp' 仓库"
        echo "5. 等待部署完成（约2-3分钟）"
        echo "6. 生成域名并访问"
        echo ""

    else
        echo ""
        echo "📝 手动创建仓库步骤："
        echo ""
        echo "1. 访问 https://github.com/new"
        echo "2. 仓库名: supercoordination-mcp"
        echo "3. 选择可见性（Public 或 Private）"
        echo "4. 点击 'Create repository'"
        echo ""
        echo "创建完成后，运行以下命令："
        echo ""
        echo "git remote add origin https://github.com/<你的用户名>/supercoordination-mcp.git"
        echo "git branch -M main"
        echo "git push -u origin main"
        echo ""
        echo "然后重新运行此脚本继续部署。"
        echo ""
    fi
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📚 完整部署指南: DEPLOY_TO_RAILWAY.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
