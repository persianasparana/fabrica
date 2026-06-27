# 🗺️ MAPA DO SERVIDOR — Persianas Paraná (documento canônico)

> **FONTE DA VERDADE da infraestrutura compartilhada.** Este arquivo é **idêntico** em todos os
> repositórios (`logistica`, `agenda-consultores`, `fabrica`, `rh`, `financeiro`, `compras`).
> Ao mudar a infra, atualize aqui **e replique** nos outros repos. Não duplique a tabela de
> portas em outros docs — aponte para este arquivo.
>
> **Última verificação contra o servidor real:** 2026-06-26 (via `diag-servidor.sh`, ver §8).

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
| **Compras** 🔜 | 3050 | `127.0.0.1` | `compras-api` | `compras_db` | `compras_user` / `compras_user` | `/compras/` | `/var/www/compras` | `/api/health` |

🔜 **Compras: planejado, ainda não deployado.** 6º app da federação ERP (Node/Express + PostgreSQL, mesma
stack dos outros). Infra reservada aqui; implementação na [ADR-0007](adr/0007-federar-apps-existentes.md)
e [`PLANO-INTEGRACAO-ERP.md`](PLANO-INTEGRACAO-ERP.md). Bindar em `127.0.0.1` (só Nginx exposto).

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
| **3050** | `compras-api` (Compras) | 🔜 reservada; planejada, ainda não deployada |
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

## 6. ERP / Compras — **PLANEJADO, não deployado neste servidor** (2026-06-26)

O repositório `compras` é **documentação**; o código vive no repo `persianasparana/ERP`
(stack **React 19 + tRPC 11 + Drizzle + MySQL `erp_persianas`** — diferente dos 5 apps acima).

**Diagnóstico de 2026-06-26 confirmou que o ERP NÃO roda em `aplicativos`:** sem MySQL instalado,
sem processo, sem porta escutando, sem `/var/www/erp`. Quando for deployado, reservar porta (3050+),
instalar MySQL ao lado do PostgreSQL e adicionar `location /compras/` no Nginx.

### ⚠️ Decisão de integração EM ABERTO (fonte da verdade)
O ERP tem módulos de **Financeiro** (`contas_pagar`) e **PCP**, mas já existem como apps
standalone: **Financeiro (3040, PostgreSQL)** e **Fábrica/PCP (3020, PostgreSQL)**. É preciso
decidir quem é a fonte da verdade antes de integrar — senão haverá dado duplicado:

- [ ] Apps standalone (3040/3020) são a fonte; ERP consome via HTTP?
- [ ] ERP absorve Financeiro/PCP; standalone viram transitórios?
- [ ] Convivência com sincronização bidirecional definida?

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
