#!/usr/bin/env bash
# Creates a fresh production build and restarts the installed user service.
set -euo pipefail

SERVICE=marketplace-studio
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PNPM="$(command -v pnpm)"

if ! systemctl --user cat "$SERVICE" >/dev/null 2>&1; then
  echo "O serviço $SERVICE ainda não está instalado." >&2
  echo "Instale uma vez com: scripts/install-service.sh" >&2
  exit 1
fi

echo "Gerando novo build de produção..."
(cd "$ROOT" && "$PNPM" build)

echo "Reiniciando $SERVICE..."
if ! systemctl --user restart "$SERVICE"; then
  systemctl --user status "$SERVICE" --no-pager || true
  exit 1
fi

if ! systemctl --user is-active --quiet "$SERVICE"; then
  systemctl --user status "$SERVICE" --no-pager || true
  exit 1
fi

echo "Pronto: http://localhost:3456"
