# 🗺️ MAPA DO SERVIDOR — Persianas Paraná (documento canônico)

> **FONTE DA VERDADE da infraestrutura compartilhada.** Este arquivo é **idêntico** em todos os
> repositórios (`logistica`, `agenda-consultores`, `fabrica`, `rh`, `financeiro`, `compras`).
> Ao mudar a infra, atualize aqui **e replique** nos outros repos. Não duplique a tabela de
> portas em outros docs — aponte para este arquivo.
>
> **Última verificação contra o servidor real:** 2026-06-26 (via `diag-servidor.sh`, ver §8).
> **Última revisão dos repositórios:** 2026-06-30 — lido o repo `compras` (estado do ERP/Compras + Bling)
> e o estado do **Pedido unificado** na Agenda (v2.23.0). Ver §6 (conflito aberto do Compras) e §2.

---

## 1. Servidor

| Item | Valor |
|---|---|
| Hostname | `aplicativos` |
| IP (LAN) | `192.168.0.207/24` (interface `ens18`) |
| Hostname público | `persianasparana.ddns.net` (via DDNS) |
| SO | Ubuntu 24.04.4 LTS · Kernel 6.8 · x86-64 |
| Node | v20.20.2 (todos os apps Node) |
| PM2 | 7.0.1 (auto-start no boot ativo) |
| PostgreSQL | 16.14, `127.0.0.1:5432` (não exposto) |
| MySQL/MariaDB | **não instalado** (ver §6 — ERP/Compras) |
| Nginx | vhost único `persianas`, `listen 443 ssl http2` |
| Acesso externo | OpenVPN (sem porta na internet); TLS via mkcert (CA interna) |
| Disco | `/` 24 GB, ~78% usado (~5 GB livres) — **vigiar** |

---

## 2. Mapa-mestre dos apps (estado REAL em produção)

| App | Porta | Bind | Processo PM2 | Banco | Dono do banco / tabelas | Path Nginx | Diretório | Health |
|---|---|---|---|---|---|---|---|---|
| **Logística** | 3000 | `0.0.0.0` ⚠️ | `persianas-api` | `persianas_db` | `postgres` (legado) / `persianas_user` | `/` `/api/` `/app/` | `/var/www/persianas` | `/api/health` |
| **Agenda API** | 3010 | `0.0.0.0` ⚠️ | `agenda-api` | `agenda_consultores` | `persianas` / `persianas` ⚠️ | `/agenda/api/` | `/var/www/agenda/agenda-consultores` | `/health` |
| **Agenda Admin** | 3011 | `0.0.0.0` ⚠️ | `agenda-admin` (Next.js) | — | — | `/agenda/` | (idem) | `/` (Next) |
| **Fábrica** | 3020 | `127.0.0.1` ✅ | `fabrica-server` | `fabrica_db` | `fabrica_user` / `fabrica_user` | `/fabrica/` | `/var/www/fabrica` | `/healthz` |
| **RH** | 3030 | `0.0.0.0` ⚠️ | `rh-api` | `rh_db` | `rh_user` / `rh_user` | `/rh/` | `/var/www/rh` | `/api/health` |
| **Financeiro** | 3040 | `0.0.0.0` ⚠️ | `financeiro-api` | `financeiro_db` | `financeiro_user` / `financeiro_user` | `/financeiro/` | `/var/www/financeiro` | `/api/health` |

**Compras** não é um app deste servidor (ver §6): o domínio de Compras é desenvolvido **dentro do
ERP** (`persianasparana/ERP`, React/tRPC/Drizzle/MySQL). O repo `compras` é **só documentação**.
O ERP **não roda em `aplicativos`** (diagnóstico de 26/06: sem MySQL/processo/porta). A porta 3050
foi pré-reservada, mas a forma do Compras está **em conflito aberto** — ver §6.

**Legenda dos health paths** (atenção — **não são padronizados**): Logística/RH/Financeiro usam
`/api/health`; **Agenda usa `/health`**; **Fábrica usa `/healthz`**.

