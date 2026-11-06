# Roteiro de deploy ÚNICO — Planejamento de produção P0 → P6 (06/11/2026)

> Tudo que está nas branches de produção dos repos e ainda não foi publicado, na ORDEM em que
> precisa entrar. Cada passo é idempotente (rodar de novo é seguro) e os scripts registram o que
> fizeram. Espec: `ESPEC-PLANEJAMENTO-PRODUCAO.md` · contrato entre módulos:
> `docs/PROTOCOLO-FEDERACAO.md` v1.1 (replicado nos 8 repos).

## 0. O que entra, por repo (branch de produção)

| Ordem | Repo (branch) | O que | Script | Migration | Depende de |
|---|---|---|---|---|---|
| 1 | **produtos** (`main`) | v14.88 lista de materiais + v14.89 custo-sync por `nucleo_sku` | `deploy/aplicar-v14-89-custo-sync-nucleo-sku.sh` (cumulativo — cobre v14.88 e tudo antes) | não (as anteriores que ele cobre, sim — idempotentes) | — |
| 2 | **compras** (`claude/unified-server-status-7633oz`) | P3 solicitações de compra + rotas de serviço + `nucleo_sku`; P6 estoque próprio + write-back Bling; lista de SCs para o módulo de Solicitações | `deploy/aplicar-solicitacoes-compra.sh` → `deploy/aplicar-estoque-proprio.sh` | **013** e **014** (pg_dump automático) | — |
| 3 | **fabrica** (`claude/unified-server-status-7633oz`) | P0 spec na liberação + Ficha com materiais; P2 carga; P1 necessidade; P3 requisitar/baixa | `deploy/aplicar-planejamento-p3.sh` (cobre P0/P1/P2 — migrations no boot) | no boot | 1 e 2 |
| 4 | **logistica** (`claude/nice-cerf-eimyzr`) | v5.39 **Credenciais** (login único) | `deploy/aplicar-v5.39-credenciais.sh` | cria `credenciais_db` | — |
| 5 | **logistica** (idem) | v5.40 **Solicitações e comunicados** + app do técnico v5.40.0 + hub | `deploy/aplicar-v5.40-solicitacoes.sh` | cria `solicitacoes_db` | 4 (e 2 para o espelho das SCs) |

Nada muda na **Agenda**, no **Financeiro**, no **Fiscal** nem no **RH** (só o PROTOCOLO nos docs).
⚠ **Preço:** nenhum passo muda preço de peça; o custo-sync (passo 1) só muda o custo de componente
que GANHAR de-para no Compras (cadastro do comprador, depois do deploy).

## 1. Antes de começar — me mande uma cópia do que está no servidor (opcional, recomendado)

Os scripts incluem o snippet do Nginx procurando a linha `include snippets/fiscal.conf;` (ou a do
Credenciais) no vhost. Se o vhost real estiver diferente do espelho `logistica/nginx/persianas-ssl.conf`,
o include não entra e a conferência final acusa. Para eu revisar ANTES, este bloco copia o vhost, a
lista de snippets, os processos do PM2 e **só os NOMES** das variáveis dos `.env` (nunca os valores)
para o repo da Logística:

```bash
cd /var/www/persianas && git fetch origin claude/nice-cerf-eimyzr && git checkout -q claude/nice-cerf-eimyzr && git pull --ff-only origin claude/nice-cerf-eimyzr \
&& mkdir -p docs/servidor-2026-11 \
&& sudo cp /etc/nginx/sites-available/persianas docs/servidor-2026-11/nginx-persianas.conf \
&& (ls -la /etc/nginx/snippets/ ; for f in /etc/nginx/snippets/*.conf; do echo "===== $f"; sudo cat "$f"; done) > docs/servidor-2026-11/nginx-snippets.txt \
&& pm2 list > docs/servidor-2026-11/pm2-list.txt \
&& (for e in /var/www/persianas/backend/.env /var/www/compras/backend/.env /var/www/fabrica/server/.env /var/www/produtos/backend/.env; do echo "===== $e"; [ -f "$e" ] && grep -oE '^[A-Z0-9_]+=' "$e" | sort; done) > docs/servidor-2026-11/env-chaves-sem-valores.txt \
&& (sudo -u postgres psql -Atc "SELECT datname FROM pg_database WHERE datname NOT IN ('template0','template1','postgres') ORDER BY 1"; sudo ss -tlnp | grep -E ':(80|443|30[0-9]0|3011|5432)\b') > docs/servidor-2026-11/bancos-e-portas.txt \
&& sudo chown -R $(id -un):$(id -un) docs/servidor-2026-11 \
&& git add docs/servidor-2026-11 && git -c user.name="servidor" -c user.email="ti@persianasparana.com.br" commit -q -m "docs(servidor): cópia do vhost, snippets, pm2 e nomes das envs (06/11/2026)" && git push origin HEAD:claude/nice-cerf-eimyzr && echo "OK — enviado"
```

