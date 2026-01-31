#!/bin/bash
# 超协体数据自动备份脚本
# 用途：防止数据被误删或篡改

BACKUP_DIR="$HOME/ClaudeWorkspace/supercoordination-mcp/backups"
DATA_FILE="$HOME/ClaudeWorkspace/supercoordination-mcp/data/store.json"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 备份数据文件
cp "$DATA_FILE" "$BACKUP_DIR/store_${TIMESTAMP}.json"

# 只保留最近50个备份
ls -t "$BACKUP_DIR"/store_*.json | tail -n +51 | xargs -r rm

echo "[备份完成] $TIMESTAMP"
echo "备份位置: $BACKUP_DIR/store_${TIMESTAMP}.json"