> ⚠️ **Bind 0.0.0.0:** só a Fábrica escuta em `127.0.0.1`. Os demais escutam em todas as
> interfaces — acessíveis direto em `192.168.0.207:<porta>`, furando o Nginx. Mitigado pela VPN,
> mas o ideal é bindar tudo em `127.0.0.1` e deixar só o Nginx exposto.

---

## 3. Portas reservadas (lista única — substitui as listas espalhadas)

| Porta | Quem | Observação |
|---|---|---|
| 22 | sshd | admin |
| 80 / 443 | nginx | reverse proxy de tudo |
| 3000 | `persianas-api` (Logística) | |
| 3010 | `agenda-api` | |
| 3011 | `agenda-admin` (Next.js) | |
| 3020 | `fabrica-server` | |
| 3030 | `rh-api` | |
| 3040 | `financeiro-api` | |
| **3050** | (Compras) | ⚠️ pré-reservada, mas **condicional** — só vale se Compras virar app deste servidor (ver §6, conflito aberto). Hoje Compras vive no ERP. |
| 5432 | postgres | local apenas |
| ~~3001~~ | — | **NÃO reservada.** Doc antigo da Fábrica citava 3001; nada escuta nela. |
| 3060+ | livre | próxima porta sugerida p/ novo app |

---

## 4. Roteamento Nginx (vhost `persianas`, server_name `persianasparana.ddns.net 192.168.0.207 localhost`)

```
/                       → /var/www/persianas/gerenciador      (catch-all da Logística)
/api/  /uploads/        → http://localhost:3000               (Logística)
/app/                   → /var/www/persianas/app-tecnico      (PWA)
/fabrica/               → http://127.0.0.1:3020/              (Fábrica; /fabrica → /fabrica/pcp/)
/agenda/                → http://127.0.0.1:3011               (Agenda admin, Next.js)
/agenda/api/            → http://127.0.0.1:3010               (Agenda backend)
/agenda/_next/ _static  → alias .next (assets)
/rh/                    → http://127.0.0.1:3030/              (RH)
/financeiro/api/        → http://127.0.0.1:3040/api/          (Financeiro backend)
/financeiro/            → alias /var/www/financeiro/painel/   (painel estático)
/compras  /compras/*    → ❌ NÃO existe rota. Hoje cai no catch-all `/` (index da Logística → 200 falso).
```

> ⚠️ **`/compras` responde 200 hoje por engano** (catch-all da Logística serve o `index.html`).
> Não há app de Compras servido aqui. Ver §6.

---

## 5. Bancos PostgreSQL

```
persianas_db          dono: postgres (legado)   tabelas: persianas_user (16)
agenda_consultores    dono: persianas           tabelas: persianas (63)   ⚠️ sem user dedicado
fabrica_db            dono: fabrica_user         tabelas: fabrica_user (15)
rh_db                 dono: rh_user              tabelas: rh_user (15)
financeiro_db         dono: financeiro_user      tabelas: financeiro_user (12)
```
Roles com login: `persianas`, `persianas_user`, `fabrica_user`, `rh_user`, `financeiro_user`, `postgres`.

> ⚠️ A **Agenda** usa o role compartilhado **`persianas`** (não há `agenda_user`). Os demais apps
> têm role dedicado. Considerar criar `agenda_user` no futuro (migração de owner — cuidado).

---

## 6. ERP / Compras — estado real (revisado 2026-06-30, lendo o repo `compras`)

O repositório `compras` é **só documentação** (hub do domínio). O **código de Compras vive dentro do
ERP** (`persianasparana/ERP`, **React 19 + tRPC 11 + Drizzle + MySQL**), que **já é um sistema grande e
ativo** (~150 testes) com um **módulo de Compras profundo**: Ordem de Compra com parcelas, Solicitações,
Recebimento, **Tabela de Preços por fornecedor (Metro/Bobina)**, Fichas de Bobina, Remessas de
Industrialização, Não-Conformidades, Estoque (saldo/mínimo/ponto de pedido/movimentações/rolos/retalhos/
inventário), NF de Entrada → Estoque e Financeiro (contas a pagar), e **PCP com curva ABC**.

