# Servidor compartilhado — regras para o fabrica

O `fabrica` é implantado no servidor **`aplicativos` (192.168.0.207, Ubuntu 24.04)**, que roda
**os 8 módulos da federação** em produção (Logística/hub, Comercial/Agenda, Fábrica, RH,
Financeiro, Compras, Fiscal, Núcleo de Produtos) mais os dois módulos que moram no repo da
Logística (Solicitações e Credenciais). Este resumo lista o que o fabrica deve respeitar.

> Fonte canônica única da infra (idêntica nos repos): **`docs/MAPA-DO-SERVIDOR.md`**; mapa e
> contrato entre módulos: **`docs/PROTOCOLO-FEDERACAO.md`** §1. Detalhes adicionais:
> `logistica/docs/INFRAESTRUTURA-COMPARTILHADA.md`, `logistica/docs/HUB-E-ROTEAMENTO.md`.

## Reservado — NÃO usar / NÃO tocar

| Tipo | Reservado |
|---|---|
| Portas | 22, 80, 443, 5432 · 3000 (Logística) · 3010/3011 (Agenda api/admin) · 3030 (RH) · 3040 (Financeiro) · 3050 (Compras) · 3060 (Fiscal) · 3070 (Núcleo de Produtos) · 3080 (Solicitações) · 3090 (Credenciais) |
| Processos PM2 | `persianas-api`, `agenda-api`, `agenda-admin`, `rh-api`, `financeiro-api`, `compras-api`, `fiscal-api`, `produtos-api`, `solicitacoes-api`, `credenciais-api` |
| Bancos | `persianas_db`, `agenda_consultores`, `rh_db`, `financeiro_db`, `compras_db`, `fiscal_db`, `produtos_db`, `solicitacoes_db`, `credenciais_db` (e seus roles) |
| Filesystem | `/var/www/persianas` (inclui `credenciais/` e `solicitacoes/`), `/var/www/agenda`, `/var/www/rh`, `/var/www/financeiro`, `/var/www/compras`, `/var/www/fiscal`, `/var/www/produtos` |
| Nginx | o vhost único `/etc/nginx/sites-available/persianas` e qualquer `location`/snippet já existente (`/`, `/api/`, `/uploads/`, `/app/`, `/agenda/`, `/rh/`, `/financeiro/`, `/compras/`, `/fiscal/`, `/produtos/`, `/solicitacoes/`, `/credenciais/`) |

> A porta **3001 NÃO é reservada** (correção de 26/06/2026 — nada escuta nela). App novo: próxima
> porta livre a partir de 3100, e entra no PROTOCOLO.

**Nunca** rodar comandos globais sem alinhar com o cliente: `pm2 kill`, `pm2 delete all`,
`pm2 startup`, `systemctl restart nginx` sem `nginx -t`, editar `nginx.conf`/`postgresql.conf`/
firewall, `apt install`. **Nunca sobrescrever o vhost** (incidente 30/06/2026): acrescentar o
`include`, `nginx -t`, `reload`, auto-revert.

## O que o fabrica usa (próprio e isolado)

| Recurso | fabrica |
|---|---|
| Porta | **3020** (127.0.0.1) · health `GET /healthz` |
| Processo PM2 | **fabrica-server** |
| Banco / usuário | **fabrica_db** / **fabrica_user** |
| Diretório | **/var/www/fabrica** (checkout git de `claude/unified-server-status-7633oz`) |
| Rota | **/fabrica/** (subpath, `include snippets/fabrica-subpath.conf` no vhost) |
| Uploads | `/var/www/fabrica/uploads/ecommerce` (fotos do e-commerce, fora do git) |

Chaves de integração no `server/.env` (nunca no git): `INTEGRACAO_API_KEY` (= `FABRICA_API_KEY`
da Logística), `COMERCIAL_SERVICE_KEY`, `PRODUTOS_SERVICE_KEY`, `COMPRAS_SERVICE_KEY`, e a
`SESSION_SECRET` (obrigatória).

## Armadilhas conhecidas (já consideradas)

- **`/api/` é da Logística.** Por isso o fabrica fica sob `/fabrica/` — nunca expõe `/api/` na raiz.
- **Fallback `/*` guloso** da Logística: os `location` do fabrica entram **antes** dele (via `include`).
- **Nginx 1.24:** `listen 443 ssl http2;` (não `http2 on;`). Como o fabrica faz proxy de tudo para
  o Node, o bug de mime de estáticos (`types {}`) não se aplica.
- **PM2 e cache de módulos:** após mudar código, se `pm2 restart` não pegar, `pm2 delete && pm2 start`.
- **Nunca `git checkout` de outra branch no servidor** (incidente 16/07/2026 — derrubou login/abas).
- **Dono das tabelas:** as migrations rodam no boot como `fabrica_user`; rodar `db.js` como
  `postgres` cria tabelas com dono errado (bug nº 2 da federação).
- Tudo em **português**; scripts **idempotentes**; `sudo nginx -t` antes de `reload`.

## Diagnóstico read-only do servidor

`sudo bash deploy/diag-servidor.sh 2>&1 | tee /tmp/estado-servidor-$(date +%F).txt` — PM2,
portas, bancos/donos, Nginx, `/var/www` (+ branch git), healthchecks, disco. Não altera nada.

## Acesso

OpenVPN hoje; **Tailscale** (split-tunnel, HTTPS válido por MagicDNS) planejado — beneficiará o
fabrica também quando entrar.
