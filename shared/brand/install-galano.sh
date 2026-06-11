#!/usr/bin/env bash
# ============================================================================
# Instala a fonte oficial Galano Grotesque (OTFs licenciados) a partir da
# pasta compartilhada do servidor e sincroniza para os dois frontends.
#
# Os OTFs NÃO ficam no git (fonte comercial). Origem padrão: a mesma pasta
# usada pela Agenda de Consultores no servidor `aplicativos`.
#
# Uso (no servidor):  bash shared/brand/install-galano.sh
# Origem alternativa: GALANO_SRC=/outro/caminho bash shared/brand/install-galano.sh
#
# Idempotente: pode rodar quantas vezes quiser.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="${GALANO_SRC:-/var/www/agenda/shared/brand-assets/fonts}"
DEST="$ROOT/shared/brand/fonts/galano"

if [ ! -d "$SRC" ]; then
  echo "AVISO: origem '$SRC' não encontrada — pulando instalação da Galano."
  echo "       (Os sistemas continuam funcionando com o fallback Manrope.)"
  exit 0
fi

mkdir -p "$DEST"

# Mapeia "nome do arquivo na pasta da Agenda" -> peso CSS
declare -A MAP=(
  ["Galano Grotesque Light.otf"]="300"
  ["Galano Grotesque.otf"]="400"
  ["Galano Grotesque Medium.otf"]="500"
  ["Galano Grotesque Semi Bold.otf"]="600"
  ["Galano Grotesque Bold.otf"]="700"
  ["Galano Grotesque Extra Bold.otf"]="800"
)

ok=0
for nome in "${!MAP[@]}"; do
  peso="${MAP[$nome]}"
  if [ -f "$SRC/$nome" ]; then
    cp "$SRC/$nome" "$DEST/galano-$peso.otf"
    echo "  ✓ $nome -> galano-$peso.otf"
    ok=$((ok + 1))
  else
    echo "  ✗ não encontrado: $SRC/$nome (peso $peso segue no fallback Manrope)"
  fi
done

if [ "$ok" -eq 0 ]; then
  echo "Nenhum OTF copiado — verifique a pasta de origem."
  exit 0
fi

# Propaga para qualidade/ e pcp/ (inclui galano.css e os OTFs)
bash "$ROOT/shared/brand/sync.sh"

echo
echo "Galano instalada ($ok pesos). Lembre de REBUILDAR o PCP para o build"
echo "estático incluir as fontes:  cd pcp/frontend && npm run build"
