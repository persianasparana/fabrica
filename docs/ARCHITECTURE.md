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
│        ├─ /pcp/*           → PCP (estático: pcp/public)                           │
│        ├─ /qualidade/*     → estático (qualidade/public)                          │
│        ├─ /api/auth/*      → login/logout/sessão (compartilhado)                  │
│        ├─ /api/pcp/*       → fila de produção, bipagem, estrutura do produto      │
│        └─ /api/qualidade/* → não conformidades + KPIs                             │
│                  │                                                                │
│                  ▼                                                                │
│        PostgreSQL (5432) · banco `fabrica_db` (role própria)                      │
└──────────────────────────────────────────────────────────────────────────────┘
            ▲ identidade visual compartilhada (shared/brand)
```

## Componentes

| Pasta | Papel |
|---|---|
| `server/` | Backend único (Node + Express + `pg`). Serve as duas APIs e, opcionalmente, os dois frontends estáticos. |
| `pcp/public/` | Frontend do PCP (HTML/CSS/JS): fila, alertas, bipagem, importação e Estrutura do Produto. |
| `qualidade/public/` | Frontend do Qualidade (HTML/CSS/JS + Chart.js local). |
| `shared/brand/` | Design tokens + logotipo (fonte única). |
| `infra/` | `nginx/` (server block) e `systemd/` (unit). |

## Modelo de dados (PostgreSQL, banco `fabrica_db`)

| Tabela | Uso |
|---|---|
| `users` | Login compartilhado pelos dois sistemas (bcrypt). |
| `login_attempts` | Rate limiting persistido (usuário + IP). |
| `audit_log` | Auditoria (coluna `app` distingue pcp/qualidade). |
| `pcp_itens` | Fila de produção do PCP (itens de pedido: datas, tipo, motivo, ★ especial). |
| `pcp_pecas` | Peças individuais por item (etiqueta única por peça + baixa própria). |
| `pcp_produtos` | Estrutura do produto: fórmulas de corte e componentes (BOM) em JSONB. |
| `nao_conformidades` | NCs do Qualidade (`setores`/`origens` em JSONB). |
| `session` | Sessões (criada por `connect-pg-simple`). |

## Decisões

- **Um serviço, um login.** PCP e Qualidade compartilham `users` e a sessão
  (cookie por domínio). Papéis (`role`) permitem restringir acesso por sistema
  no futuro.
- **PCP em tabelas reais, com peças individuais.** Cada produto adicionado a um
  pedido é um item individual com sua peça (`pcp_pecas`). A etiqueta — gerada
  pelo sistema de pedidos — é **bipada no cadastro do pedido** (ou vinculada
  depois no detalhe do item); a tela de Bipagem é exclusiva da **embalagem**,
  que bipa para dar baixa daquela peça (atômico). A conclusão do item é
  **derivada**: fecha quando todas as peças têm baixa. Importação em lote roda
  em transação única.
- **Estrutura do produto como fonte.** O cadastro de novo pedido seleciona o
  produto da estrutura (vínculo `produto_id`); fórmulas de corte ficam como
  texto legível (`L - 2.2`) e os cálculos especiais das PH (cordas/furos) são
  preservados em `calculo_extra_fonte`.
- **Frontends estáticos, sem build.** PCP e Qualidade são HTML/CSS/JS puros com
  caminhos relativos — funcionam na raiz e sob o subpath `/fabrica/`.

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
