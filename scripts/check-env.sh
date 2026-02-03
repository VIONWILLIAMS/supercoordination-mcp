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

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[检查] DATABASE_URL 为空，请在 .env 中填写。"
  exit 1
fi

if [ -z "${JWT_SECRET:-}" ]; then
  echo "[检查] JWT_SECRET 为空，请在 .env 中填写。"
  exit 1
fi

echo "[检查] 环境变量已就绪。"
