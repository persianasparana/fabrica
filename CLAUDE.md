# CLAUDE.md — Fábrica / PCP (Persianas Paraná)

> ## ⚠️ Antes de mexer em INTEGRAÇÃO — leia `docs/PROTOCOLO-FEDERACAO.md` (24/09/2026)
> Este módulo é um dos 8 da federação (Logística · Comercial/Agenda · Fábrica · RH · Financeiro ·
> Compras · Fiscal · Núcleo de Produtos). O protocolo traz o mapa de portas/branches/deploy, a
> **matriz de quem chama quem** (rotas, envs dos dois lados, comportamento sem o vizinho), as regras
> e o **checklist obrigatório** para mudar rota, campo, status, chave, env, porta, Nginx/hub ou ordem
> de deploy — e deve ser **atualizado nos 8 repositórios** no mesmo conjunto de commits.
> **Branch de produção deste repo:** `claude/unified-server-status-7633oz`; `main` está em 09/06/2026 — NÃO é referência.


> **LEIA PRIMEIRO.** Contexto para trabalhar neste repositório sem quebrar nada nem
> divergir das outras conversas da federação ERP.

## O que é
Sistema da **Fábrica**: PCP (fila de produção, bipagem por setor, gavetas), Qualidade,
Expedição, **etiquetas** (Argox iX4-250), **Ordem de Corte** (motor de cálculo + plano
de barras) e **Ficha de Produção**. É o consumidor de produção do **Pedido do Comercial**
(Agenda) — Fase 3 da federação. Cliente real em produção.

## ⚠️ Branch e produção (incidente 16/07/2026 — LEIA)
- Branch de trabalho de TODAS as conversas: **`claude/unified-server-status-7633oz`**.
- **Produção (`/var/www/fabrica`) é um checkout git DESSA branch.** Nunca dar checkout
  de outra branch no servidor: fazer isso derrubou login/abas (versão antiga no ar).
  Deploy = `git pull --ff-only origin claude/unified-server-status-7633oz && pm2 restart fabrica-server`.
- Health check: `curl -s http://127.0.0.1:3020/healthz` (não é `/api/health`).
- Coordenação entre conversas: docs no repo `compras` (`PLANO-INTEGRACAO-ERP.md`,
  `MAPA-DO-SERVIDOR.md`, `HANDOFF-CONTINUIDADE.md`, `DIRETRIZES-REVISAO-ERP.md`).

## Estado atual (27/11/2026)
- **Em produção** (`/var/www/fabrica`, branch `claude/unified-server-status-7633oz`): tudo até o
  **P3 do planejamento de produção**, publicado em **10/11/2026** pelo `deploy/aplicar-planejamento-p3.sh`
  (cobre P0–P2) — commit `44bde24` (linha em `deploy/REGISTRO-DEPLOYS.md`). As seções "Estado"
  abaixo de 20/07, 07/08 e 06/11 (P0/P1/P2/P3) estão TODAS no ar.
- **Pendente de deploy, só na branch de federação** (`claude/persianas-parana-federation-64icd0`):
  `e981f14 fix(auth): login recusava credencial certa — caixa do usuário e bloqueio por IP`
  (auth.js, server.js, db.js, bin/reset-senha.js). Precisa ser levado à `unified` e publicado.
- **Em produção desde 26/11/2026 17:48: LISTA DE MATERIAIS COMO A VENDA COTOU** — `deploy/aplicar-lista-como-a-venda.sh`,
  commit `48f66c6`, health OK (linha em `deploy/REGISTRO-DEPLOYS.md`; seção "Estado (25/11/2026)" abaixo). Os
  provedores entraram antes, no mesmo dia e nesta ordem: **Núcleo v14.97** às 17:45 → **Comercial v2.140.1** às 17:48.
- **PENDENTE DE DEPLOY (27/11/2026): O CÔMODO É O AMBIENTE ESCRITO NA PEÇA + PLANO DE CORTE ROLO A ROLO** —
  `deploy/aplicar-comodo-da-peca.sh` (seção "Estado (27/11/2026)" abaixo). Par do **Núcleo v14.100**, que vai
  ANTES (o script sonda e aborta dizendo o que aplicar). Colunas novas em `pcp_itens` criadas no boot
  (`grupo_pedido`, `ambiente_origem`); não muda preço.
- **Em produção desde 26/11/2026 19:06: PLANO DE CORTE DO TECIDO NA FICHA + AMBIENTE DA PEÇA** —
  `deploy/aplicar-plano-de-corte-do-tecido.sh`, commit `99b21cf`, health OK (linha em `deploy/REGISTRO-DEPLOYS.md`;
  seção "Estado (26/11/2026)" abaixo). O provedor entrou antes — **Núcleo v14.98** às 19:05 — e o Comercial
  v2.141.0 (Relatório de custo pelo plano do pedido) às 19:08. ⚠ Pedido JÁ LIBERADO não precisa ser refeito: a
  lista de materiais e o plano de corte da Ficha são calculados na hora, a cada abertura (o deploy rodou o
  `completar-ambiente` nas peças que já estavam na fila); o que já foi requisitado ao Compras ou cortado não muda.
- **Revisão da federação de 16/11/2026** (commit `5f82e5b`) — **em produção desde 26/11/2026 17:48**: estava
  na branch sem deploy e entrou no mesmo `git pull` da lista de materiais como a venda (o serviço subiu com
  health OK — o `server/.env` de produção tem a `SESSION_SECRET`). `SESSION_SECRET` passou a ser
  obrigatória no boot; CI ajustado ao 410 do `POST /itens`; `npm test`/`npm run check`; vendor
  pdf.js/SheetJS removidos; `docs/diag-servidor.sh` → `deploy/diag-servidor.sh`; docs padrão novos.
- **Documentação para humanos** (leia nesta ordem): `docs/VISAO-GERAL.md` → `README.md` →
  `docs/README.md` (índice) → `docs/API.md` (todas as rotas) → `CHANGELOG.md` → `deploy/README.md`.