## 2. Deploy — um bloco por servidor, na ordem

Tudo num bloco só. As chaves de serviço e senhas de banco são GERADAS aqui e gravadas nos `.env`
(se já existirem, as existentes são mantidas). A senha do admin das Credenciais é impressa no FIM —
anote-a. Os passos 4 e 5 pedem `sudo` (criam banco/role e mexem no Nginx com backup + `nginx -t` +
auto-revert).

```bash
set -e
# ---------- chaves e senhas (mantém as que já existem) ----------
getenv() { grep -s "^$2=" "$1" | cut -d= -f2-; }
gen() { openssl rand -hex 24; }
K_PCP="$(getenv /var/www/compras/backend/.env SERVICE_KEY_PCP)";           [ -n "$K_PCP" ] || K_PCP="$(gen)"
K_SOL_COMPRAS="$(getenv /var/www/compras/backend/.env SERVICE_KEY_SOLICITACOES)"; [ -n "$K_SOL_COMPRAS" ] || K_SOL_COMPRAS="$(gen)"
CRED_DB_PASS="$(getenv /var/www/persianas/credenciais/backend/.env DB_PASS)";     [ -n "$CRED_DB_PASS" ] || CRED_DB_PASS="$(gen)"
SOL_DB_PASS="$(getenv /var/www/persianas/solicitacoes/backend/.env DB_PASS)";     [ -n "$SOL_DB_PASS" ] || SOL_DB_PASS="$(gen)"
CRED_ADMIN_SENHA="Pp#$(openssl rand -hex 5)"
setenv() { local f="$1" k="$2" v="$3"; if grep -q "^$k=" "$f"; then sed -i "s|^$k=.*|$k=$v|" "$f"; else echo "$k=$v" >> "$f"; fi; }

# ---------- 1. Núcleo de Produtos v14.89 (cumulativo: cobre v14.88) ----------
cd /var/www/produtos && git pull --ff-only origin main && bash deploy/aplicar-v14-89-custo-sync-nucleo-sku.sh

# ---------- 2. Compras: migrations 013 (P3) e 014 (P6) + chaves de serviço ----------
cd /var/www/compras && git pull --ff-only origin claude/unified-server-status-7633oz \
&& bash deploy/aplicar-solicitacoes-compra.sh \
&& bash deploy/aplicar-estoque-proprio.sh \
&& setenv backend/.env SERVICE_KEY_PCP "$K_PCP" \
&& setenv backend/.env SERVICE_KEY_SOLICITACOES "$K_SOL_COMPRAS" \
&& pm2 restart compras-api && sleep 3 && curl -fsS http://127.0.0.1:3050/api/health >/dev/null && echo "Compras OK"

# ---------- 3. Fábrica/PCP: P0 + P2 + P1 + P3 (um script, migrations no boot) + envs ----------
cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
&& bash deploy/aplicar-planejamento-p3.sh \
&& setenv server/.env PRODUTOS_LISTA_MATERIAIS_ENABLED 1 \
&& setenv server/.env COMPRAS_API_BASE http://127.0.0.1:3050/api/v1 \
&& setenv server/.env COMPRAS_SERVICE_KEY "$K_PCP" \
&& pm2 restart fabrica-server && sleep 3 && curl -fsS http://127.0.0.1:3020/healthz >/dev/null && echo "Fábrica OK"

# ---------- 4. Logística v5.39 — Credenciais (login único) ----------
cd /var/www/persianas && git fetch origin claude/nice-cerf-eimyzr \
&& sudo CRED_DB_PASS="$CRED_DB_PASS" CRED_ADMIN_EMAIL='ti@persianasparana.com.br' CRED_ADMIN_SENHA="$CRED_ADMIN_SENHA" APP_USER="$(id -un)" \
   bash <(git show origin/claude/nice-cerf-eimyzr:deploy/aplicar-v5.39-credenciais.sh)

# ---------- 5. Logística v5.40 — Solicitações e comunicados + app v5.40.0 ----------
cd /var/www/persianas \
&& sudo SOL_DB_PASS="$SOL_DB_PASS" COMPRAS_SERVICE_KEY="$K_SOL_COMPRAS" APP_USER="$(id -un)" \
   bash <(git show origin/claude/nice-cerf-eimyzr:deploy/aplicar-v5.40-solicitacoes.sh)

echo "=================================================================="
echo " TUDO PUBLICADO."
echo " Admin das Credenciais: ti@persianasparana.com.br  senha: $CRED_ADMIN_SENHA  (troque no 1º acesso)"
echo " (se a pessoa já existia na importação da Logística, vale a senha que ela já usava)"
echo "=================================================================="
```

