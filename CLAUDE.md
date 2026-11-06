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
- `server/bin/` — `install.js` (schema+seed+admin) e utilitários: `preencher-barras.js`,
  `reparar-keys.js`, `preencher-medidas.js`, `preencher-componentes.js`.
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
# mock do Comercial (detalhe do PED-2026/0002) em :3995 — scratchpad/mock-comercial.mjs
COMERCIAL_API_BASE=http://127.0.0.1:3995 COMERCIAL_SERVICE_KEY=chave-teste node src/server.js  # :3021 via .env
# NUNCA `pkill -f "node src/server.js"` (mata o wrapper) — usar `fuser -k 3021/tcp`
```

## Estado (06/11/2026) — na branch (deploy pendente): **P2 do PLANEJAMENTO — aba "Planejamento de carga"**
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
- Provado na réplica: unitário 15 · e2e API `scratchpad/e2e-pcp-p2.mjs` 25 · Playwright
  `pw-pcp-p2.js` 21 (aba, grade 12/dia, clique no dia, capacidade inline → 20, modal/editor/fila com
  prioridade, Setores). Deploy `deploy/aplicar-planejamento-p2.sh` (sem migration manual; roda o
  teste do sequenciador; cobre o P0 se pendente). ⚠ Depois do deploy é CADASTRO: capacidade por setor
  e roteiros nas estruturas (na réplica as 34 estruturas estão com roteiro `[]`).

## Estado (06/11/2026) — na branch (deploy pendente): **P0 do PLANEJAMENTO DE PRODUÇÃO**
## (espec `docs/ESPEC-PLANEJAMENTO-PRODUCAO.md`; decisões do cliente 05/11; ordem P0 → P2 → P1 → P3)
- **`pcp_itens.spec_nucleo`** (JSONB, migration no boot): a peça COMO FOI VENDIDA
  (`server/src/nucleo-spec.js specDoItemComercial`), gravada na liberação; `GET /pcp/pedido`
  e `/itens` ecoam `spec_nucleo` + `tem_spec`. **`corpoDaPeca(item, peca)`** (mesmo módulo
  puro) monta o corpo do `/lista-materiais` = espelho de `montarCorpoPrecificar` do Comercial
  (acabamento → box/bandô/guias/abas/revestimento, motorização, cortina/ph50/celular/painel,
  afastamento); medidas da PEÇA (cm→m) vencem a spec; sem L×H vai `area_m2`.
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
  modais JSON/PDF, `pdf.min.js` e o bloco de importação do `app.js` saíram; `POST /pcp/itens`
  e `/itens/lote` → **410** apontando para o Comercial; `ABAS` sem `novo`. Topo ganhou
  "+ Pedido (Comercial)" (abre a aba Pedidos Comercial).
- **DEFEITO fechado no modal "Ver" da fila**: `salvarEdicao` casava a estrutura pelo NOME
  digitado e, como o nome do item do Comercial nunca é o nome da estrutura, **regravava
  `produto_id = null` a cada edição** (a peça virava "estrutura pendente" e a Ordem de Corte
  sumia). Agora a estrutura é um SELECT (`#ed-estrutura`; vazio = sem estrutura/pelo Núcleo) e
  o modal edita também SKU do Núcleo, coleção, cores, acionamento e ambiente (`PUT /pcp/itens`
  aceita `produto_sku`, `colecao`, `cor_tecido`, `cor_perfil`, `acionamento`, `ambiente`).
- Prévia da aba Comercial deixa de listar ACESSÓRIO (a liberação já o pulava).
- Provado na réplica: E2E (`scratchpad/e2e-pcp-p0.mjs`, mock do Comercial em :3995 + Núcleo
  real :3070 — 30 checagens: prévia, liberação com spec, idempotência, lista de materiais por
  item/cor/sem dinheiro, PUT preserva `produto_id`, 410, roteiro por linha na bipagem, pedido
  antigo sem spec só avisa) + Playwright (17 checagens: navegação, modal, badges, Ficha).
- Deploy: `deploy/aplicar-planejamento-p0.sh` (migrations no boot; **exige o Núcleo v14.88**
  no ar — `aplicar-v14-88-lista-materiais.sh` ANTES; sem ele a Ficha sai sem a lista).
- ⚠ Pendências: reavaliar as regras/estruturas das peças de rolô na produção (com `produto_sku`
  preenchido o casamento por SKU só decide quando a estrutura é única); itens ANTIGOS da fila
  não têm `spec_nucleo` (a lista usa produto/coleção/medidas e avisa).

## Estado (07/08/2026) — na branch (deploy pendente): **desenhos de fabricação/instalação
## do Comercial no PCP** — a liberação grava flags em `pcp_pedido_info` (`desenho_fabricacao`/
## `desenho_instalacao`), o arquivo é servido por PROXY (`/api/comercial/pedidos/:id/desenhos[...]`,
## CSP imgSrc 'self'); badge 📐 na fila/aba Comercial e seção "DESENHO DE FABRICAÇÃO" na
## Ficha de Produção (imagem inline imprimível; PDF vira link). Validado local com mock. Antes:

## Estado (20/07/2026) — na branch (deploy pendente): F3 BOM+custo na OC; **seleção de
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
