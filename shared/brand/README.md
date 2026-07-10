# Identidade Visual — Persianas Paraná

Fonte **única** da identidade visual para os sistemas do monorepo `fabrica`,
baseada no brand-guide oficial da Persianas Paraná.

## Cores oficiais

| Token | Hex | Uso |
|---|---|---|
| Preto | `#1D1D1B` | Texto principal / fundo escuro |
| Branco | `#FFFFFF` | Fundo claro / texto sobre escuro |
| Vermelho | `#C1212D` | Primária operacional (acento do **Qualidade**) |
| Vermelho claro | `#E73B3E` | Hover / acento em fundo escuro |
| Dourado | `#C6B784` | Acento do **PCP** (sobre preto) / secundária |
| Dourado dark | `#A89760` | Hover do dourado |

Cinzas `#F7F7F8 #E5E7EB #CCCCCC #606060 #2D2D2D` · Semânticas (sucesso/aviso/erro/info)
em `palette.json`. **Banidos:** roxo, laranja, gradientes, verde-limão, ciano, rosa.

**Tipografia:** Manrope (400–800) — substituta open-source da Galano Grotesque.
Auto-hospedada (sem CDN): `@fontsource/manrope` no PCP; woff2 vendorizado no Qualidade.

## Arquivos

| Arquivo | Papel |
|---|---|
| `palette.json` | **Canônico.** Escalas `brand` (vermelho), `gold`, `ink` (preto), `sand` (cinzas), semânticas, fontes. |
| `tokens.css` | Variáveis `--pp-*` com tema claro (acento vermelho) e escuro (acento dourado). |
| `logos/logo-{preto,branco,vermelho}.png` | Logotipo horizontal (use a versão preta em fundo claro, branca em fundo escuro). |
| `logos/favicon.png`, `apple-touch-icon.png`, `icon-{192,512}.png` | Ícones / favicons. |

> Logos são PNG com transparência — usar como `<img>` (não recolorir nem distorcer;
> manter proporção). O selo "P" é o favicon.

## Aplicação por sistema

- **Qualidade** (tema claro): acento **vermelho**, logo **preto**.
- **PCP** (tema escuro, chão de fábrica): acento **dourado** sobre preto, logo **branco**;
  vermelho reservado a alertas.

## Como atualizar

1. Edite `palette.json` **e** `tokens.css` (mesmos nomes de token) e/ou troque os PNGs em `logos/`.
2. Rode `bash shared/brand/sync.sh` (copia tokens/paleta/logos para cada app).
3. Recompile o PCP (`npm run build`) e recarregue o Qualidade.

O `tailwind.config.js` do PCP lê `palette.json` e remapeia `amber`→dourado e
`stone`→preto da marca, aplicando a identidade sem reescrever componentes.
