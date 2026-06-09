#!/usr/bin/env bash
# ============================================================================
# Sincroniza os ativos de marca (fonte única em shared/brand/) para dentro de
# cada aplicação. Execute após alterar a identidade visual, e no build/deploy.
#
# Uso:  bash shared/brand/sync.sh   (a partir da raiz do repositório)
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/shared/brand"

copy() {
  local dest="$1"
  mkdir -p "$dest"
  cp "$SRC/tokens.css" "$dest/tokens.css"
  cp "$SRC/logo.svg" "$dest/logo.svg"
  cp "$SRC/logo-mark.svg" "$dest/logo-mark.svg"
  cp "$SRC/palette.json" "$dest/palette.json"
  echo "  → $dest"
}

echo "Sincronizando identidade visual a partir de shared/brand/ ..."
copy "$ROOT/qualidade/public/assets/brand"
copy "$ROOT/pcp/frontend/public/brand"
echo "Concluído. (palette.json é lido diretamente pelo tailwind.config.js do PCP.)"
