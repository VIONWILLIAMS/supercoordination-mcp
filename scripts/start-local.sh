#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[提示] 已生成 .env，请填写 DATABASE_URL 后再启动。"
  exit 1
fi

export NODE_ENV=development
npm start
