# Identidade Visual — Persianas Paraná

Fonte **única** da identidade visual para todos os sistemas do monorepo `fabrica`.

> ⚠️ **Provisório.** A paleta atual deriva do terracota `#C0392B` já em uso no Sistema
> de Qualidade. Ao receber as cores e o logotipo **oficiais**, atualize apenas os
> arquivos desta pasta — os dois sistemas passam a refletir a mudança.

## Arquivos

| Arquivo | Papel |
|---|---|
| `palette.json` | **Canônico.** Tokens de cor, tipografia, raio e sombra em formato legível por máquina. |
| `tokens.css` | Variáveis CSS (`--pp-*`) com temas claro/escuro. Consumido diretamente pelo Qualidade e pelo PCP. |
| `logo.svg` | Lockup completo (marca + texto "Persianas Paraná"). |
| `logo-mark.svg` | Apenas a marca (ícone), para favicons e espaços reduzidos. |

## Como substituir pela marca oficial

1. **Logotipo:** sobrescreva `logo.svg` e `logo-mark.svg` pelos arquivos oficiais
   (preferir SVG; manter `viewBox` e `role="img"`).
2. **Cores:** edite os valores em `palette.json` **e** as variáveis correspondentes
   em `tokens.css`. Mantenha os mesmos nomes de token.
3. **Tailwind (PCP):** as cores também estão espelhadas em
   `pcp/frontend/tailwind.config.js` (lê `palette.json` em build) — nenhuma ação
   manual necessária se você editar o `palette.json`.
4. Rebuild do PCP (`npm run build`) e recarregue o Qualidade.

## Escalas

- **brand** (terracota): 50→900 — cor primária da marca.
- **sand** (neutros quentes): 50→900 — superfícies, textos, bordas no tema claro.
- **night** (neutros escuros quentes): 50→950 — superfícies do tema escuro (PCP).
- **semantic**: success / warning / danger / info (+ versões `*Bg`).

## Tipografia

- **Títulos / marca:** Bricolage Grotesque (800).
- **Corpo (Qualidade):** stack de sistema.
- **Dados / monoespaçado (PCP):** JetBrains Mono.

Fontes carregadas via Google Fonts em cada app; podem ser auto-hospedadas para
deploy offline (ver `docs/DEPLOYMENT.md`).
