# Identidade Visual — Persianas Paraná (referência canônica)

> **Fonte da verdade** para identidade visual nos sistemas da empresa.
> Extraído do **Manual da Identidade Visual** oficial (brandguide), arquivado em
> `logistica/docs/brand-assets/BRAND-GUIDE.pdf`. Sempre que houver dúvida de
> marca (cor, fonte, logo), consulte ESTE arquivo primeiro.

---

## 1. A marca

- Empresa no mercado desde os anos 70; fabricação própria desde 2010.
- Fabricação, venda e instalação pela própria equipe; garantia de 5 anos e
  assistência vitalícia.
- O símbolo representa uma **persiana na letra P**. A identidade transmite
  leveza, modernidade e evolução.

## 2. Paleta de cores (oficial)

### Primárias (predominantes — reconhecimento da marca)

| Cor | Hex | Pantone | CMYK | RGB |
|---|---|---|---|---|
| Preto | `#1D1D1B` | Black | 0/0/0/100 | 29, 29, 27 |
| Branco | `#FFFFFF` | — | — | 255, 255, 255 |
| Vermelho | `#C1212D` | 1805C | 17/97/81/7 | 193, 33, 45 |

### Secundárias (suporte — apresentações, materiais, site)

| Cor | Hex | Pantone | CMYK | RGB |
|---|---|---|---|---|
| Cinza escuro | `#606060` | Cool Gray 10C | 57/47/46/36 | 96, 96, 96 |
| Cinza claro | `#CCCCCC` | Cool Gray 3C | 23/17/18/1 | 204, 204, 204 |
| Vermelho claro | `#E73B3E` | 1788C | 0/88/72/0 | 231, 59, 62 |
| Dourado | `#C6B784` | 4525C | 24/23/53/5 | 198, 183, 132 |

**Regra nos sistemas:** roxo é banido. Verde/âmbar/azul apenas como cores
semânticas de status (ver `tokens.css`). Acentos por sistema: Agenda = dourado,
Logística/Qualidade = vermelho, PCP = dourado (escurecido `#87794C` quando for
texto/botão sobre fundo claro, para manter contraste).

## 3. Tipografia (oficial)

A fonte oficial da marca é a **Galano Grotesque** (Rene Bieder — comercial,
licenciada). Hierarquia definida no manual:

| Peso | Uso (pelo manual) | font-weight CSS |
|---|---|---|
| Galano Grotesque **Extra Bold** | Exclusivo para títulos e destaques | 800 |
| Galano Grotesque **Bold** | Títulos e informações de destaque | 700 |
| Galano Grotesque **SemiBold** | Tipografia do logotipo (com modificações) | 600 |
| Galano Grotesque **Medium** | Textos de apoio, subtítulos, descritivos, legendas | 500 |
| Galano Grotesque **Light** | Textos de apoio, legendas | 300 |
| **Arial** | SOMENTE onde a webfont não é suportada | — |

### Como aplicar nos sistemas web

```css
font-family: 'Galano Grotesque', 'Manrope', 'Helvetica Neue', Arial, sans-serif;
```

- **Galano Grotesque** primeiro (fonte oficial). Os arquivos OTF são
  **licenciados e NÃO ficam no git** — vivem no servidor em
  `/var/www/agenda/shared/brand-assets/fonts/` (6 pesos: Light 300, Regular
  400, Medium 500, Semi Bold 600, Bold 700, Extra Bold 800).
- **Manrope** como fallback empacotado (open-source, auto-hospedada): é a
  substituta visual quando a Galano não está instalada (ex.: ambiente de
  desenvolvimento).
- **Arial** como último fallback de sistema, conforme o manual.
- Neste repositório: `shared/brand/fonts/galano.css` declara os `@font-face`;
  no servidor, `bash shared/brand/install-galano.sh` copia os OTFs a partir da
  pasta compartilhada da Agenda e sincroniza para os dois frontends.

## 4. Logotipo

- **Versões:** logo completa e selo (símbolo P), em preto, branco e vermelho —
  arquivos em `shared/brand/logos/` (e originais hi-res em
  `logistica/docs/brand-assets/`).
- **Fundo claro** → logo preta; **fundo escuro** → logo branca. Preservar
  contraste e legibilidade sobre fundos coloridos/imagens.
- **Redução mínima:** símbolo ≥ **85 px** de largura no digital; ≥ **3 cm**
  impresso.
- **Área de proteção:** espaço livre ao redor equivalente à largura do "P" de
  "Paraná".
- **Proibido:** deformar, rotacionar, alterar cores, desalinhar elementos,
  mudar posição dos elementos ou aplicar sobre fundo sem contraste.
  *"Se for alterado, deixou de ser PERSIANAS PARANÁ."*

## 5. Onde cada coisa está

| Ativo | Local |
|---|---|
| Manual completo (páginas) | `logistica/docs/brand-assets/BRAND-GUIDE.pdf` |
| Tokens CSS (cores/temas) | `shared/brand/tokens.css` (espelha `pp-brand.css` da Logística) |
| Paleta programática | `shared/brand/palette.json` (consumida pelo Tailwind do PCP) |
| Logos prontos para web | `shared/brand/logos/` |
| Fontes Galano (OTF licenciados) | servidor: `/var/www/agenda/shared/brand-assets/fonts/` |
| Declarações @font-face | `shared/brand/fonts/galano.css` |
| Fallback Manrope | npm `@fontsource/manrope` (PCP) · `qualidade/public/assets/fonts/` |
| Sincronização p/ os apps | `bash shared/brand/sync.sh` |
| Instalação das Galano (servidor) | `bash shared/brand/install-galano.sh` |
