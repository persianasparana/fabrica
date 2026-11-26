# server — Backend unificado (Node ESM + Express + PostgreSQL)

API dos dois sistemas (PCP e Qualidade), autenticação compartilhada (sessão + CSRF), os
clientes HTTP dos módulos vizinhos e, opcionalmente, os dois frontends estáticos.

```
server/
├── src/
│   ├── server.js             # app Express (helmet, sessão em PG, mounts, estáticos, erros); aborta sem SESSION_SECRET
│   ├── db.js                 # pool pg + migrate(): schema inteiro, idempotente, rodado no boot (26 tabelas)
│   ├── auth.js               # login, bcrypt, rate limiting em banco, CSRF, requireAuth/requireAdmin/requirePerm, audit
│   ├── seed.js               # seeds de TESTE (status, setores, estrutura, fila da planilha antiga)
│   ├── util.js               # HttpError + asyncHandler (ah)
│   ├── corte.js              # motor de fórmulas de corte (cm)
│   ├── ordem-corte.js        # cálculo da OC por peça (legado; alimenta a Ficha)
│   ├── ordem-corte-nucleo.js # plano de corte via Núcleo
│   ├── estrutura-regras.js   # seleção automática da Estrutura (F3)
│   ├── roteiro.js            # roteiro por estrutura ou por linha
│   ├── nucleo-spec.js        # spec da venda + corpo das chamadas ao Núcleo (P0; como a venda cotou + reserva, 25/11)
│   ├── completar-spec.js     # completa spec_nucleo.cotacao das peças já na fila (relê o pedido no Comercial)
│   ├── lista-materiais.js    # lista de materiais em blocos (P0/P1)
│   ├── necessidade.js        # necessidade de materiais + requisição ao Compras (P1/P3)
│   ├── carga.js              # sequenciador do planejamento de carga (P2, puro)
│   ├── etiquetas.js          # geração/registro de etiquetas (F2)
│   ├── comercial-client.js   # Comercial :3010 + outbox pcp_ciclo_pendencias
│   ├── produtos-client.js    # Núcleo :3070 (best-effort)
│   ├── compras-client.js     # Compras :3050 + outbox pcp_compras_pendencias
│   └── routes/
│       ├── auth.js           # /api/auth
│       ├── pcp.js            # /api/pcp: itens, pedido, bip, pecas, estrutura, status, tipos, carga, necessidade, materiais
│       ├── admin.js          # /api/pcp: setores, usuarios
│       ├── ordem-corte.js    # /api/pcp/ordem-corte
│       ├── etiquetas.js      # /api/pcp/etiquetas
│       ├── estrutura-regras.js # /api/pcp/estrutura-regras
│       ├── expedicao.js      # /api/pcp/expedicao
│       ├── fotos-ecommerce.js# /api/pcp/fotos-ecommerce
│       ├── qualidade.js      # /api/qualidade
│       ├── comercial.js      # /api/comercial (ciclo do pedido)
│       └── integracao.js     # /api/integracao (X-API-Key, só leitura)
├── data/                     # estrutura-produtos.json + seed-itens.json (seeds de teste)
├── test/carga.test.mjs       # suítes sem banco (npm test): sequenciador de carga
├── test/nucleo-spec.test.mjs #   e o corpo que vai ao Núcleo como a venda cotou (25/11/2026)
└── bin/
    ├── install.js            # schema + seeds + admin (FABRICA_ADMIN_* ou interativo)
    ├── migrate.js            # só o schema
    ├── reset-senha.js        # recuperar senha pelo servidor
    ├── limpar-fila.js        # zera a fila (preserva cadastros; faz backup em backups/)
    ├── seed-tipos.js         # tipos de entrada de pedido
    ├── validar-cortes.js     # motor de corte × planilhas (sem banco)
    └── preencher-barras.js · reparar-keys.js · preencher-medidas.js · preencher-componentes.js · atualizar-horizontais.js
```

## Rotas

A lista completa, com método, caminho, permissão, CSRF e erros, está em
**[`../docs/API.md`](../docs/API.md)**. Resumo dos prefixos (montagem em `src/server.js`):

| Prefixo | Arquivo | Conteúdo |
|---|---|---|
| `GET /healthz` | `server.js` | health (`{ok:true}`) |
| `/api/auth` | `routes/auth.js` | login / session / logout |
| `/api/pcp` | `routes/pcp.js` + `routes/admin.js` | fila, pedido, bipagem, peças, estrutura, status, tipos, carga, necessidade, materiais; setores, usuários |
| `/api/pcp/ordem-corte` · `/etiquetas` · `/estrutura-regras` · `/expedicao` · `/fotos-ecommerce` | arquivos homônimos | plano de corte, etiquetas, regras, gavetas, fotos |
| `/api/qualidade` | `routes/qualidade.js` | NCs e KPIs |
| `/api/comercial` | `routes/comercial.js` | ciclo do pedido (proxy autenticado do Comercial) |
| `/api/integracao` | `routes/integracao.js` | leitura para a Logística (`X-API-Key`, sem sessão) |

Escritas exigem sessão + header `X-CSRF-Token` (obtido em login/session). Erros `{ error: 'mensagem' }`.
`POST /api/pcp/itens[/lote]` respondem **410** desde o P0 (entrada só pelo Comercial).

## Uso

```bash
cp .env.example .env       # PG*, SESSION_SECRET (obrigatória), FABRICA_ADMIN_*, chaves de integração
npm install
npm run install-app        # schema + seeds de teste + admin
npm start                  # ou: npm run dev  (com --watch)
npm test                   # sem banco: sequenciador de carga + corpo do Núcleo como a venda
npm run check              # node --check nos módulos principais
```

Configuração por ambiente: todas as variáveis lidas pelo código estão comentadas em
`.env.example` (conexão, sessão, proxy/cookie, estáticos, admin inicial, rate limiting,
`INTEGRACAO_API_KEY`, `COMERCIAL_*`, `PRODUTOS_*`, `COMPRAS_*`, `*_RETRY_MS`, `ECOMMERCE_FOTOS_DIR`).

### Recuperar senha (esqueceu a do admin)

Pelo servidor, na pasta `server/` (não há tela de "esqueci a senha"):

```bash
node bin/reset-senha.js --listar              # ver os usuários/admins
node bin/reset-senha.js <usuario> <novaSenha> # redefine (mín. 8 caracteres)
```

Reativa o usuário e limpa o bloqueio por tentativas. Sem a senha no comando, ele pergunta.
(Equivale a `npm run reset-senha -- <usuario> <novaSenha>`.)

Implantação em produção: [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) e [`../deploy/README.md`](../deploy/README.md).
