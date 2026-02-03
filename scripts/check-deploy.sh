#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "[检查] 未发现 .env，请先复制 .env.example 并填写。"
  exit 1
fi

set -a
source .env
set +a

missing=0
for key in DATABASE_URL JWT_SECRET; do
  if [ -z "${!key:-}" ]; then
    echo "[检查] 缺少 $key"
    missing=1
  fi
done

if [ "$missing" -eq 1 ]; then
  exit 1
fi

echo "[检查] 关键环境变量已配置。"

if [ -n "${HEALTHCHECK_URL:-}" ]; then
  echo "[检查] 访问健康检查: $HEALTHCHECK_URL"
  curl -s "$HEALTHCHECK_URL" | head -n 5
else
  echo "[提示] 如需健康检查，请设置 HEALTHCHECK_URL"
fi
