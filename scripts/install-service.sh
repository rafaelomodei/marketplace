#!/usr/bin/env bash
# Installs Marketplace Studio as a systemd *user* service that starts with your session.
# Usage: scripts/install-service.sh            (build + install + start)
#        scripts/install-service.sh --uninstall
set -euo pipefail

NAME=marketplace-studio
UNIT="$HOME/.config/systemd/user/$NAME.service"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${1:-}" == "--uninstall" ]]; then
  systemctl --user disable --now "$NAME" 2>/dev/null || true
  rm -f "$UNIT"
  systemctl --user daemon-reload
  echo "Removido."
  exit 0
fi

NODE_BIN="$(dirname "$(command -v node)")"
PNPM="$(command -v pnpm)"
CODEX="$(command -v codex || true)"
[[ -z "$CODEX" ]] && echo "Aviso: 'codex' não está no PATH — a geração de imagens vai falhar." >&2

echo "Build de produção..."
(cd "$ROOT" && "$PNPM" install --frozen-lockfile && "$PNPM" build)

mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<UNIT
[Unit]
Description=Marketplace Studio (geração de imagens de produto)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
Environment=PATH=$NODE_BIN:$(dirname "${CODEX:-$NODE_BIN/codex}"):/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production
Environment=CODEX_BIN=${CODEX:-codex}
ExecStart=$PNPM start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now "$NAME"
echo
echo "Pronto: http://localhost:3456"
echo "Logs:    journalctl --user -u $NAME -f"
echo "Dica: para subir mesmo antes de fazer login, rode: sudo loginctl enable-linger $USER"
