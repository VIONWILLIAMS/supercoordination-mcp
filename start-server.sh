#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if command -v caffeinate >/dev/null 2>&1; then
  echo "[启动] caffeinate 可用，启动并防休眠"
  caffeinate -i npm start
else
  echo "[启动] caffeinate 不可用，直接启动"
  npm start
fi
