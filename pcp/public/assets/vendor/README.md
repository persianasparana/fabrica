# Bibliotecas vendorizadas (de propósito)

Servidas localmente — **sem CDN** (a CSP do backend bloqueia scripts externos e
o acesso é via VPN/rede interna).

| Arquivo | Biblioteca | Versão | Uso |
|---|---|---|---|
| `pdf.min.js` + `pdf.worker.min.js` | [pdf.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Importação de ordens de produção em PDF |
| `xlsx.full.min.js` | [SheetJS CE](https://sheetjs.com/) | 0.18.5 | Importação de planilhas Excel (carregado sob demanda) |

Estes arquivos DEVEM ser versionados no git. Para atualizar, baixe a nova
versão do pacote npm correspondente (`pdfjs-dist`, `xlsx`) e substitua.