Se um passo abortar, o script diz o motivo e o que fazer; corrigir e **rodar o bloco de novo** é o
caminho (tudo idempotente; os scripts cumulativos pulam o que já entrou).

## 3. Depois do deploy — cadastros (sem código)

1. **Compras → Solicitações** (tela do comprador): "De-para com o Núcleo" nos produtos que o PCP vai
   requisitar/baixar (componente = sku do Núcleo; tecido por cor `t1:BEGE`). Sem de-para a linha da
   Necessidade aparece "sem de-para" e a baixa pula o sku.
2. **Compras → Estoque**: escolher, categoria a categoria, quais itens passam a ter o Compras como
   fonte da verdade (o saldo do Bling vira a abertura). Write-back ao Bling fica DESLIGADO até alguém
   ligar na própria tela (escolher o depósito).
3. **Fábrica → Setores**: capacidade por dia de cada setor (Planejamento de carga); roteiros nas
   estruturas; Estruturas por SKU `romanatetomot`, `fixa_*` se ainda faltarem.
4. **Credenciais** (`/credenciais/`, admin acima): conferir as pessoas importadas da Logística (senha
   de hoje continua valendo); dar papel `solicitacoes = gerencia` a quem publica comunicado para
   todos e `solicitacoes = admin` a quem cadastra departamentos.
5. **Solicitações** (`/solicitacoes/` → Cadastros, com o admin): responsável e membros de cada um
   dos 10 departamentos (e-mails do login único), tipos, prazos (2 h úteis / 3 dias), SMTP.
6. **App do técnico**: os técnicos recebem a v5.40.0 sozinhos ao abrir o app (regra v5.34.1).

## 4. Conferência rápida (depois de tudo)

```bash
for u in 3070/api/health 3050/api/health 3020/healthz 3000/api/health 3090/api/health 3080/api/health; do printf "%-22s " "$u"; curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:$u"; done
for p in /credenciais/api/health /solicitacoes/api/health /compras/api/health /fabrica/healthz; do printf "%-32s " "$p"; curl -ks -o /dev/null -w '%{http_code}\n' "https://localhost$p"; done
cd /var/www/persianas && node deploy/checar-versao-app-tecnico.js app-tecnico
pm2 list
```

Esperado: todos 200; o checador do app diz `OK — app do técnico v5.40.0`.

## 5. Como voltar atrás (se precisar)

- Núcleo/Compras/Fábrica: `git checkout <commit anterior>` + `pm2 restart` — as migrations são
  aditivas (colunas/tabelas novas) e podem ficar no banco; o pg_dump de cada script está em `/tmp`
  (Compras) / `deploy/logs` (Núcleo).
- Credenciais/Solicitações: `pm2 delete credenciais-api solicitacoes-api` e remover as duas linhas
  `include snippets/credenciais-subpath.conf;` / `include snippets/solicitacoes-subpath.conf;` do vhost
  (`nginx -t && systemctl reload nginx`). Na Logística, apagar `CREDENCIAIS_API_BASE` do
  `backend/.env` + `pm2 restart persianas-api` devolve o login 100 % local (os tokens locais nunca
  deixaram de valer). O app do técnico v5.40.0 continua funcionando sem o módulo (botão Solicitar
  mostra "módulo indisponível" e guarda offline).
