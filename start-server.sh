#!/bin/bash

# 超协体MCP服务器启动脚本
# 功能：启动服务器并防止Mac休眠

echo "🚀 启动超协体MCP服务器..."

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在项目根目录执行此脚本"
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，安装依赖..."
    npm install
fi

# 获取本机IP
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')

echo ""
echo "🌟════════════════════════════════════════════════════🌟"
echo "  准备启动服务器"
echo "🌟════════════════════════════════════════════════════🌟"
echo ""
echo "📍 本机IP: $LOCAL_IP"
echo "📍 服务端口: 3000"
echo ""
echo "⚠️  注意事项："
echo "  1. 服务器运行期间，请保持此终端窗口开启"
echo "  2. Mac将保持唤醒状态（防止服务中断）"
echo "  3. 按 Ctrl+C 可停止服务器"
echo ""
echo "👥 邻居接入地址: http://$LOCAL_IP:3000/mcp"
echo ""
read -p "按回车键开始启动服务器..."

# 使用caffeinate防止休眠，同时启动服务器
caffeinate -i npm start
