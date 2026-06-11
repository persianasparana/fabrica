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
  mkdir -p "$dest/logos" "$dest/fonts/galano"
  cp "$SRC/tokens.css" "$dest/tokens.css"
  cp "$SRC/palette.json" "$dest/palette.json"
  cp "$SRC/logos/"*.png "$dest/logos/"
  # Fonte oficial Galano: o CSS sempre vai; os OTFs só existem no servidor
  # (instalados via install-galano.sh — fonte licenciada, fora do git).
  cp "$SRC/fonts/galano.css" "$dest/fonts/galano.css"
  if compgen -G "$SRC/fonts/galano/*.otf" > /dev/null; then
    cp "$SRC/fonts/galano/"*.otf "$dest/fonts/galano/"
  fi
  echo "  → $dest"
}

echo "Sincronizando identidade visual a partir de shared/brand/ ..."
copy "$ROOT/qualidade/public/assets/brand"
copy "$ROOT/pcp/frontend/public/brand"
echo "Concluído. (palette.json é lido diretamente pelo tailwind.config.js do PCP.)"
