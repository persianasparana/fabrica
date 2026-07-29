# IDENTIDADE VISUAL — Persianas Paraná (federação ERP)

> **Guia único da marca, replicado em TODOS os repositórios da federação** (igual ao
> `MAPA-DO-SERVIDOR.md`). O conteúdo global abaixo é idêntico em todos os repos; a seção
> final **"NESTE REPOSITÓRIO"** muda de repo para repo (aponta onde os assets vivem aqui).
> Ao alterar a marca, edite este arquivo e sinalize a replicação nos demais.
>
> **Fonte de verdade (autoritativa):** `logistica/docs/identidade-visual/` — contém o
> **`BRAND-GUIDE.pdf` oficial da agência**, o `DESIGN-SYSTEM.md` completo e o kit portátil
> (`css/`, `logos/`, `icons-pwa/`). Toda dúvida de marca se resolve lá.
> Documento gerado a partir de auditoria de código dos 8 repositórios (28/07/2026).

---

## 1. A marca em 30 segundos

- **Cores institucionais:** **preto `#1D1D1B`**, **branco `#FFFFFF`**, **vermelho `#C1212D`**
  e **dourado `#C6B784`**.
- **Tipografia:** **Galano Grotesque** (oficial, licenciada) → na web usamos **Manrope**
  (substituta open-source, praticamente idêntica), pesos 400–800.
- **Roxo e laranja são BANIDOS** (decisão da gerência): roxo → cinza `#606060`; laranja → dourado.
- **Duas linhas visuais** da mesma marca (ver §4): **linha vermelha** (apps de gestão) e
  **linha dourada** (Comercial/Agenda, sem vermelho).
- Logos são **sempre `<img>` PNG** — nunca SVG inline, nunca recolorir/distorcer. Fundo escuro
  usa a logo branca; fundo claro usa a preta.

---

## 2. Paleta oficial (tokens `--pp-*`)

Estes são os tokens canônicos definidos em `pp-brand.css` (idênticos em todos os apps que o usam):

| Token | HEX | Uso |
|---|---|---|
| `--pp-preto` | `#1D1D1B` | Texto principal, fundo dark, base institucional |
| `--pp-branco` | `#FFFFFF` | Fundo claro, texto sobre escuro |
| `--pp-vermelho` | `#C1212D` | Primária da linha vermelha (botões, destaques) |
| `--pp-vermelho-claro` | `#E73B3E` | Hover, accent no dark |
| `--pp-vermelho-hover` | `#A11823` | Estado pressionado |
| `--pp-dourado` | `#C6B784` | Secundária / primária da linha dourada |
| `--pp-dourado-dark` | `#A89760` | Dourado em hover / sobre claro |
| `--pp-cinza-10` | `#F7F7F8` | Fundos sutis |
| `--pp-cinza-30` | `#E5E7EB` | Bordas, divisores |
| `--pp-cinza-50` | `#CCCCCC` | Desabilitado |
| `--pp-cinza-70` | `#606060` | Status neutro (**substitui o roxo legado**) |
| `--pp-cinza-90` | `#2D2D2D` | Texto secundário no dark |

**Semânticas de status** (iguais em todos): `--pp-success #15803D` (bg `#DCFCE7`) ·
`--pp-warning #B45309` (bg `#FEF3C7`) · `--pp-danger #B91C1C` (bg `#FEE2E2`) ·
`--pp-info #1E40AF` (bg `#DBEAFE`).

**Cores BANIDAS** (não usar; remapear via token): roxo `#a855f7`/`#7c3aed`/`--purple` → `--pp-cinza-70`;
laranja `#f97316`/gradientes → `--pp-dourado`. Também evitar verde-limão, ciano e rosa.

---

## 3. Tipografia

- **Oficial:** **Galano Grotesque** (licenciada; os `.otf` ficam SÓ no servidor, em
  `/var/www/agenda/shared/brand-assets/` — Bold/ExtraBold/Light/Medium/SemiBold/Regular).
  Não versionar os arquivos pagos no git.
- **Web:** **Manrope** (Google Fonts / open-source), stack
  `'Manrope', 'Helvetica Neue', Arial, sans-serif`, pesos **400;500;600;700;800**.
- **Como carregar (ordem de preferência):**
  1. **Auto-hospedada local** (`@font-face` → `.woff2` no próprio app) — melhor: funciona
     offline e sob CSP estrita. Ex.: Fábrica e Produtos.
  2. Google Fonts via `<link>`/`@import` — aceitável, mas depende de rede e pode falhar sob CSP.
  3. **Nunca** confiar na fonte estar instalada no SO do cliente (cai no fallback silenciosamente).

---

## 4. As duas linhas da marca (importante)

A mesma marca tem duas expressões — **não é divergência acidental, é intencional**:

- **Linha VERMELHA — apps de GESTÃO** (Logística, RH, Financeiro, Compras, Fiscal, Produtos,
  Fábrica/Qualidade): accent primário **vermelho `#C1212D`**, logo vermelha/preta/branca conforme fundo.
  *Nuance:* no **PCP da Fábrica** (tema escuro) o accent é **dourado sobre preto**, com vermelho
  reservado a alertas.
- **Linha DOURADA — Comercial/Agenda** (`agenda-consultores`): primária **dourado `#C6B784`**
  sobre base **preto `#1D1D1B`**, **ZERO vermelho** na marca (o vermelho que aparece é só
  status "rejeitado"/erro, não branding). Stack diferente: **Next.js + Tailwind** consumindo o
  pacote **`@persianasparana/design-system`** (componentes `PP*` + preset Tailwind), que vive
  **fora dos repos** (monorepo `shared/` no servidor), não em npm público.

