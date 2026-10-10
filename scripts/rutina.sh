#!/bin/bash
# Rutina local del campamento: sincroniza las partidas, procesa las grabaciones y escribe las crónicas.
# Pensada para cron; fuera de las fechas de campamento.json no hace nada.
#
#   */10 * * * * /ruta/al/repo/scripts/rutina.sh
#
# Necesita: node, claude (CLI) con sesión iniciada, .venv con requirements.txt
# y el token de escritura en ~/.config/campamento-del-age/token.

REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE_DIR="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -1)"
export PATH="$HOME/.local/bin:${NODE_DIR:+$NODE_DIR:}$PATH"
cd "$REPO" || exit 1

mkdir -p logs
LOG="logs/rutina-$(date +%Y%m%d).log"

# Si la corrida anterior sigue en curso, esta se saltea
exec 9>logs/.rutina.lock
flock -n 9 || exit 0

EN_FECHA=$(node -e '
  const c = require("./campamento.json");
  const ahora = Date.now();
  console.log(ahora >= Date.parse(c.desde) && (!c.hasta || ahora <= Date.parse(c.hasta)) ? "si" : "no");
')
[ "$EN_FECHA" = "si" ] || exit 0

SYNC_TOKEN="$(cat "$HOME/.config/campamento-del-age/token" 2>/dev/null)"
if [ -z "$SYNC_TOKEN" ]; then
  echo "$(date -Iseconds) ERROR: falta ~/.config/campamento-del-age/token" >> "$LOG"
  exit 1
fi
export SYNC_TOKEN

{
  echo "=== $(date -Iseconds) ==="
  node scripts/sincronizar.mjs
  .venv/bin/python scripts/grabaciones.py
  .venv/bin/python scripts/cronicas.py
} >> "$LOG" 2>&1
