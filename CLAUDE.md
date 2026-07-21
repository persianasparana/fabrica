# CLAUDE.md — Fábrica / PCP (Persianas Paraná)

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
   (F3, com variável `categoria` via `pcp_colecao_categorias`) > nome exato > ⚠ pendente.
3. **Liberar produção** (idempotente por PED-): PATCH status na Agenda + importa itens/
   peças pra fila + grava `pcp_pedido_info` (vendedor/modalidade/obs/prazo — alimenta a
   Ficha offline do Comercial).
4. **Ficha de Produção** (`ficha-producao.html?pedido=PED-…`): specs + infos do pedido +
   **cortes calculados por setor** (seletor de setor). **Ordem de Corte**: tabela
   item×corte igual às planilhas oficiais + SAÍDA DE PERFIS (ceil(metros/barra)) +
   desenho das barras (FFD) + SAÍDA DE MATERIAIS + CSV.
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