Ambas compartilham o **mesmo preto `#1D1D1B`**, a **mesma fonte (Manrope/Galano)** e o **mesmo
acervo de logos/brand-assets**.

---

## 5. Como a marca é distribuída entre os apps

Não há (ainda) um pacote npm único para os 7 apps vanilla — o compartilhamento é por **cópia
de arquivos**. Três mecanismos convivem hoje:

| Mecanismo | Quem usa | Observação |
|---|---|---|
| Cópia física de `pp-brand.css` (+ `pp-components.css`) | Logística, RH, Financeiro, Compras, Fiscal, Produtos | Editar num, replicar nos outros |
| `shared/brand/` com `tokens.css` + `palette.json` + `sync.sh` | Fábrica | Modelo mais maduro (fonte única + script de sync + fontes locais) |
| Pacote npm privado `@persianasparana/design-system` (`file:` / registry privado) | Agenda (Next.js) | Componentes React `PP*` + preset Tailwind |

> **Recomendação de evolução (não obrigatória):** convergir os apps vanilla para o modelo
> `shared/brand/` da Fábrica (tokens + `palette.json` + fontes locais + `sync.sh`), que já é a
> referência mais completa. A fonte de verdade documental continua em
> `logistica/docs/identidade-visual/`.

---

## 6. Estado por app (auditoria 28/07/2026)

| App | CSS de marca | Fonte carregada como | Favicon | Linha |
|---|---|---|---|---|
| **Logística** | `pp-brand`+`components`+tema (origem) | Google Fonts CDN | ✅ completo | vermelha |
| **RH** | `pp-brand`+`components`+`pp-rh` | Google Fonts CDN | ❌ ausente | vermelha |
| **Financeiro** | `pp-brand`+`financeiro` (`components` órfão) | Google Fonts `@import` | ❌ ausente | vermelha |
| **Fábrica** | `brand/tokens.css`+`palette.json`+`style` | **local (woff2)** ✅ | ✅ | verm./dourada* |
| **Fiscal** | `fiscal.css` (`pp-brand`/`components` **não linkados**) | Google Fonts CDN | ❌ ausente | vermelha |
| **Compras** | `pp-brand`+`components`+`style` | **não carrega** ⚠️ (depende do SO) | ❌ ausente | vermelha |
| **Produtos** | `pp-brand`+`pp-produtos` | **local (woff2)** ✅ | ✅ | vermelha |
| **Agenda** | pacote `@persianasparana/design-system` | Google Fonts `@import` | ✅ completo | **dourada** |

\* Fábrica: Qualidade = vermelho/logo preto; PCP = dourado sobre preto/logo branco.

### Pendências de consistência conhecidas (para quem for padronizar)
1. **Compras não carrega a Manrope** (nem CDN nem local) — cai no fallback do SO. Corrigir com
   `@font-face` local (modelo Fábrica/Produtos) ou `<link>` Google Fonts.
2. **Sem favicon:** RH, Financeiro, Compras, Fiscal. Copiar o conjunto de
   `logistica/docs/identidade-visual/logistica/icons-pwa/`.
3. **CSS órfão/morto:** `pp-components.css` não é linkado no Financeiro; no Fiscal os
   `pp-brand.css`/`pp-components.css` existem mas nenhum HTML os referencia (só `fiscal.css`).
   Limpar ou passar a usar.

---

## 7. Regras de uso rápidas

- **Logos:** sempre `<img>` PNG. Dark → `logo-branco.png`; light → `logo-preto.png`;
  cor da marca → `logo-vermelho.png` (linha vermelha) / dourado embutido (linha dourada).
  Nunca recolorir, distorcer ou usar as versões `-original` (fundo preto opaco, bug conhecido).
- **Tema claro/escuro:** via `html[data-theme="dark"]`; os tokens semânticos
  (`--bg/--surface/--text/--accent`) trocam sozinhos — não hardcode HEX no componente.
- **Acessibilidade:** alvos de toque ≥ 44px, contraste AA, fonte base ≥ 16px em mobile.
- **Espaçamento:** grid de 4 pontos (ver `DESIGN-SYSTEM.md`).

---
## 8. NESTE REPOSITÓRIO — `fabrica`

**Modelo mais maduro de distribuição da marca (referência para os demais).**

- **Fonte única compartilhada:** `shared/brand/` — `tokens.css` (`--pp-*`), `palette.json`
  (escalas + semânticas + fontes), `logos/`, **`README.md` (guia de identidade próprio)** e
  `sync.sh` (distribui para o app).
- **CSS vivo:** `pcp/public/assets/brand/tokens.css` + `pcp/public/assets/brand/palette.json`
  + `pcp/public/assets/css/style.css` (consome os tokens).
- **Fonte:** **Manrope auto-hospedada** — `pcp/public/assets/fonts/manrope.css` (`@font-face` →
  `.woff2` locais). Sem CDN (bom para CSP/offline).
- **Logos/ícones:** `pcp/public/assets/brand/logos/` (logo preto/branco/vermelho, **favicon.png**,
  apple-touch, icon-192/512).
- **Linha:** Qualidade = vermelho/logo preto; **PCP = dourado sobre preto/logo branco** (tema escuro).
- **Fonte de verdade documental:** `logistica/docs/identidade-visual/`.

---

*Guia replicado nos 8 repositórios da federação (Logística, RH, Financeiro, Fábrica, Fiscal,
Compras, Produtos, Agenda). Conteúdo global idêntico; a §8 é local. Fonte de verdade:
`logistica/docs/identidade-visual/` (BRAND-GUIDE.pdf). Auditoria de código: 28/07/2026.*