## ⚠️ Servidor compartilhado
Mesmo servidor dos outros 6 apps. **Isolado**: porta **3020**, banco **`fabrica_db`**
(role **`fabrica_user`**), PM2 **`fabrica-server`**, dir **`/var/www/fabrica`**.
NUNCA usar portas/bancos/processos dos outros (3000/3010/3011/3030/3040/3050/3060/**3070 = Produtos**).

## Stack e estrutura (diferente dos irmãos Express!)
Node + Express em **ESM** (`import`, não `require`) · PostgreSQL via `pg` (sem ORM) ·
**sessão por cookie + CSRF** (header `X-CSRF-Token` nas escritas — NÃO é JWT) ·
frontend HTML/CSS/JS vanilla em `pcp/public/` servido estático pelo próprio server.
- `server/src/server.js` — entrada (porta 3020). Rotas em `server/src/routes/`
  (`pcp.js`, `comercial.js`, `ordem-corte.js`, `estrutura-regras.js`, `etiquetas.js`,
  `qualidade.js`, `expedicao.js`, `admin.js`, `auth.js`…).
- `server/src/db.js` — **migrations idempotentes rodam no boot** (CREATE TABLE IF NOT
  EXISTS + ALTERs). Não há pasta de migrations.
- `server/src/corte.js` — motor de fórmulas dos cortes (FUNCS: SE/OU/ARRED… +
  GARRASPORLARGURA/VARETASROMANA/VARETASROMANATETO). Cortes referenciam-se por `key`.
- `server/src/ordem-corte.js` — calcula a OC (escopo por peça, conversão cm↔m pela
  `unidade` do produto, componentes/BOM por peça).
- `server/src/comercial-client.js` — cliente REST do Comercial (X-Service-Key) +
  **outbox `pcp_ciclo_pendencias`** (retry do avanço de ciclo com o Comercial fora).
- `server/src/compras-client.js` — cliente REST do Compras (X-Service-Key) + **outbox
  `pcp_compras_pendencias`** (requisição de compra e saída de produção — P3, 06/11/2026).
- `server/bin/` — `install.js` (schema+seed+admin), `migrate.js` (só o schema), `reset-senha.js`
  (recuperar senha pelo servidor), `limpar-fila.js` (zera a fila, preserva cadastros), `completar-spec-nucleo.js` e
  `completar-ambiente.js` (completam as peças JÁ NA FILA relendo o pedido no Comercial — o segundo relê o AMBIENTE:
  o cômodo escrito na peça e o grupo do pedido, 27/11), `conferir-lista-materiais.js`
  (sondas dos provedores + resumo da lista de um pedido) e utilitários
  da Estrutura: `preencher-barras.js`, `reparar-keys.js`, `preencher-medidas.js`,
  `preencher-componentes.js`, `seed-tipos.js`, `validar-cortes.js` (motor de corte × planilhas,
  sem banco), `atualizar-horizontais.js`.
- `server/test/carga.test.mjs`, `nucleo-spec.test.mjs`, `lista-materiais.test.mjs` e `ambiente.test.mjs` — as
  suítes sem banco (`npm test`);
  `npm run check` = `node --check` nos módulos principais.
- `pcp/public/assets/js/` — `app.js` (fila/editar pedido/estrutura), `comercial.js`
  (análise/liberação), `ordem-corte-plano.js` (FFD/desenho/CSV), `ficha-producao.js`,
  `regras-estrutura.js`, `etiquetas.js`.

## Unidades (fonte de bug clássica)
`pcp_pecas.largura/altura` e `medidas` (JSONB, ex. `comando`) são **sempre em cm** (UI
digita metros ×100). A OC converte para a unidade do PRODUTO (`unidade='m'` → fator
0.01); funções de componentes trabalham em cm (conversão de volta interna).

## Fluxo Comercial → PCP → produção (o coração do app)
1. Aba **Comercial** lista pedidos `EM_ANALISE_PCP` (REST na Agenda, dona do Pedido).
2. **Ver** mostra a prévia da **Estrutura do Produto por item** (`GET
   /comercial/pedidos/:id/estrutura-previa`): override manual > **regras condicionais**
   (F3, com variável `categoria` via `pcp_colecao_categorias`) > SKU único > nome exato >
   **"pelo Núcleo"** (linha SEM estrutura local — cortina, cortina fixa, celular, vertical,
   toldo: `origem:'nucleo'`, `sem_estrutura_local:true`; não é pendência) > ⚠ pendente.
3. **Liberar produção** (idempotente por PED-): PATCH status na Agenda + importa itens/
   peças pra fila **com a especificação da venda em `pcp_itens.spec_nucleo`** (P0 do
   planejamento, 06/11/2026: produto/tecido/cor + todas as seleções `nucleo*`) + grava
   `pcp_pedido_info` (vendedor/modalidade/obs/prazo — alimenta a Ficha offline do Comercial).
   **A entrada de peças é SÓ esta** — o "Novo Pedido" manual e a importação Excel/CSV/PDF/
   JSON saíram do PCP (decisão do cliente 05/11; `POST /pcp/itens[/lote]` responde 410).
4. **Ficha de Produção** (`ficha-producao.html?pedido=PED-…`): specs + infos do pedido +
   **cortes calculados por setor** (seletor de setor) + **lista de materiais por item e o
   resumo do pedido** (tecido por coleção × cor × rolo com bobinas, perfis/tubos em barras,
   componentes) vindos do Núcleo (`GET /api/pcp/pedido/materiais?pedido=` →
   `POST /lista-materiais` v14.88; sem dinheiro; Núcleo fora = ficha sai sem a lista).
   **Ordem de Corte**: tabela item×corte igual às planilhas oficiais + SAÍDA DE PERFIS
   (ceil(metros/barra)) + desenho das barras (FFD) + SAÍDA DE MATERIAIS + CSV.
5. Produção avança o ciclo federado: EM_PRODUCAO → EMBALADO → NA_EXPEDICAO (avanço
   automático com outbox se o Comercial estiver fora).
6. Excluir pedido (Editar Pedido) limpa itens/peças em cascata **e** `pcp_pedido_info`
   + `pcp_ciclo_pendencias`.

## Convenções
- **Tudo em PT-BR** (UI, erros, commits). Erros `{ error: 'mensagem' }`.
- Escritas exigem sessão + `X-CSRF-Token` (pegar em `GET /api/auth/session`).
- `audit()` nunca lança (defensivo); `audit_log.entity_id` é VARCHAR(64) (aceita UUID).
- PM2: se restart não pegar, `delete + start`. Nginx: `^~` + `types{}` explícito.

## Rodar/testar (réplica local desta nuvem)
```bash
service postgresql start                 # cai com frequência — sempre conferir
cd server && node bin/install.js         # schema + seed + admin (admin/Senha123)
# mock do Comercial (detalhe do PED-2026/0002) em :3995 — scratchpad/mock-comercial.mjs (não versionado; prova feita na réplica da sessão)
COMERCIAL_API_BASE=http://127.0.0.1:3995 COMERCIAL_SERVICE_KEY=chave-teste node src/server.js  # :3021 via .env
# NUNCA `pkill -f "node src/server.js"` (mata o wrapper) — usar `fuser -k 3021/tcp`
```

## Estado (27/11/2026) — PENDENTE DE DEPLOY (`aplicar-comodo-da-peca.sh`): **O CÔMODO É O AMBIENTE ESCRITO NA PEÇA + PLANO ROLO A ROLO**
Pedido do cliente (27/11), com o PDF da proposta 2026/1348 (350 peças, 185 itens, lançadas em 8 ambientes do pedido
"PARTE 1…8", com o cômodo escrito no campo Ambiente de cada peça): *"Nesse pedido foi feito essa separação em partes
como ambiente mas foi descrito o ambiente na peça. Preciso calcular os materiais que serão usados com as regras
recentes de aproveitamento de tecido dado que o ambiente teve que ser descrito diferente. Como podemos resolver isso?
E deixar o aproveitamento de tecido mais preciso possível?"*. **Apurado:** a regra de 26/11 (o ambiente do pedido
vence o texto da peça) gravava "PARTE 3" em 40 peças de 20 cômodos — a Ficha e a etiqueta perdiam o cômodo e o plano
de corte do tecido (uma largura de rolo por ambiente) prendia a parte inteira numa largura. Réplica, o pedido
inteiro pelos três módulos: **1.360,58 m** de tecido pelas partes × **958,38 m** pelos 62 cômodos das peças.
**Decisões dele (27/11):** (1) se a peça tem o Ambiente preenchido, ele é o cômodo (sem o número da janela do fim);
a parte segue como agrupamento; (2) a Ficha mostra de qual largura sai cada cômodo e avisa os nomes parecidos em
larguras diferentes — para juntar, corrige-se o texto; (3) o plano sai rolo a rolo. Quem calcula (o cômodo sem o
nº da janela, os nomes parecidos, os rolos) é o **Núcleo v14.100**; a parte do PCP:
- **`nucleo-spec.js`** (puro; testes em `test/ambiente.test.mjs`):
  - `ambienteDaPecaComercial(it, ambientes)` → `{ambiente, grupo_pedido, ambiente_origem}` — o que a liberação grava:
    `ambiente` = o texto escrito na peça › o nome do bloco; `grupo_pedido` = o bloco do pedido; `ambiente_origem` =
    `'peca'` | `'bloco'` (texto igual ao nome do bloco = `'bloco'`). O número da janela NÃO é tirado aqui;
  - `ambienteParaONucleo(item)` → `{ambiente, ambiente_peca?}`: `ambiente` = o grupo (sem grupo, o próprio ambiente —
    assim o Núcleo anterior segue como hoje) e `ambiente_peca` só quando a origem é a peça;
  - `ambienteParaReler(atual, itemComercial, ambientes)` — a peça JÁ NA FILA (`ambiente_origem` nulo): troca o
    `ambiente` só quando está vazio ou é o nome do bloco; texto digitado no PCP fica (ganha grupo e origem `'peca'`);
  - `ambienteDoItemComercial` (26/11) segue existindo: é "o nome do bloco".
- **`db.js`** (boot): `pcp_itens.grupo_pedido VARCHAR(120)` e `pcp_itens.ambiente_origem VARCHAR(10)` (NULL = item
  liberado antes, ainda não relido). **`routes/comercial.js`**: a liberação grava os três; a prévia e a seleção de
  estrutura usam o mesmo ambiente. **`routes/pcp.js`**: `GET` ecoa `grupo_pedido`/`ambiente_origem`; no
  `PUT /pcp/itens`, quem MUDA o `ambiente` (modal "Ver") marca a origem — `'peca'`, ou `'bloco'` se digitou o nome do
  próprio grupo; sem mexer no ambiente a origem fica.
- **`lista-materiais.js`**: manda `ambiente` (grupo) + `ambiente_peca` (cômodo) nos dois corpos (venda e reserva);
  a mescla de blocos soma também `bobinas_por_metros` e `faixas` (só quando existem).
- **`completar-ambiente.js` + `bin/completar-ambiente.js`** (`--simular`, `--pedido`, `--concluidos`, `--detalhe`):
  relê os itens com `ambiente_origem` nulo; ações `trocado` (o ambiente virou o cômodo da peça, ou o bloco onde
  estava vazio) e `marcado` (já estava certo: ganhou grupo e origem). Idempotente; saída 2 = depende do Comercial.
- **Ficha de Produção** (`ficha-producao.js`): item com **Ambiente** (o cômodo) e **Grupo no pedido**; no plano de
  corte: tabela **"Largura do rolo → cômodos"** (cada cômodo com as peças; o que aparece em mais de um grupo diz
  quais), o aviso **"cômodos de nomes parecidos em larguras de rolo diferentes"** (do Núcleo) e o plano **rolo a
  rolo** — uma tabela por largura ("369,30 m de tecido em 13 rolo(s) de 30,00 m"), "Rolo n de N — m usados · sobra",
  faixas numeradas na ordem de corte, cada peça com item, peça e o texto dela. Tabela de tecido: "13 × 30 m" e, se
  diferir, "(pelos metros seriam N)". Núcleo anterior (sem `bobinas`): o bloco sai como antes.
- **Outros**: modal "Ver" (o campo Ambiente explica que é o cômodo do plano e mostra o grupo); aba Comercial mostra
  "cômodo (PARTE N)"; etiqueta ganhou o campo opcional `grupo_pedido` ("Grupo no pedido") — o campo `ambiente` dos
  modelos existentes passa a imprimir o cômodo; **Plano de Corte via Núcleo** agrupa pelo grupo do pedido e mostra o
  cômodo na peça; `bin/conferir-lista-materiais.js --sonda-comodo` (Núcleo v14.100: `parametros.comodo_pela_peca` e
  `plano_rolo_a_rolo` existem; saída 3 = Núcleo anterior) e, no resumo `--pedido`, os rolos por largura e a origem
  do ambiente dos itens; `deploy/checar-guardas.py` confere também as guardas com expressão regular.
- Testes sem banco: `npm test` = **29** (regra da liberação, envio ao Núcleo, corpo/reserva, releitura da fila,
  mescla com o rolo a rolo).
- **Depende de**: **Núcleo v14.100** ANTES (`aplicar-v14-100-comodo-e-rolos.sh`; o script daqui sonda e aborta;
  `PULAR_SONDAS=1` sobe assim mesmo). Nada quebra na ordem inversa: com o Núcleo anterior a lista segue pelo grupo
  do pedido (o que é hoje) e a Ficha sai sem a lista de cômodos e sem os rolos. Comercial: sem deploy por causa
  desta entrega (o contrato `itens[].ambiente` + `ambienteId` + `ambientes[]` do `GET /pedidos/:id` já existe); a
  v2.142.0 dele só leva o mesmo cômodo ao Relatório de custo.
- **Provado na réplica** com o pedido do relato lançado no **Comercial real** (backend NestJS compilado, 8 ambientes
  "PARTE n", 185 itens com o texto do cômodo) → Fábrica → **Núcleo v14.100**: e2e **42** (liberação grava cômodo,
  grupo e origem; lista 350 peças em 1,4 s; plano com 62 cômodos, cada peça na largura do cômodo dela, 958,38 m em
  13 + 20 rolos; chaves do Núcleo desligadas → 1.360,58 m pelas partes, como hoje; etiqueta e Necessidade; pedido
  liberado antes → `completar-ambiente` troca 184 e preserva o digitado no PCP; corrigir o Ambiente no modal refaz o
  plano; nome com uma letra a mais em outra largura → aviso, corrigido some) · Playwright da Ficha **13** · deploy
  ensaiado inteiro no `/var/www` simulado. Roteiros no scratchpad da sessão (não versionados).
- ⚠ **Pendências/observações (não mexidas):**
  (a) **etiqueta**: o campo `ambiente` dos modelos passa a imprimir o cômodo (com o nº da janela) no lugar do nome
  do bloco — nos pedidos em que a peça tem o texto; etiqueta já impressa não muda;
  (b) a **baixa de estoque** da 1ª bipagem segue pedindo a peça SOZINHA ao Núcleo (pendência (a) de 26/11);
  (c) o texto do cômodo corrigido no PCP (modal "Ver") NÃO volta ao Comercial — o Relatório de custo de lá usa o
  texto do orçamento; se a correção importa para os dois, corrija nos dois;
  (d) item sem ambiente nenhum no Comercial fica com `ambiente_origem` nulo e é relido a cada execução do
  `completar-ambiente` (aparece como "sem ambiente no Comercial"; inofensivo);
  (e) regra de estrutura (F3) que testasse a variável `ambiente` com o nome do bloco passa a receber o cômodo
  quando a peça tem o texto (nenhuma regra assim cadastrada na réplica; conferir em produção se houver);
  (f) `docs/PROTOCOLO-FEDERACAO.md` (mantido nos 8 repos): a linha D (Fábrica → Núcleo) ainda não cita
  `ambiente_peca` nem a v14.100 — registrar na próxima versão do protocolo.

## Estado (26/11/2026) — EM PRODUÇÃO desde 26/11/2026 19:06 (commit 99b21cf, `aplicar-plano-de-corte-do-tecido.sh`): **PLANO DE CORTE DO TECIDO + AMBIENTE DA PEÇA**
Pedido do cliente (26/11): *"Para o cálculo de consumo de tecido eu preciso do melhor aproveitamento de tecido
economizando o máximo que pudermos mesmo que usemos larguras diferentes do mesmo tecido, só não pode usar larguras
diferentes do mesmo tecido no mesmo ambiente"*. Quem calcula é o **Núcleo v14.98** (`consumo-tecido.js`: cada tecido
do pedido é planejado no PEDIDO inteiro — peças de ambientes diferentes dividem o rolo, o pedido pode usar larguras
diferentes, cada AMBIENTE sai de UMA largura; chave `consumoTecidoPedido` no painel do Núcleo). A parte do PCP:
- **O pedido vai na peça** (`lista-materiais.js montarPayloadPedidos`: `corpo.pedido`, também na reserva): o tecido
  nunca é planejado entre pedidos diferentes e "Sala" de dois pedidos não é o mesmo ambiente. Núcleo anterior ignora.
- **O pedido NUNCA é partido em blocos** (`dividirEmBlocos`): agrupa por pedido e só divide acima de
  `LOTE_PEDIDO_MAX` = 2.000 peças (teto do Núcleo desde a v14.95); `LOTE_MAX` = 250 segue sendo o alvo quando o lote
  junta vários pedidos (Necessidade). Antes um pedido de 300 peças virava dois blocos = dois planos, e o mesmo
  ambiente poderia sair de duas larguras. `mesclarRespostas` leva `plano_tecido` de cada bloco.
- **Ficha de Produção**: bloco **"✂ Plano de corte — coleção · cor"** logo abaixo da tabela de tecido do pedido
  (`ficha-producao.js blocoPlanoTecido`): rolo (largura e metros) → faixa (comprimento) → peças lado a lado
  ("Item N · peça #M", ambiente, largura de corte × altura de fábrica, "(deitada)") + o aviso **"Corte o tecido
  seguindo o plano acima"**. Os metros de tecido da lista só valem se a fábrica cortar ASSIM — cortando ambiente por
  ambiente gasta mais do que o separado/comprado. Núcleo anterior ou regra desligada = bloco não aparece.
- **AMBIENTE da peça** (defeito antigo, era a pendência (c) da entrega de 25/11): a liberação gravava `it.ambiente`,
  a coluna de TEXTO do item do Comercial — legada e **nula em todo pedido montado com ambientes** (o nome mora em
  `pedido.ambientes[]`, pelo `ambienteId`). A Ficha e a etiqueta saíam sem ambiente e o Núcleo tratava o pedido
  inteiro como UM ambiente: réplica, casa de 5 janelas FILTRA SOL 5% — **14,50 m²** numa largura só, contra
  **12,68 m²** com os ambientes certos (o número do Relatório de custo do Comercial). Agora
  `nucleo-spec.js ambienteDoItemComercial(it, ambientes)` (a MESMA regra do Comercial, `nomeDoAmbiente` v2.87.0: o
  ambiente do pedido pelo id vence o texto da peça; texto só quando o id não resolve) é usada na liberação, na prévia
  (contexto das regras de estrutura) e na aba Comercial (`comercial.js ambienteDe`).
- **Peças já na fila**: `src/completar-ambiente.js` + `bin/completar-ambiente.js` (`--simular`, `--pedido`,
  `--concluidos`) relê o pedido no Comercial e preenche `pcp_itens.ambiente` SÓ onde está vazio (o que alguém digitou
  no modal "Ver" fica; idempotente). Saída 2 = pendência que depende do Comercial (fora do ar / pedido sem id).
- **`bin/conferir-lista-materiais.js`**: `--sonda-plano` (Núcleo v14.98: a resposta traz `plano_tecido`; diz se a
  regra está desligada no painel; saída 3 = Núcleo anterior) e, no resumo `--pedido`, os rolos do plano e os
  ambientes das peças ("NENHUM" = rode o completar-ambiente).
- Testes sem banco (no `npm test`, 19): `test/lista-materiais.test.mjs` (blocos: pedido inteiro, teto, pedidos
  intercalados, nada perdido; mescla com o plano) e `test/ambiente.test.mjs` (regra do ambiente e do completar).
- **Depende de**: **Núcleo v14.98** ANTES (o script sonda e aborta; `PULAR_SONDAS=1` sobe assim mesmo). ⚠ **A ordem
  importa:** com o ambiente das peças preenchido, o Núcleo ANTERIOR (ou a regra desligada no painel dele) calcula o
  tecido AMBIENTE POR AMBIENTE, sem dividir rolo entre ambientes — a lista do PCP pede MAIS tecido do que pedia
  quando o pedido inteiro ia como um ambiente só. Medido na réplica, a mesma casa de 5 janelas: **14,50 m²** (PCP de
  até hoje, peças sem ambiente) → **18,00 m²** (ambientes certos + Núcleo v14.97) → **12,68 m²** (ambientes certos +
  Núcleo v14.98). O Comercial v2.141.0 (Relatório de custo explica o plano) é independente. Sem migration; não muda
  preço.
- **Provado na réplica** (Núcleo v14.98 real + Comercial simulado devolvendo o pedido como a produção — `ambientes[]`
  + `ambienteId`, texto nulo): e2e API **30** (liberação grava os 5 ambientes; plano 2,00 m × 4,15 m + 2,50 m ×
  1,75 m = 12,68 m², uma largura por ambiente; sem ambiente 14,50 m²; completar-ambiente com `--simular`, item
  digitado preservado, 2ª execução sem mudança; **pedido de 260 peças em 26 ambientes numa chamada só — 0,8 s, um
  plano, nenhum ambiente em duas larguras, conferido prateleira a prateleira**; Necessidade dos dois pedidos = soma
  dos planos; sondas) · Playwright da Ficha **11** (bloco do plano, rolos e metros, peça/ambiente, ambiente no item,
  Ficha do pedido grande) · Fábrica nova × Núcleo ANTERIOR (v14.97): sonda acusa (saída 3) e a lista segue · deploy
  ensaiado inteiro no `/var/www` simulado. Roteiros no scratchpad da sessão (não versionados).
- ⚠ **Pendências/observações (não mexidas):**
  (a) a **baixa de estoque** da 1ª bipagem (`materiaisDaPecaParaBaixa`) pede a peça SOZINHA ao Núcleo — rolo e metros
  individuais; com o plano do pedido a peça pode sair de OUTRA largura de rolo (o sku do tecido muda) e a soma das
  baixas passa do tecido cortado. Já era assim com o aninhamento por ambiente; só importa com o estoque de tecido
  controlado pelo Compras (de-para por cor). Caminho: baixar pela linha da peça na lista do PEDIDO;
  (b) a linha de tecido POR ITEM (Ficha) diz o rolo do plano e o comprimento de corte da própria peça — a soma dos
  itens não é o consumo do pedido (peças lado a lado dividem a faixa); o consumo é o da tabela de tecido do pedido;
  (c) etiqueta JÁ impressa não muda com o completar-ambiente (reimprimir se precisar do ambiente);
  (d) a Necessidade de materiais soma o plano de CADA pedido — não corta tecido entre pedidos (decisão em aberto com
  o cliente; juntar pedidos pediria a fábrica cortar pedidos diferentes na mesma faixa);
  (e) peças FORA do aproveitamento (Romana, painel, cortina, peça com emenda) seguem cada uma no seu rolo — o
  Núcleo avisa quando o mesmo tecido fica em duas larguras no ambiente por causa delas.

## Estado (25/11/2026) — EM PRODUÇÃO desde 26/11/2026 17:48 (commit 48f66c6, `aplicar-lista-como-a-venda.sh`): **LISTA DE MATERIAIS COMO A VENDA COTOU**
Origem: pendência registrada pelo Comercial na v2.139.1 (25/11) — *"`corpoDaPeca` é o espelho do corpo
ANTIGO (fixa `produto_sku`/`tecido_sku` da venda) — na lista de materiais do PCP valem as mesmas três
diferenças"*. **Reproduzido na réplica (Núcleo :3070) com o corpo de produção:**
(a) BK COLISEU 2,17 × 2,26 manual, `produto_sku: premium47` → lista com `p47_tubo` (a venda cobrou o tubo
53: R$ 1.316,40 × R$ 1.345,28 com o sku fixo); (b) troca de tela FILTRA SOL 5% 1,50 × 1,60 → 15 componentes
+ tecido (a venda cobrou só a tela, R$ 431,75); (c) AM 3059 2,17 × 2,26 com `tecido_sku: t0` → 422
`peca_excede_rolo` ("peças que não calcularam").
- **`nucleo-spec.js`** (puro; `server/test/nucleo-spec.test.mjs`, 64 verificações):
  - `specDoItemComercial` guarda **`spec.cotacao {produto, tubo_equiparado}`** quando o item do Comercial
    traz `nucleoCotacao` (v2.140.1; a ausência da chave = Comercial anterior, diferente de `produto: null`);
  - `corpoDaPeca` monta o corpo **como a tela do Comercial**: PRODUTO por `cotacao.produto` (`__auto` → sem
    `produto_sku`; `__so_tecido` → `so_tecido: true`; sentinela/sku → `produto_sku`) + `tubo_equiparado`;
    TECIDO pela `colecao` (+ cor; `tecido_sku` só sem coleção). Sku FIXO como antes quando: a peça não tem
    `cotacao`, o tipo não aponta produto do motor (`produto: null`), ou o PCP trocou o "SKU do Núcleo" do
    item (modal Ver — `produto_sku` do item ≠ o da venda). `so_tecido` vai em QUALQUER modo;
  - `corposDaPeca` → `{corpo, reserva, venda}`: a **RESERVA** é o corpo de até 25/11 (`fixarSkus`: os
    códigos gravados na venda); `pecasParaReserva`/`decidirReserva`/`calcularComReserva(pecas, buscar)`:
    peça que **não calcula** pelo corpo como a venda, ou calcula **OUTRA estrutura** que a vendida, é
    pedida de novo pela reserva, que só vale se calculou (1 chamada no caso normal; 2 com reserva; 3 quando
    o resultado é misto, para os agregados saírem de uma resposta só). **Por construção, peça que
    calculava com o corpo antigo continua calculando.**
- **`lista-materiais.js`**: `montarPayloadPedidos` passa o item inteiro (o sku da Estrutura do PCP,
  `estrutura_sku`, é resolvido no módulo puro) e devolve `itens_sem_cotacao`; `calcularBloco`;
  `por_item[id].notas[]` ("SOMENTE TECIDO (troca de tela)…", "Peça N: … lista pelos códigos gravados na
  venda") e `so_tecido`; `reservas[]`; avisos do pedido (peças pela reserva; itens liberados antes; troca
  de tela com Núcleo anterior à v14.97). `materiaisDaPecaParaBaixa` usa a mesma decisão.
- **Peças já na fila**: `src/completar-spec.js` + `bin/completar-spec-nucleo.js` (`--simular`, `--pedido`,
  `--concluidos`) relê o pedido no Comercial e ACRESCENTA `spec_nucleo.cotacao` só onde falta (idempotente;
  não completa se o tipo do item mudou no Comercial). `bin/conferir-lista-materiais.js` (`--sonda` |
  `--pedido`): sonda dos provedores e resumo da lista de um pedido.
- **Ficha de Produção**: as notas do item saem acima da lista (impressas).
- ⚠ **Numeração dos provedores**: esta entrega foi escrita com "Núcleo v14.95" e "Comercial v2.139.2";
  outras sessões publicaram esses números com outro conteúdo (25–26/11), então os pares daqui são a
  **v14.97** e a **v2.140.1** — os scripts `aplicar-v14-97-troca-de-tela-lista.sh` e `aplicar-v2.140.1.sh`.
- **Depende de** (provedor antes do consumidor): **Núcleo v14.97** (o `/lista-materiais` passa a devolver
  só o tecido para `so_tecido` — antes devolvia a receita inteira mesmo com a marca; eco
  `pecas[].so_tecido`) e **Comercial v2.140.1** (`nucleoCotacao` em cada item do `GET /pedidos/:id`).
  Sem eles nada quebra: sem o Núcleo novo a troca de tela segue com a estrutura e a tela AVISA; sem o
  Comercial novo a peça segue pelo sku gravado e só o tecido passa a ir pela coleção.
- **Provado na réplica**: unitário 64 · varredura em processo de **51.816 vendas simuladas** (todas as
  linhas de produto; corpo antigo × novo × a tela): nenhuma regressão, lista nova = lista da venda em 100%
  (antigo → novo: 83,7% igual · 8,1% troca de tela só com o tecido · 4,2% passaram a calcular · 3,6% tubo
  da linha · 0,3% rolo; repetida em 26/11 com a regra do rolo da v14.96 LIGADA — venda nova já grava o
  rolo certo —: 51.881 vendas, nenhuma regressão, 100% igual à venda; 86,6% igual · 8,4% troca de tela ·
  3,9% tubo da linha · 0,8% passaram a calcular · 0,2% rolo) · e2e API 54 (mock do Comercial com a regra real do `nucleoCotacao` compilada +
  Núcleo real: liberação, lista, necessidade, pedido liberado antes + completar, sku trocado no PCP) ·
  **e2e com os TRÊS módulos de verdade, 48** (26/11: backend NestJS do Comercial v2.140.1 compilado, com
  Prisma num banco próprio → Fábrica → Núcleo v14.97 com a regra do rolo da v14.96 ligada; pedido de 14
  itens em 4 ambientes: contrato do `GET /pedidos/:id` pela chave de serviço, liberação — o Comercial passa
  a `LIBERADO_PRODUCAO` —, as três peças do relato batendo com o que a venda cobrou, a peça larga gravada
  no rolo estreito saindo no rolo que a comporta, demais famílias iguais às de antes, sonda e
  completar-spec contra o Comercial real) · deploy ensaiado no `/var/www` simulado (provedor anterior →
  aborta; `PULAR_SONDAS=1`; caminho feliz; checkout sem o commit; e a cadeia inteira Núcleo → Comercial →
  Fábrica com os provedores reais). Roteiros no scratchpad da sessão (não versionados).
- **`deploy/lib-estado.sh`** chegou à Fábrica (cópia do Núcleo): log em `deploy/logs/` e linha
  FALHOU/INTERROMPIDO no registro; `deploy/checar-guardas.py` idem.
- ⚠ **Pendências/observações (não mexidas):**
  (a) **rolo da peça larga — FECHADO pelo Núcleo v14.96** (a largura do rolo escolhida tem de comportar a
  peça; decisão do cliente, em produção desde 26/11/2026 11:40): mandando a COLEÇÃO, a peça vendida antes
  no rolo estreito CALCULA e a linha de tecido dela (Ficha por item e baixa de estoque) sai no rolo que a
  comporta — réplica: AM 3059 2,17 × 2,26 gravada com o `t0` (2,00 m) → lista com o `t47` (2,80 m). Só com
  a regra DESLIGADA no painel do Núcleo a linha da peça volta ao rolo estreito (o resumo `tecido[]` não);
  (b) o **Plano de Corte via Núcleo** (`ordem-corte-nucleo.js`) e a **Ordem de Corte local** não sabem da
  troca de tela nem da seleção automática (seguem pelo sku do item) — a troca de tela chega com a
  Estrutura do rolô e os cortes da peça inteira; quem avisa a bancada é o nome do item ("Somente Tecido")
  e a nota da Ficha;
  (c) **ambiente da peça — FECHADO em 26/11/2026** (seção "Estado (26/11/2026)" acima): a coluna legada
  `ambiente` do item do Comercial é NULA nos pedidos montados com ambientes (o nome vem de `ambientes[]`
  por `ambienteId`) — a liberação gravava `ambiente` vazio, a Ficha/etiqueta saíam sem ambiente e o
  Núcleo aninhava o tecido do pedido inteiro num grupo só;
  (d) `docs/PROTOCOLO-FEDERACAO.md` (mantido nos 8 repos): a linha C/D da matriz ainda não cita
  `nucleoCotacao` nem a v14.97 — registrar na próxima versão do protocolo.

## Estado (06/11/2026) — EM PRODUÇÃO desde 10/11/2026 (commit 44bde24, `aplicar-planejamento-p3.sh`, que cobre P0–P2): **P3 do PLANEJAMENTO — integração com o COMPRAS**
## (espec `docs/ESPEC-PLANEJAMENTO-PRODUCAO.md` §3.2 d/e + §3.3; exige o Compras com a migration 013)
- **`server/src/compras-client.js`**: `saldos(skus)` (best-effort → null com o Compras fora),
  `criarSolicitacao`/`saidaProducao` (lançam) e a **OUTBOX `pcp_compras_pendencias`**
  (`enviarComOutbox(tipo, chave, payload)`: falha transitória = pendência re-tentável a cada
  `COMPRAS_RETRY_MS` (5 min, `iniciarRetryCompras()` no boot); 4xx definitivo = `bloqueada`).
  Envs `COMPRAS_API_BASE`/`COMPRAS_SERVICE_KEY` (= `SERVICE_KEY_PCP` do Compras),
  `COMPRAS_INTEGRACAO_ENABLED=0` desliga. Sem chave: nada quebra, nada requisita, nada baixa.
- **Sku do Compras** (`lista-materiais.js skuCompras`): componente = `sku` do Núcleo; **tecido por
  COR = `<sku do tecido>:<COR>`** (`t1:BEGE`) — é o `produtos.nucleo_sku` que o comprador cadastra
  na tela Solicitações do Compras ("De-para com o Núcleo"). `necessidade.js` enriquece cada linha
  com `sku_compras`, `compras {saldo, reservado, em_oc, disponivel}` (null = sem de-para),
  `saldo`, `falta` (= necessidade − disponível) e devolve `compras_habilitado`/`compras_online`.
- **Requisitar** (`POST /api/pcp/necessidade/requisitar`, `requirePerm('fila','editar')`):
  `requisitarCompras()` grava em `pcp_requisicoes` (origem_ref = `pcp:nec:<sha1 do conteúdo>` —
  o MESMO conjunto sku+qtd+pedidos nunca vira duas SCs, dos dois lados) e envia com outbox;
  resposta 201 (SC criada) · 200 (já existia) · 202 (pendente, Compras fora). `GET
  /api/pcp/necessidade/requisicoes?atualizar=1` lista com o status atual da SC no Compras.
- **Baixa de estoque**: `baixarMateriaisDaPeca(pecaId)` (materiais de UMA peça pelo Núcleo —
  `materiaisDaPecaParaBaixa` —, plano `peca:<id>`, chave `saida:peca:<id>`) roda na **1ª bipagem**
  (`/bip` inicio sem etapa anterior, fire-and-forget) e na baixa manual `POST /api/pcp/pedido/
  baixa-materiais {pedido}` (+ `GET` com o estado). `pcp_pecas.materiais_baixados_em` só é marcada
  quando o Compras baixou/já tinha baixado ao menos um sku — peça cujos itens NÃO têm de-para fica
  aberta (`sem_de_para`) para quando o cadastro existir.
- **Tela**: Necessidade com colunas Saldo/Falta ("sem de-para" · "Compras fora"), botão
  **Requisitar ao Compras** (modal: pré-marca os itens com falta, quantidade sugerida = falta, data
  de necessidade, obs) e card **Requisições feitas** (SC · situação · pendente de envio); Editar
  Pedido: **"Baixar materiais no Compras"**. Manual atualizado.
- Provado na réplica (Compras real :3051 + Núcleo :3070): e2e `scratchpad/e2e-pcp-p3.mjs` (não
  versionado; prova feita na réplica da sessão) 31
  (saldo por de-para, tecido:COR, requisição idempotente, reservado, Compras derrubado → 202 +
  outbox → religado → reenvio automático vira SC, 1ª bipagem baixa e marca, 2ª não repete, baixa
  manual idempotente) · Playwright `pw-pcp-p3.js` (não versionado) 11. Deploy `deploy/aplicar-planejamento-p3.sh`
  (sem migration manual; ORDEM: Compras `aplicar-solicitacoes-compra.sh` ANTES; depois o .env
  daqui com `COMPRAS_*` + restart). ⚠ Depois: o comprador faz o DE-PARA no Compras.

## Estado (06/11/2026) — EM PRODUÇÃO desde 10/11/2026 (commit 44bde24, `aplicar-planejamento-p3.sh`, que cobre P0–P2): **P1 do PLANEJAMENTO — aba "Necessidade de materiais"**
## (espec `docs/ESPEC-PLANEJAMENTO-PRODUCAO.md` §3.2 d; exige o Núcleo v14.88 — reaproveita o P0)
- **`server/src/necessidade.js`**: `pedidosDoHorizonte({horizonte, ate, pedidos})` — `nao_cortou`
  (padrão: peça aberta SEM etapa iniciada no setor de CORTE = `pcp_setores.ordem_corte`; sem setor
  marcado, sem etapa nenhuma), `abertos`, `pedidos` (lista), `ate` = data prometida; item com pedido
  vazio fica fora (`totais.itens_sem_pedido`). `necessidadeMateriais()` chama
  `listaMateriaisDosPedidos` em lote e devolve `{pedidos[], totais, tecido[] (coleção × cor × rolo),
  tecido_totais, perfis[], perfis_totais, tubos[], componentes[] (≠ tecido), pecas_erro[], por_item}`
  — cada linha com **`pedidos[]`** derivado das refs `item:peca`. `necessidadeCsv()` (BOM, `;`,
  vírgula decimal). Rota **`GET /api/pcp/necessidade?horizonte=&ate=&pedidos=&formato=csv`**
  (`requirePerm('fila','ver')`); aba `necessidade` em `ABAS`/`ABAS_PERM`.
- **Limite do Núcleo**: `/lista-materiais` aceita até **300 peças** (`lote_grande`) — o horizonte
  passa disso. `lista-materiais.js` ganhou `dividirEmBlocos` (≤ 250 peças, fechando na fronteira do
  PEDIDO; um pedido só se divide se sozinho excede) + `mesclarRespostas` (materiais por chave,
  tecido por coleção × cor × rolo, perfis por componente, tubos por Ø — metros/bobinas/barras
  SOMADOS por bloco, com aviso "pode sobrar uma a mais"), blocos em paralelo de 3;
  `produtos-client.buscarListaMateriais` passou a guardar o motivo da falha (`erroListaMateriais()`,
  timeout 60 s) — a tela diz "HTTP 422 — Máximo de 300 peças" em vez de "indisponível". Vale também
  para a Ficha (P0) de pedido grande.
- **Tela** (`pcp/public/assets/js/necessidade.js` + `sec-necessidade`): horizonte / pedidos / data,
  Calcular, CSV (download pela rota), Imprimir, **"Requisitar ao Compras" desabilitado (P3)**;
  métricas, avisos (Núcleo fora com o motivo, itens sem spec, peças que não calcularam com o
  motivo, itens sem pedido, blocos), tabelas Tecido · Perfis/tubos · Componentes (filtro) · Pedidos
  (link para a Ficha). Manual atualizado.
- Provado na réplica (Núcleo real :3070): e2e API `scratchpad/e2e-pcp-p1.mjs` (não versionado;
  prova feita na réplica da sessão) 20 (422s, 0002 com
  AM 3059 BEGE, pedidos nas linhas, sem dinheiro, horizonte de 540 peças em blocos, peça bipada no
  Corte sai do "não cortou", filtro `ate`, CSV) · Playwright `pw-pcp-p1.js` (não versionado) 16. Deploy
  `deploy/aplicar-planejamento-p1.sh` (sem migration; Núcleo v14.88 ANTES).
  ⚠ Na réplica 536 das 540 peças do seed não calculam ("Informe largura e altura") — itens antigos
  sem spec/medida; em produção, itens liberados depois do P0 chegam completos.

## Estado (06/11/2026) — EM PRODUÇÃO desde 10/11/2026 (commit 44bde24, `aplicar-planejamento-p3.sh`, que cobre P0–P2): **P2 do PLANEJAMENTO — aba "Planejamento de carga"**
## (espec `docs/ESPEC-PLANEJAMENTO-PRODUCAO.md` §3.2 f; sem dependência de versão do Núcleo)
- **`server/src/carga.js`**: `sequenciar({inicio, semanas, cfg, setores, pecas})` é PURO (teste
  `server/test/carga.test.mjs`, 15 casos, sem banco): peças ABERTAS ordenadas por **prioridade**
  (2 urgente › 1 alta › 0 normal) › especial › `data_cliente` › `chegada_pcp` › id, alocadas setor a
  setor (ordem do roteiro) no 1º dia útil com capacidade a partir do dia do setor anterior (fila
  contínua); etapa com `fim` em `pcp_peca_etapas` não é programada; devolve por setor os dias
  `{data, total, capacidade, estourado, ocupacao_pct, pecas[]}`, por peça/item `previsao`,
  `data_limite` (= data prometida − `folga_dias`), `atrasa`, `alem_horizonte`, e `alertas`
  (setores estourados, itens que atrasam, sem roteiro, sem data, sem capacidade, roteiro padrão).
  `carregarCarga()` lê a fila (`pcp_pecas.conclusao IS NULL`), o roteiro da ESTRUTURA ou da LINHA
  (`server/src/roteiro.js roteiroDaLinha` — saiu de `routes/pcp.js`, compartilhado com a bipagem);
  **peça sem roteiro cadastrado passa por TODOS os setores ativos em ordem** (`roteiro_padrao`,
  com aviso na tela) — espelha a bipagem, onde roteiro vazio aceita qualquer setor.
- **Cadastro (migrations no boot)**: `pcp_setores.capacidade_dia NUMERIC` (peças/dia útil; NULL =
  sem limite — `GET/PUT /pcp/setores` ecoam/aceitam; `''`/`null` explícito limpa, chave ausente
  preserva, texto = 422), `pcp_itens.prioridade SMALLINT DEFAULT 0` (`PUT /pcp/itens` e
  `PUT /pcp/pedido` aceitam 0/1/2; `GET /itens` ecoa), `pcp_config.carga_cfg`
  `{dias_uteis:[1..5], folga_dias:1, semanas:2}` (seed `ON CONFLICT DO NOTHING`).
- **Rotas** (`routes/pcp.js`): `GET /api/pcp/carga?inicio=&semanas=` (quem vê a fila),
  `GET/PUT /api/pcp/carga/cfg` (PUT admin + CSRF), `POST /api/pcp/carga/previsoes` (grava a
  previsão em `pcp_itens.prev_producao` dos itens abertos; `requirePerm('fila','editar')`;
  idempotente — só regrava quando muda). Aba `carga` em `ABAS` (admin.js) e `ABAS_PERM` (app.js).
- **Tela** (`pcp/public/assets/js/carga.js` + `sec-carga` no index + CSS `.carga-*`): toolbar
  (início, semanas 1–8, Recalcular, Gravar previsões, ⚙ Calendário), 4 métricas, avisos (roteiro
  padrão, setor sem capacidade), um card por setor com **capacidade editável inline** (admin) e a
  grade de dias (verde/âmbar ≥ 80 %/vermelho estourado; clique lista as peças do dia), tabela
  "Itens que vão atrasar". Prioridade: select no modal "Ver" (`#ed-prioridade`), em massa no
  Editar Pedido (`#ped-prioridade`, "(manter atual)"), badge ⚡/▲ na fila e `priorityOrder`
  (prioridade vence a especial). Capacidade também em Setores (coluna + editar). Manual atualizado.
- Provado na réplica: unitário 15 (`server/test/carga.test.mjs`, versionado) · e2e API
  `scratchpad/e2e-pcp-p2.mjs` 25 · Playwright `pw-pcp-p2.js` 21 (os dois NÃO versionados; prova
  feita na réplica da sessão) (aba, grade 12/dia, clique no dia, capacidade inline → 20, modal/editor/fila com
  prioridade, Setores). Deploy `deploy/aplicar-planejamento-p2.sh` (sem migration manual; roda o
  teste do sequenciador; cobre o P0 se pendente). ⚠ Depois do deploy é CADASTRO: capacidade por setor
  e roteiros nas estruturas (na réplica as 34 estruturas estão com roteiro `[]`).

## Estado (06/11/2026) — EM PRODUÇÃO desde 10/11/2026 (commit 44bde24, `aplicar-planejamento-p3.sh`, que cobre P0–P2): **P0 do PLANEJAMENTO DE PRODUÇÃO**
## (espec `docs/ESPEC-PLANEJAMENTO-PRODUCAO.md`; decisões do cliente 05/11; ordem P0 → P2 → P1 → P3)
- **`pcp_itens.spec_nucleo`** (JSONB, migration no boot): a peça COMO FOI VENDIDA
  (`server/src/nucleo-spec.js specDoItemComercial`), gravada na liberação; `GET /pcp/pedido`
  e `/itens` ecoam `spec_nucleo` + `tem_spec`. **`corpoDaPeca(item, peca)`** (mesmo módulo
  puro) monta o corpo do `/lista-materiais` = espelho de `montarCorpoPrecificar` do Comercial
  (acabamento → box/bandô/guias/abas/revestimento, motorização, cortina/ph50/celular/painel,
  afastamento); medidas da PEÇA (cm→m) vencem a spec; sem L×H vai `area_m2`. ⚠ Desde 25/11/2026
  o produto e o tecido vão COMO A VENDA COTOU, com os códigos gravados de reserva (seção acima).
- **`server/src/lista-materiais.js`**: `montarPayloadPedidos` (1 peça por `pcp_pecas`, ref
  `item:peca`) + `listaMateriaisDosPedidos` (chama o Núcleo via `produtos-client.buscarListaMateriais`,
  `PRODUTOS_LISTA_MATERIAIS_ENABLED=0` desliga; devolve `data` sem dinheiro + `por_item`
  agregado + `itens_sem_spec` com aviso). Rota **`GET /api/pcp/pedido/materiais?pedido=`**
  (`?pedidos=a,b` em lote — base da P1). Ficha de Produção imprime por item + resumo.
- **Estruturas com SKU**: migration no boot preenche `pcp_produtos.produto_sku` nas 34
  estruturas pelo de-para (`DE_PARA_SKU` em `db.js`) SÓ onde está NULL (edição no editor
  de Estrutura preservada). Rolô Soft/Premium são N:1 de propósito; romana/painel/PH25/PH50
  1:1 → o casamento por SKU da liberação passa a acontecer.
- **Linhas SEM estrutura local** (`nucleo-spec.js LINHAS_SEM_ESTRUTURA_LOCAL`: cortina, fixa,
  celular, vertical, toldo): a peça não fica "estrutura pendente" (badge **"pelo Núcleo"** na
  fila, na prévia da aba Comercial e na Ficha) e a **bipagem** usa o roteiro por LINHA de
  `pcp_config.roteiro_linhas` (JSON `{linha: [nomes de setor em ordem]}`, semeado com
  `ON CONFLICT DO NOTHING`; sequencial — Corte → Montagem → Embalagem na cortina).
- **Entrada manual removida**: sidebar/topo sem "Novo Pedido" e sem Importar Excel/PDF; seção,
  modais JSON/PDF, a referência ao `pdf.min.js` e o bloco de importação do `app.js` saíram (os
  arquivos `pdf.min.js`/`pdf.worker.min.js`/`xlsx.full.min.js` de `assets/vendor/` foram apagados do
  repo em 16/11/2026 — só o `qrcode.js` fica); `POST /pcp/itens`
  e `/itens/lote` → **410** apontando para o Comercial; `ABAS` sem `novo`. Topo ganhou
  "+ Pedido (Comercial)" (abre a aba Pedidos Comercial).
- **DEFEITO fechado no modal "Ver" da fila**: `salvarEdicao` casava a estrutura pelo NOME
  digitado e, como o nome do item do Comercial nunca é o nome da estrutura, **regravava
  `produto_id = null` a cada edição** (a peça virava "estrutura pendente" e a Ordem de Corte
  sumia). Agora a estrutura é um SELECT (`#ed-estrutura`; vazio = sem estrutura/pelo Núcleo) e
  o modal edita também SKU do Núcleo, coleção, cores, acionamento e ambiente (`PUT /pcp/itens`
  aceita `produto_sku`, `colecao`, `cor_tecido`, `cor_perfil`, `acionamento`, `ambiente`).
- Prévia da aba Comercial deixa de listar ACESSÓRIO (a liberação já o pulava).
- Provado na réplica: E2E (`scratchpad/e2e-pcp-p0.mjs` — não versionado; prova feita na réplica
  da sessão —, mock do Comercial em :3995 + Núcleo
  real :3070 — 30 checagens: prévia, liberação com spec, idempotência, lista de materiais por
  item/cor/sem dinheiro, PUT preserva `produto_id`, 410, roteiro por linha na bipagem, pedido
  antigo sem spec só avisa) + Playwright (17 checagens: navegação, modal, badges, Ficha).
- Deploy: `deploy/aplicar-planejamento-p0.sh` (migrations no boot; **exige o Núcleo v14.88**
  no ar — `aplicar-v14-88-lista-materiais.sh` ANTES; sem ele a Ficha sai sem a lista).
- ⚠ Pendências: reavaliar as regras/estruturas das peças de rolô na produção (com `produto_sku`
  preenchido o casamento por SKU só decide quando a estrutura é única); itens ANTIGOS da fila
  não têm `spec_nucleo` (a lista usa produto/coleção/medidas e avisa).

## Estado (07/08/2026) — EM PRODUÇÃO desde 10/11/2026 (commit `b127d6d` entrou no deploy 44bde24 do P3; conferido no REGISTRO): **desenhos de fabricação/instalação
## do Comercial no PCP** — a liberação grava flags em `pcp_pedido_info` (`desenho_fabricacao`/
## `desenho_instalacao`), o arquivo é servido por PROXY (`/api/comercial/pedidos/:id/desenhos[...]`,
## CSP imgSrc 'self'); badge 📐 na fila/aba Comercial e seção "DESENHO DE FABRICAÇÃO" na
## Ficha de Produção (imagem inline imprimível; PDF vira link). Validado local com mock. Antes:

## Estado (20/07/2026) — EM PRODUÇÃO desde 21/07/2026 (commit `06f5dbe`, linha de 2026-07-21 no REGISTRO): F3 BOM+custo na OC; **seleção de
## estrutura por SKU canônico** (item do pedido chega com `produtoSku` do Núcleo v2.29:
## regra > sku (quando 1 única estrutura tem o SKU) > nome > pendente; badge "sku" na
## prévia) e campo "SKU do Núcleo" no editor de Estrutura (CRUD expõe `produto_sku`).
## Validado local ponta a ponta (mock Comercial + banco real). Antes disso:

## Estado (17/07/2026) — tudo EM PRODUÇÃO até `5b1c80e`
- OC alinhada às planilhas de planejamento de corte (medidas de barra por corte,
  `bin/preencher-barras.js`); comando (bastão) por peça em `medidas.comando`.
- Seleção automática de estrutura (regras F3 + categorias por coleção + fallback nome)
  com conferência ANTES de liberar; "Aplicar/Reavaliar" na fila existente.
- Ficha de Produção completa; etiquetas com acabamento/lado/cor_componentes/janela/atributos.
- Fixes da revisão federada: outbox do ciclo, idempotência da liberação, audit VARCHAR.
- **Em validação com o cliente:** reconhecimento da estrutura usando os 2 pedidos de
  teste que já estão no PCP (regras reais ainda não cadastradas).
- **Pendente fora deste repo:** deploy da Agenda (prazo obrigatório `f8bed67` + chaves
  por módulo/lente 5 `b9ba2fb`) e do agendador de reconciliação do Compras (`068b708`).

## ⚠️ Norma de revisão da federação (14/07/2026)

Toda revisão de código, PR ou análise de impacto — neste e nos demais repos — segue as
**5 lentes** e o formato de saída de **`compras/docs/DIRETRIZES-REVISAO-ERP.md`**:
1) contrato entre módulos (consumidores/compatibilidade), 2) resiliência e idempotência
(retry, saga, sem duplicar NF/lançamento), 3) bounded contexts (sem cross-database, sem
vazamento de domínio), 4) concorrência e N+1, 5) segurança service-to-service (X-Service-Key).

## 🎨 Identidade visual

Marca, cores, tipografia e logos: ver **`docs/IDENTIDADE-VISUAL.md`** (guia replicado em todos os repos da federação; §8 = onde os assets vivem NESTE repo). Fonte de verdade: `logistica/docs/identidade-visual/` (BRAND-GUIDE.pdf).
