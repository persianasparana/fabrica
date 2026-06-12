# server — Backend unificado (Node + PostgreSQL)

API dos dois sistemas (PCP e Qualidade) + autenticação compartilhada. Serve
também, opcionalmente, os dois frontends estáticos.

```
server/
├── src/
│   ├── server.js          # app Express (helmet, sessão, rotas, estáticos)
│   ├── db.js              # pool pg + schema (migração idempotente)
│   ├── auth.js            # sessão, bcrypt, CSRF, rate limiting em banco
│   ├── seed.js            # seeds: estrutura do produto + fila inicial
│   ├── util.js            # HttpError + asyncHandler
│   └── routes/{auth,pcp,qualidade}.js
├── data/                  # estrutura-produtos.json + seed-itens.json
└── bin/{install.js, migrate.js}
```

## Rotas

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/login` | Login (`{username, password}`) → `{user, csrf_token}` |
| GET | `/api/auth/session` | Sessão atual + CSRF (401 se anônimo) |
| POST/DELETE | `/api/auth/logout` | Encerra a sessão |
| GET | `/api/pcp/itens` | Fila de produção completa |
| POST/PUT/DELETE | `/api/pcp/itens` | Cria / atualiza / exclui item (CSRF) |
| POST | `/api/pcp/itens/lote` | Importação em lote, opcional `substituir` (CSRF) |
| GET | `/api/pcp/pedido?pedido=` | Todos os itens/peças de um pedido |
| PUT | `/api/pcp/pedido?pedido=` | Edição em massa do pedido; `acao` concluir/reabrir todas as peças (CSRF) |
| DELETE | `/api/pcp/pedido?pedido=` | Exclui o pedido inteiro (CSRF) |
| POST | `/api/pcp/bip` | Bipagem por setor `{codigo, setor_id, evento}` — Início/Fim; baixa no Fim do setor final (CSRF) |
| POST | `/api/pcp/bip/vincular` | Vincula etiqueta à próxima peça livre do pedido (CSRF) |
| PUT | `/api/pcp/pecas?id=` | Ajustes por peça: desvincular/baixa/reabrir (CSRF) |
| GET | `/api/pcp/status` | Status de produção ativos (qualquer usuário) |
| POST/PUT/DELETE | `/api/pcp/status` | Cadastra/edita/exclui status — **somente admin** (CSRF) |
| GET | `/api/pcp/estrutura` | Estrutura do produto (cortes c/ setor + BOM + roteiro) |
| POST/PUT/DELETE | `/api/pcp/estrutura` | Mantém produtos da estrutura (CSRF) |
| GET | `/api/pcp/setores` | Setores de produção (qualquer usuário) |
| POST/PUT/DELETE | `/api/pcp/setores` | Mantém setores — **admin** (CSRF) |
| GET/POST/PUT/DELETE | `/api/pcp/usuarios` | Usuários + permissões por aba + setores — **admin** (CSRF) |
| GET | `/api/qualidade/ncs` \| `?id=` | Lista (com filtros) / lê NC |
| POST/PUT/DELETE | `/api/qualidade/ncs` | Cria / atualiza / remove NC (CSRF) |
| GET | `/api/qualidade/kpis` | Indicadores agregados |
| GET | `/healthz` | Health check |

Escritas exigem o header `X-CSRF-Token` (obtido em login/session).

## Uso

```bash
cp .env.example .env       # configure PG*, SESSION_SECRET, FABRICA_ADMIN_*
npm install
npm run install-app        # schema + usuário admin
npm start                  # ou: npm run dev  (com --watch)
```

Configuração por ambiente (ver `.env.example`): conexão PostgreSQL, `SESSION_SECRET`,
`TRUST_PROXY`/`COOKIE_SECURE` (atrás de HTTPS), `SERVE_STATIC`, rate limiting.

Implantação em produção: [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).
