# Arquitetura — fabrica

Monorepo com dois sistemas (PCP e Qualidade) servidos por **um único backend
Node**, atrás do **Nginx**, usando **PostgreSQL** — o mesmo padrão dos demais
apps da Persianas Paraná.

```
┌──────────────────────── Servidor "aplicativos" (Ubuntu) ────────────────────────┐
│                                                                                  │
│   Nginx (80/443)  ── outros apps (3000/3010/3011) ── intactos                    │
│        │ server block novo: fabrica.persianas…                                   │
│        ▼                                                                          │
│   fabrica-server  (Node/Express · PM2)  127.0.0.1:3020                            │
│        ├─ /pcp/*           → SPA React (estático: pcp/frontend/dist)              │
│        ├─ /qualidade/*     → estático (qualidade/public)                          │
│        ├─ /api/auth/*      → login/logout/sessão (compartilhado)                  │
│        ├─ /api/pcp/*       → armazenamento chave-valor do PCP                     │
│        └─ /api/qualidade/* → não conformidades + KPIs                             │
│                  │                                                                │
│                  ▼                                                                │
│        PostgreSQL (5432) · banco `fabrica` (role própria)                         │
└──────────────────────────────────────────────────────────────────────────────┘
            ▲ identidade visual compartilhada (shared/brand)
```

## Componentes

| Pasta | Papel |
|---|---|
| `server/` | Backend único (Node + Express + `pg`). Serve as duas APIs e, opcionalmente, os dois frontends estáticos. |
| `pcp/frontend/` | SPA React (Vite + Tailwind). Toda a lógica de negócio do PCP. |
| `qualidade/public/` | Frontend do Qualidade (HTML/CSS/JS + Chart.js local). |
| `shared/brand/` | Design tokens + logotipo (fonte única). |
| `infra/` | `nginx/` (server block) e `systemd/` (unit). |

## Modelo de dados (PostgreSQL, banco `fabrica_db`)

| Tabela | Uso |
|---|---|
| `users` | Login compartilhado pelos dois sistemas (bcrypt). |
| `login_attempts` | Rate limiting persistido (usuário + IP). |
| `audit_log` | Auditoria (coluna `app` distingue pcp/qualidade). |
| `pcp_kv_store` | Documentos JSON do PCP por chave (`pedido:<id>`, `estoque:<sku>`…). |
| `nao_conformidades` | NCs do Qualidade (`setores`/`origens` em JSONB). |
| `session` | Sessões (criada por `connect-pg-simple`). |

## Decisões

- **Um serviço, um login.** PCP e Qualidade compartilham `users` e a sessão
  (cookie por domínio). Papéis (`role`) permitem restringir acesso por sistema
  no futuro.
- **PCP via chave-valor.** Preserva 100% da lógica do frontend (baixo risco) e
  entrega dados compartilhados. Evolução natural: normalizar entidades de maior
  consulta mantendo o mesmo contrato de API.
- **Frontends estáticos.** O PCP mantém o `window.storage` original, agora
  reimplementado sobre a API (`pcp/frontend/src/storage.js`).

## Segurança

- Sessão por cookie HttpOnly + SameSite=Lax; `Secure` sob HTTPS (via Nginx +
  `trust proxy`).
- CSRF por token de sessão (header `X-CSRF-Token` nas escritas).
- Rate limiting de login persistido no banco (OWASP A04/A07).
- Cabeçalhos de segurança via `helmet` (CSP compatível com os frontends).
- Senhas com bcrypt; queries parametrizadas (`pg`) — anti-SQLi (A03).

## Convivência no servidor

O servidor `aplicativos` já roda **Logística** e **Agenda** em produção. O
`fabrica` entra isolado: processo PM2 próprio (`fabrica-server`) na porta **3020**,
banco próprio (`fabrica_db`/`fabrica_user`), diretório `/var/www/fabrica`, e
rota própria (`/fabrica/` via `include` no vhost, **antes** do fallback da
Logística, ou hostname dedicado). Nenhuma porta, processo, banco ou `location`
existente é alterado. Regras e reservas em
[`docs/SERVIDOR-COMPARTILHADO.md`](SERVIDOR-COMPARTILHADO.md); passo a passo em
[`docs/DEPLOYMENT.md`](DEPLOYMENT.md).
