# Bibliotecas vendorizadas (de propósito)

Servidas localmente — **sem CDN** (a CSP do backend bloqueia scripts externos e
o acesso é via VPN/rede interna).

| Arquivo | Biblioteca | Versão | Uso |
|---|---|---|---|
| `qrcode.js` | [qrcode-generator](https://www.npmjs.com/package/qrcode-generator) (Kazuhiko Arase, MIT) | 1.4.4 | QR das etiquetas próprias (leitura por celular) — carregado em `index.html`, usado por `assets/js/etiquetas.js` |

Este arquivo DEVE ser versionado no git. Para atualizar, baixe a nova versão do
pacote npm `qrcode-generator` e substitua.

## Removidas em 16/11/2026

`pdf.min.js` + `pdf.worker.min.js` (pdf.js 3.11.174) e `xlsx.full.min.js`
(SheetJS CE 0.18.5) serviam à **importação de ordens de produção** (PDF /
Excel / CSV), que saiu do PCP no P0 do planejamento (06/11/2026 — a entrada de
peças é só a liberação do pedido do Comercial; `POST /api/pcp/itens[/lote]`
responde 410). Nenhum HTML/JS referenciava mais os três arquivos (conferido por
`grep` em `pcp/public/` e `server/`), então foram apagados do repositório. O
"Exportar CSV" da fila (`exportXLSX()` em `app.js`) gera o CSV em JavaScript
puro e nunca dependeu do SheetJS.