**Entregue no ERP** (commit `ccea117`, branch `claude/peaceful-lovelace-85pjad`): **integração Bling**
pré-configurada (OAuth2 API v3; sync produtos→componentes, saldos→estoque, contatos→fornecedores; logs;
tela `/compras/bling`). `tsc` 0 erros, **155 testes**, build ok. Ainda **não ativado em servidor**
(faltam `db:push`, criar app no Bling, conectar/sincronizar). Detalhes: `compras/docs/04` e `05`.

**Onde roda:** o ERP **NÃO está em `aplicativos`** (diagnóstico 26/06: sem MySQL/processo/porta). Logo
está em outro ambiente (dev) ou ainda não deployado em produção. **A confirmar.**

### 🔴 CONFLITO ABERTO — duas decisões opostas sobre Compras (precisa o cliente decidir)
Duas conversas decidiram caminhos **incompatíveis** para o Compras:

| Origem | Decisão | Implicação |
|---|---|---|
| Repo `compras` (00-CONTEXTO, jun/2026) | **Evoluir Compras DENTRO do ERP** (MySQL/tRPC); repo `compras` é doc; Bling como ponte | Compras = módulo do ERP; nada de app na 3050 |
| Esta conversa, [ADR-0007](adr/0007-federar-apps-existentes.md) | **Federar apps Node/PostgreSQL**; ERP "fora de escopo"; Compras como 6º app (3050) | Compras = app Node próprio; ERP de lado |

**Não podem coexistir.** Enquanto não for resolvido, a porta 3050 e o ADR-0007 estão **suspensos**.
Recomendação: **decidir explicitamente** (a) Compras no ERP (e então definir como o ERP conversa com os
5 apps Node), ou (b) Compras como app Node federado (e então o módulo do ERP/Bling é descartado/portado).

### ⚠️ Fonte da verdade Financeiro/PCP (relacionado)
O ERP tem módulos de **Financeiro** e **PCP**, que também existem como apps standalone
(Financeiro 3040, Fábrica/PCP 3020). Mesma decisão de "quem é o dono" continua em aberto (ver ADR-0003).

---

## 7. Integração entre sistemas (princípios)

- Comunicação **HTTP REST entre backends** — **nunca** cross-database query.
- Não há SSO: Logística (JWT+2FA), Agenda (JWT RS256), Fábrica (sessão+cookie), RH/Financeiro (JWT).
- Integrações com escopo a definir: Logística↔Fábrica/PCP, Logística↔Agenda (clientes),
  Compras(ERP)↔Financeiro/PCP (ver §6, cross-host quando o ERP subir).
- Fábrica expõe `POST /api/pcp/itens/lote` como ponto de extensão p/ importação de pedidos.

---

## 8. Como reauditar (comando read-only — rode no servidor)

Salvo em `diag-servidor.sh` (mesmo diretório). Não altera nada; imprime e salva em `/tmp`:

```bash
sudo bash docs/diag-servidor.sh 2>&1 | tee /tmp/estado-servidor-$(date +%F).txt
```

Confere: portas escutando, processos PM2, bancos/donos no Postgres, presença de MySQL,
roteamento Nginx, dirs em `/var/www` (+branch git), healthchecks e disco. Rerode após qualquer
mudança de infra e atualize a §2/§3 deste arquivo.

---

## 9. Histórico de correções de documentação

**2026-06-26** — primeira auditoria cruzada dos 6 repos contra o servidor real. Corrigido:
- Lista de portas da Logística (`INFRAESTRUTURA-COMPARTILHADA.md`) ia só até 3020 → faltavam RH(3030) e Financeiro(3040).
- Fábrica (`SERVIDOR-COMPARTILHADO.md`) citava porta **3001 reservada** → fantasma, removida.
- Agenda usa role `persianas` no banco (não `agenda_user`) — registrado.
- ERP/Compras confirmado **fora** deste servidor (sem MySQL) → marcado como planejado.
- Health paths divergentes (`/health`, `/healthz`, `/api/health`) — documentados por app.
- Binds em `0.0.0.0` (exceto Fábrica) — registrado como pendência de hardening.
