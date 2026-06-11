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
  mkdir -p "$dest/logos"
  cp "$SRC/tokens.css" "$dest/tokens.css"
  cp "$SRC/palette.json" "$dest/palette.json"
  cp "$SRC/logos/"*.png "$dest/logos/"
  echo "  → $dest"
}

echo "Sincronizando identidade visual a partir de shared/brand/ ..."
copy "$ROOT/qualidade/public/assets/brand"
copy "$ROOT/pcp/public/assets/brand"
echo "Concluído."
