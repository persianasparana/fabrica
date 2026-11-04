# Servidor compartilhado — regras para o fabrica

O `fabrica` é implantado no servidor **`aplicativos` (192.168.0.207, Ubuntu 24.04)**,
que **já roda dois sistemas em produção**: **Logística/Persianas** e
**Agenda de Consultores**. Este resumo lista o que o fabrica deve respeitar.

> Fontes canônicas (mantidas nos outros repositórios):
> `logistica/docs/INFRAESTRUTURA-COMPARTILHADA.md`,
> `logistica/docs/MAPA-SERVIDOR-PARA-NOVOS-APPS.md`,
> `logistica/docs/ACESSO-TAILSCALE.md`.

## Reservado — NÃO usar / NÃO tocar

| Tipo | Reservado |
|---|---|
| Portas | 22, 80, 443, 3000, 3001, 3010, 3011, 5432 |
| Processos PM2 | `persianas-api`, `agenda-api`, `agenda-admin` |
| Bancos | `persianas_db`, `agenda_consultores` (e usuários `persianas_user`, `persianas`) |
| Filesystem | `/var/www/persianas`, `/var/www/agenda` |
| Nginx | qualquer `server`/`location` já existente (incl. `/`, `/api/`, `/uploads/`, `/app/`, `/agenda/`) |

**Nunca** rodar comandos globais sem alinhar: `pm2 kill`, `pm2 delete all`,
`pm2 startup`, `systemctl restart nginx` sem testar, editar `nginx.conf`/
`postgresql.conf`/firewall.

## O que o fabrica usa (próprio e isolado)

| Recurso | fabrica |
|---|---|
| Porta | **3020** (127.0.0.1) |
| Processo PM2 | **fabrica-server** |
| Banco / usuário | **fabrica_db** / **fabrica_user** |
| Diretório | **/var/www/fabrica** |
| Rota | **/fabrica/** (subpath, via `include` no vhost) ou hostname próprio |

## Armadilhas conhecidas (já consideradas)

- **`/api/` é da Logística.** Por isso o fabrica fica sob `/fabrica/` (ou hostname
  próprio) — nunca expõe `/api/` na raiz do host compartilhado.
- **Fallback `/*` guloso** da Logística: os `location` do fabrica entram **antes**
  dele (via `include`).
- **Nginx 1.24:** usar `listen 443 ssl http2;` (não `http2 on;`). Como o fabrica
  faz proxy de tudo para o Node, o bug de mime de estáticos (`types {}`) não se aplica.
- **PM2 e cache de módulos:** após mudar código, `pm2 delete && pm2 start` (não `restart`).
- Tudo em **português**; scripts **idempotentes**; `sudo nginx -t` antes de `reload`.

## Acesso

OpenVPN hoje; **Tailscale** (split-tunnel, HTTPS válido por MagicDNS) planejado —
beneficiará o fabrica também quando entrar.
