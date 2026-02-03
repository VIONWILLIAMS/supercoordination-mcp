#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[提示] 已生成 .env，请填写 DATABASE_URL 后再继续。"
  echo "[路径] $ROOT_DIR/.env"
  exit 1
fi

if ! grep -q "^DATABASE_URL" .env; then
  echo "[错误] .env 中未配置 DATABASE_URL"
  exit 1
fi

export $(grep -v '^#' .env | xargs) || true

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[错误] DATABASE_URL 为空，请在 .env 中填写"
  exit 1
fi

if echo "$DATABASE_URL" | grep -q "railway.internal"; then
  echo "[错误] 当前 DATABASE_URL 为 Railway 内网地址，无法在本地访问。"
  echo "[提示] 请在 Railway PostgreSQL 页面获取 Public 连接串（host 通常为 containers-xx.railway.app），然后更新 .env"
  exit 1
fi

npm install
npx prisma generate
npx prisma db push

if [ "${MIGRATE_STORE:-}" = "true" ]; then
  npm run migrate:store
fi

echo "[完成] 本地环境已就绪。"
