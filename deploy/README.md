# deploy/ — como a Fábrica vai para o ar

Produção = checkout git de **`claude/unified-server-status-7633oz`** em `/var/www/fabrica`,
processo PM2 `fabrica-server` (porta 3020), banco `fabrica_db`. **Nunca** dê `git checkout` de
outra branch no servidor (incidente 16/07/2026). Primeira instalação: `docs/DEPLOYMENT.md`.

## O que está no ar (fonte da verdade: `REGISTRO-DEPLOYS.md`)

| Data | Commit | O que subiu |
|---|---|---|
| 10/11/2026 | `44bde24` | **P3 do planejamento de produção** (cobre P0/P1/P2) — `aplicar-planejamento-p3.sh` |
| 03/08/2026 | `a9009df` | Plano de Corte via Núcleo — `aplicar-plano-corte-nucleo.sh` |
| 21/07/2026 | `06f5dbe` | F3 BOM+custo na OC + seleção por SKU |

Pendente: `e981f14 fix(auth)` (só na branch de federação), a revisão de 16/11/2026
(`SESSION_SECRET` obrigatória — **confira que o `server/.env` tem a chave antes de reiniciar**) e a
**lista de materiais como a venda** (25/11/2026 — `aplicar-lista-como-a-venda.sh`; exige o Núcleo
v14.97 e o Comercial v2.140.1 ANTES — as duas últimas entraram em 26/11/2026 17:48) e o **plano de corte
do tecido na Ficha + ambiente da peça** (26/11/2026 — `aplicar-plano-de-corte-do-tecido.sh`; exige o
Núcleo v14.98 ANTES) — em produção desde 26/11/2026 19:06 — e **o cômodo é o Ambiente escrito
na peça + plano de corte rolo a rolo** (27/11/2026 — `aplicar-comodo-da-peca.sh`; exige o Núcleo v14.100 ANTES) —
em produção desde 27/11/2026 12:49. **Pendente:** a **produção por etapas** (27/11/2026 —
`aplicar-producao-por-etapas.sh`; exige o Núcleo v14.101 ANTES).

## Arquivos

| Arquivo | Para quê |
|---|---|
| `install.sh` | Primeira instalação no servidor (pergunta admin/senhas, cria role+banco, `npm ci`, `install-app`, PM2). Idempotente. Imprime o único passo manual (include no Nginx). |
| `ecosystem.config.js` | Definição do processo PM2 (`cwd` = `server/`, `NODE_ENV=production`, envs do `server/.env`). |
| `aplicar-producao-por-etapas.sh` | Deploy da produção por etapas (27/11/2026 — corte do tecido, corte dos perfis e montagem em documentos separados, andamento por parte, compra em rolos, partes na integração): guardas (33), `node --check`, os cinco testes sem banco, **sonda** do Núcleo v14.101 (`conferir-lista-materiais.js --sonda-corte-sheer`; aborta com a instrução, `PULAR_SONDAS=1` sobe assim mesmo), cópia das duas tabelas que ganham coluna, restart, health, confere as colunas criadas no boot, a página e a rota no ar (401 sem sessão) e as chaves novas da integração, resumo do maior pedido aberto, registra. |
| `aplicar-comodo-da-peca.sh` | Deploy do cômodo da peça + plano rolo a rolo (27/11/2026): guardas, `node --check`, os quatro testes sem banco, **sonda** do Núcleo v14.100 (`conferir-lista-materiais.js --sonda-comodo`; aborta com a instrução; `PULAR_SONDAS=1` sobe assim mesmo), `pm2 restart` (as duas colunas novas de `pcp_itens` nascem no boot — o script confere), `completar-ambiente.js --detalhe` (relê no Comercial as peças já na fila: o ambiente vira o cômodo escrito na peça onde estava vazio ou era o nome do bloco), conferência e registro. |
| `aplicar-plano-de-corte-do-tecido.sh` | Deploy do plano de corte do tecido + ambiente da peça (26/11/2026): guardas, `node --check`, os quatro testes sem banco, **sonda** do Núcleo v14.98 (`conferir-lista-materiais.js --sonda-plano`; aborta com a instrução; `PULAR_SONDAS=1` sobe assim mesmo), `pm2 restart`, health, `completar-ambiente.js` (preenche o ambiente das peças já na fila), conferência e registro. |
| `aplicar-lista-como-a-venda.sh` | Deploy da lista de materiais como a venda (25/11/2026): guardas, `node --check`, os dois testes sem banco, **sonda** do Núcleo v14.97 e do Comercial v2.140.1 (aborta com a instrução; `PULAR_SONDAS=1` sobe assim mesmo), `pm2 restart`, health, `bin/completar-spec-nucleo.js` (completa as peças já na fila), conferência e registro. Sem migration. |
| `lib-estado.sh` | Preâmbulo dos scripts novos (cópia da biblioteca de Agenda/Núcleo/Compras/Financeiro): `estado_antes` diz se o deploy já foi aplicado, grava a saída em `deploy/logs/<script>-<data>.log` (fora do git) e, se o script abortar, anexa uma linha **FALHOU/INTERROMPIDO** ao registro (commit + push); `registrar_deploy` grava a linha de sucesso. |
| `checar-guardas.py` | `python3 deploy/checar-guardas.py . deploy/<script>` — confere cada `grep -q`/`[ -f ]` do script contra o checkout (guarda com string errada bloqueia o deploy à toa). |
| `aplicar-planejamento-p3.sh` | Deploy do P3 (cobre P0–P2): confere o commit (grep nos arquivos), `node --check`, roda o teste do sequenciador, avisa se `COMPRAS_SERVICE_KEY` falta ou o Compras não tem a migration 013, `pm2 restart`, health, conferência no banco, linha no REGISTRO + commit + push. |
| `aplicar-planejamento-p0.sh` / `p1.sh` / `p2.sh` | Mesma mecânica para cada fase (já cobertas pelo p3; ficam para rollback/histórico). |
| `aplicar-plano-corte-nucleo.sh` | Deploy do plano de corte via Núcleo (03/08/2026). |
| `REGISTRO-DEPLOYS.md` | **Append-only**: cada deploy anexa `- AAAA-MM-DD HH:MM \| commit <hash> \| <processos> \| <o que subiu> \| <resultado>` e dá push no próprio servidor. Qualquer conversa confere aqui antes de assumir estado. |
| `diag-servidor.sh` | Raio-X **read-only** do servidor compartilhado (PM2, portas, bancos/donos, Nginx, `/var/www`, health, disco). `sudo bash deploy/diag-servidor.sh 2>&1 \| tee /tmp/estado-servidor-$(date +%F).txt`. Morava em `docs/` até 16/11/2026. |

