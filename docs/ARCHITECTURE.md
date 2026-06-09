# Arquitetura — fabrica

Monorepo com dois sistemas independentes que compartilham apenas a identidade
visual. Ambos rodam no mesmo servidor de aplicativos.

```
┌───────────────────────────── Servidor (Apache/PHP) ─────────────────────────────┐
│                                                                                  │
│   pcp.persianas… (vhost)                  qualidade.persianas… (vhost)           │
│   ┌──────────────────────────┐            ┌──────────────────────────┐          │
│   │  PCP frontend (estático)  │            │  Qualidade (PHP + HTML)   │          │
│   │  React/Vite build (dist)  │            │  public/ servido direto   │          │
│   │        │  fetch /api       │            │        │  fetch api/*      │          │
│   │        ▼                   │            │        ▼                   │          │
│   │  PCP API (PHP/PDO)         │            │  API NCs (PHP/PDO)        │          │
│   │  kv_store + users          │            │  nao_conformidades+users  │          │
│   └──────────┬───────────────┘            └──────────┬───────────────┘          │
│              ▼                                         ▼                          │
│        SQLite/MySQL (data/)                      SQLite/MySQL (data/)            │
└──────────────────────────────────────────────────────────────────────────────┘
            ▲ identidade visual compartilhada (shared/brand)
```

## Sistema PCP

- **Frontend** (`pcp/frontend`): SPA React (Vite + Tailwind). Concentra TODA a
  lógica de negócio (fórmulas de corte, estrutura de produto/BOM, indicadores,
  plano-mestre). Compilado para estático.
- **Backend** (`pcp/api`): API PHP que expõe um armazenamento chave-valor
  autenticado (`kv_store`). O frontend grava documentos JSON por chave
  (`pedido:<id>`, `estoque:<sku>`, `apontamento:<id>`, `config:default`),
  tornando os dados compartilhados entre usuários.
- **Persistência no cliente:** a interface `window.storage` usada pelo
  componente é implementada em `src/storage.js` sobre a API. Trocar a estratégia
  de persistência (ex.: normalizar em tabelas) afeta apenas o backend + esse
  módulo.

### Por que armazenamento chave-valor?

Preserva integralmente a lógica de cálculo já validada do frontend (baixo risco)
e entrega dados compartilhados de imediato. A evolução natural é normalizar as
entidades de maior consulta (pedidos, estoque) em tabelas dedicadas, mantendo o
mesmo contrato de API.

## Sistema Qualidade

- App PHP clássico (sem build): `public/` (HTML/CSS/JS + `api/*.php`),
  `src/` (domínio), `config/`, `data/`.
- Repositório de não conformidades, KPIs (Chart.js local) e sugestões de
  treinamento. Detalhes em `qualidade/docs/ARCHITECTURE.md`.

## Camada compartilhada (`shared/brand`)

`palette.json` (canônico) + `tokens.css` + logotipos. `sync.sh` copia os ativos
para dentro de cada app. O PCP ainda lê `palette.json` no `tailwind.config.js`.

## Segurança (comum aos dois backends)

- PDO com prepared statements (OWASP A03).
- Sessão por cookie HttpOnly + SameSite=Lax; CSRF nas escritas (A07).
- Rate limiting de login **persistido em banco** por usuário+IP (A04/A07).
- Cabeçalhos de segurança (A05) via PHP e `.htaccess`.
- `src/`, `config/`, `data/` fora do document root / bloqueados por `.htaccess`.

## Fluxo de autenticação

1. `GET /api/auth.php` → 401 se não logado; o frontend exibe o login.
2. `POST /api/auth.php` (usuário/senha) → cria sessão, devolve `csrf_token`.
3. Escritas enviam `X-CSRF-Token`; sessão expira por inatividade.