## Como publicar uma entrega

1. Confira a **ordem com os vizinhos** (regra "provedor antes do consumidor" do
   `docs/PROTOCOLO-FEDERACAO.md`): o Núcleo e o Compras sobem ANTES da Fábrica quando ela
   depende de rota/versão deles; a Logística/Agenda depois. Para o planejamento P0–P6 o bloco
   único está em `docs/ROTEIRO-DEPLOY-PLANEJAMENTO.md`.
2. No servidor:
   ```bash
   cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
     && bash deploy/aplicar-<entrega>.sh
   ```
   O script aborta com a instrução certa se o commit não está no checkout, se uma env falta ou
   se o vizinho não tem a versão esperada; rodar de novo é seguro.
3. Se o script não cobrir (mudança só de frontend/docs): `git pull --ff-only …`,
   `pm2 restart fabrica-server` (se não pegar: `pm2 delete fabrica-server && pm2 start
   deploy/ecosystem.config.js --only fabrica-server && pm2 save`), `curl -s
   http://127.0.0.1:3020/healthz`, e anexe a linha ao `REGISTRO-DEPLOYS.md` + push.
4. **Migrations** rodam no boot (`server/src/db.js migrate()`, idempotentes, sem tabela de
   versão) — não há passo separado; faça `pg_dump` antes se a entrega cria/alter tabela:
   `pg_dump -U fabrica_user -h 127.0.0.1 fabrica_db | gzip > /tmp/fabrica_$(date +%F).sql.gz`.
5. Depois do deploy, **cadastros** que o código não faz sozinho: capacidade por setor, roteiros
   nas estruturas, estruturas por SKU novo (`romanatetomot`, `fixa_*`), de-para no Compras.

## Como escrever o script da próxima entrega

Copie `aplicar-lista-como-a-venda.sh` (o padrão desde 25/11/2026: `source deploy/lib-estado.sh`,
`estado_antes`, guardas, testes, **sonda do provedor**, restart, health, conferência,
`registrar_deploy`) e valide as guardas com `checar-guardas.py`. Ensaiar inteiro num `/var/www`
simulado antes de publicar (cenários: provedor anterior → aborta; `PULAR_SONDAS=1`; caminho feliz;
checkout sem o commit). O modelo antigo, sem a biblioteca, é o `aplicar-planejamento-p3.sh`: `set -euo pipefail`, `cd /var/www/fabrica`, guardas com
`grep -q` nos arquivos que a entrega trouxe (abortam com "rode git pull antes"), `node --check`
nos JS tocados, `node server/test/carga.test.mjs`, avisos de env/vizinho, `pm2 restart`, `sleep`,
`curl -sf …/healthz`, conferência no banco, linha no REGISTRO com `git rev-parse --short HEAD`,
commit e push na branch de produção. Tudo em PT-BR, idempotente, sem placeholder para editar.
