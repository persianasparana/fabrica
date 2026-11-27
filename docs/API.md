# API — Fábrica / PCP + Qualidade (todas as rotas)

Gerado a partir de `server/src/routes/*.js`, montados em `server/src/server.js` (16/11/2026).
Prefixo interno `/api` (pela rede, `https://192.168.0.207/fabrica/api`).

**Convenções**
- Autenticação por **sessão em cookie** (`fabrica.sid`) — todas as rotas abaixo exigem login
  (`requireAuth`, 401 "Não autenticado"), exceto `POST /api/auth/login`, `GET /healthz` e a
  seção de integração (que usa `X-API-Key`).
- **CSRF** = a rota exige o header `X-CSRF-Token` (token devolvido em `/auth/login` e
  `/auth/session`); 403 "Token CSRF inválido ou ausente".
- **Quem pode** = `admin` (role) ou a permissão por aba exigida de um `user`
  (`requirePerm(aba, 'ver'|'editar')`; admin sempre pode; 403 "Sem permissão para …").
  "autenticado" = qualquer usuário logado. Só as escritas são gateadas no servidor; o "ver"
  por aba é aplicado no frontend.
- **Erros**: JSON `{ "error": "mensagem em PT-BR" }` — este módulo **não usa códigos
  `snake_case`** (diferente dos irmãos); o que distingue é o status HTTP: 400 parâmetro
  obrigatório, 401 sem login/chave, 403 permissão/CSRF, 404 não encontrado, 409 conflito,
  410 rota aposentada, 422 validação, 429 login bloqueado, 502 vizinho inacessível/chave de
  serviço recusada, 503 integração não configurada, 500 erro interno (mensagem mascarada).
- IDs `BIGINT` chegam como **string** no JSON.

## `/healthz` (server.js)

| Método | Caminho | Quem pode | O que faz |
|---|---|---|---|
| GET | `/healthz` | público | `{ ok: true }` — usado pelo Nginx/PM2/scripts de deploy |

## `/api/auth` — `routes/auth.js`

| Método | Caminho | Quem pode | CSRF | O que faz | Erros |
|---|---|---|---|---|---|
| POST | `/auth/login` | público | não | `{username, password}` → `{user, csrf_token}` + cookie | 401 inválido · 429 bloqueado (por usuário `MAX_LOGIN_ATTEMPTS` / por IP `MAX_LOGIN_ATTEMPTS_IP`, `LOCKOUT_SECONDS`) |
| GET | `/auth/session` | autenticado | não | Usuário atual + `csrf_token` | 401 |
| POST / DELETE | `/auth/logout` | autenticado | não | Encerra a sessão | — |

`user` = `{ id, username, full_name, role, permissoes, setores:[id] }`.

## `/api/pcp` — fila, pedido, bipagem, estrutura, status, tipos (`routes/pcp.js`)

| Método | Caminho | Quem pode | CSRF | O que faz | Erros |
|---|---|---|---|---|---|
| GET | `/pcp/itens` | autenticado | não | Fila inteira (itens com `pecas[]`, status, tipo, `spec_nucleo`/`tem_spec`, prioridade; desde 27/11/2026 `grupo_pedido` — o ambiente do pedido em que a peça foi lançada — e `ambiente_origem` `'peca'`\|`'bloco'`\|null: de onde veio o `ambiente`) | — |
| POST | `/pcp/itens` | — | sim | **410** — entrada manual saiu do PCP (P0, 05/11/2026): cadastre no Comercial e libere na aba Pedidos Comercial | 410 |
| POST | `/pcp/itens/lote` | — | sim | **410** — importação Excel/CSV/PDF saiu do PCP | 410 |
| PUT | `/pcp/itens?id=N` | fila:editar | sim | Atualização parcial (datas, tipo, motivo, `especial`, `status_id`, `prioridade`, `qnt`, estrutura `produto_id`, `produto_sku`, coleção, cores, acionamento, ambiente) | 400 sem id · 404 · 422 status/tipo inexistente | **27/11/2026:** quem muda o `ambiente` marca `ambiente_origem` (`'peca'`; `'bloco'` se o texto é o do próprio `grupo_pedido`) — é o cômodo que o plano de corte do tecido usa; sem mexer no ambiente a origem fica.
| DELETE | `/pcp/itens?id=N` | fila:editar | sim | Exclui o item (cascata nas peças) | 400 · 404 |
| GET | `/pcp/carga?inicio=&semanas=` | fila:ver | não | Planejamento de carga: dias por setor (capacidade × programado), previsão por peça/item, alertas | — |
| GET | `/pcp/carga/cfg` | autenticado | não | `{cfg, padrao}` do calendário (dias úteis, folga, semanas) | — |
| PUT | `/pcp/carga/cfg` | admin | sim | Grava o calendário em `pcp_config.carga_cfg` | 422 |
| POST | `/pcp/carga/previsoes` | fila:editar | sim | Grava a previsão calculada em `pcp_itens.prev_producao` (idempotente) | — |
| GET | `/pcp/necessidade?horizonte=nao_cortou\|abertos\|pedidos&ate=&pedidos=a,b[&formato=csv]` | fila:ver | não | Necessidade de materiais consolidada pelo Núcleo (tecido por coleção × cor × rolo, perfis, tubos, componentes) + saldo/falta do Compras | 502/503 via mensagem na resposta (não derruba) |
| POST | `/pcp/necessidade/requisitar` | fila:editar | sim | Abre solicitação de compra no Compras (idempotente por `origem_ref`); 201 criada · 200 já existia · 202 pendente (outbox) | 400 sem itens · 503 integração desligada |
| GET | `/pcp/necessidade/requisicoes?atualizar=1` | fila:ver | não | Requisições feitas (SC, situação, pendente de envio) | — |
| POST | `/pcp/pedido/baixa-materiais` `{pedido}` | fila:editar | sim | Baixa manual dos materiais das peças do pedido no Compras (idempotente por peça) | 400 · 404 · 503 |
| GET | `/pcp/pedido/baixa-materiais?pedido=` | fila:ver | não | Estado da baixa por peça | 400 |
| GET | `/pcp/pedido/materiais?pedido=\|pedidos=a,b` | autenticado | não | Lista de materiais do(s) pedido(s) pelo Núcleo (sem dinheiro), por item e consolidada. Desde 25/11/2026 a peça é pedida **como a venda cotou** (ver "Lista de materiais — o corpo que vai ao Núcleo"): `por_item[id]` ganhou `notas[]` (texto para a Ficha) e `so_tecido`; a resposta ganhou `itens_sem_cotacao[]` (ids de itens liberados antes de o Comercial informar como a peça foi cotada) e `reservas[]` (`{ref, pedido, motivo, nota}` — peças listadas pelos códigos gravados na venda). Chaves só acrescentadas Desde 26/11/2026: cada peça vai ao Núcleo com o `pedido` dela, um pedido nunca é partido em blocos (até 2.000 peças) e `data.plano_tecido[]` traz o **plano de corte do tecido** de cada pedido × tecido (Núcleo v14.98: `{pedido, colecao, cor, pecas, ambientes[{ambiente, largura_rolo, pecas}], larguras[], rolos[{largura_rolo, comprimento, shelves[{comprimento, pecas[{ref, largura, altura, rotacionado, ambiente}]}]}], fora_do_rolo[]}`; lista vazia com a regra desligada no Núcleo; ausente com Núcleo anterior) | 400 | **27/11/2026 (Núcleo v14.100):** a peça vai com `ambiente` = o grupo do pedido e `ambiente_peca` = o cômodo escrito nela; `data.plano_tecido[]` traz `ambientes[]` (cômodo → largura, com `origem`/`blocos`), `ambientes_parecidos[]`, e os rolos (`larguras[].bobinas`/`ponta_m`, `rolos[].bobinas[]`, `rolos[].shelves[].bobina`); `data.tecido[].bobinas` pelo encaixe.
| GET | `/pcp/pedido/producao?pedido=` | fila:ver | não | **Produção por etapas** (27/11/2026): os documentos separados do pedido, num JSON só (sem dinheiro) — `por_partes{ativo, automatico, forcado}`, `resumo`, `pecas[]` (etiqueta, item, parte, cômodo, cortes de perfil em cm, corte do tecido, rolo/faixa), `tecido[]` (coleção × cor → larguras → rolos → faixas → peças), `tecido_fora_do_plano[]`, `perfis[]` (perfil → barras → cortes), `partes[]` (cômodos, componentes e `andamento` por setor/embaladas/guardadas/pronta), `compra{tecido (em rolos), perfis (em barras), componentes}`, `avisos[{texto, docs}]`, `impressoes` (o que já foi impresso, por documento e por parte). Plano de corte e lista de materiais vêm do Núcleo em paralelo; cada um falha sozinho (o documento diz o que ficou de fora) | 400 · 404 |
| POST | `/pcp/pedido/producao/impressao` `{pedido, doc: partes\|compra\|tecido\|perfis\|montagem, parte?}` | fila:ver | sim | Registra a impressão de UM documento (log `pcp_ordem_corte_log`, `modo = 'prod-<doc>'`; na montagem de uma parte, `detalhe` = a parte) e devolve `{reimpressao, impressoes}` | 400 · 404 · 422 documento inválido |
| PUT | `/pcp/pedido/producao/por-partes` `{pedido, por_partes: true\|false\|null}` | fila:editar | sim | O PCP define se o pedido é produzido e instalado por partes (`null` = automático: dois grupos ou mais e o cômodo escrito na maioria das peças). Grava `pcp_pedido_info.por_partes`; auditado | 400 · 404 · 422 |
| GET | `/pcp/pedido?pedido=NNN` | autenticado | não | Itens/peças do pedido + `info` (cliente, vendedor, prazo, desenhos) | 400 · 404 |
| PUT | `/pcp/pedido?pedido=NNN` | pedido:editar | sim | Edição em massa de todos os itens + `acao: 'concluir'\|'reabrir'` (todas as peças), `status_id`, `prioridade` | 400 · 404 · 422 |
| DELETE | `/pcp/pedido?pedido=NNN` | pedido:editar | sim | Exclui o pedido inteiro (+ `pcp_pedido_info`, pendências do ciclo e saídas pendentes do Compras) | 400 · 404 |
| POST | `/pcp/bip` `{codigo, setor_id, evento}` | bipagem:editar | sim | Bipagem por setor: `acao` = `inicio` \| `fim` \| `baixa` \| `jafoi` \| `desconhecido`. 1ª bipagem baixa materiais no Compras e avança o pedido federado | 409 dependência do roteiro · 422 setor fora do roteiro / fim sem início / código vazio · 404 setor |
| POST | `/pcp/bip/vincular` `{codigo, pedido}` | autenticado | sim | Vincula etiqueta à próxima peça livre do pedido e registra a chegada | 409 etiqueta já usada / sem peça livre · 404 pedido · 422 |
| PUT | `/pcp/pecas?id=N` | fila:editar | sim | Por peça: `{cod_barras:null}` desvincula; `{conclusao}` baixa/reabre; `largura`, `altura`, `medidas` (cm) | 400 · 404 · 409 etiqueta duplicada · 422 |
| GET | `/pcp/estrutura` | autenticado | não | Estruturas ativas (cortes com setor, componentes, roteiro, `produto_sku`) | — |
| POST | `/pcp/estrutura` | estrutura:editar | sim | Cria estrutura | 422 |
| PUT | `/pcp/estrutura?id=N` | estrutura:editar | sim | Atualização parcial (preserva `key` dos cortes) | 404 · 422 |
| DELETE | `/pcp/estrutura?id=N` | estrutura:editar | sim | Desativa (lógico) | 404 |
| GET | `/pcp/status` | autenticado | não | Status de produção ativos (`final` marca o que dá baixa) | — |
| POST / PUT / DELETE | `/pcp/status[?id=N]` | admin | sim | Mantém status (nome, cor, ordem, `final`) | 404 · 409 em uso · 422 |
| GET | `/pcp/tipos` | autenticado | não | Tipos de entrada de pedido (cor, ordem, padrão) | — |
| POST / PUT / DELETE | `/pcp/tipos[?id=N]` | tipos:editar | sim | Mantém tipos (renomear reflete nos itens; o padrão é o pré-selecionado) | 404 · 409 · 422 |

## `/api/pcp` — setores e usuários (`routes/admin.js`)

| Método | Caminho | Quem pode | CSRF | O que faz | Erros |
|---|---|---|---|---|---|
| GET | `/pcp/setores` | autenticado | não | Setores (status associado, `ordem_corte`, `capacidade_dia`) | — |
| POST / PUT / DELETE | `/pcp/setores[?id=N]` | admin | sim | Mantém setores (`capacidade_dia`: `''`/`null` limpa, ausente preserva, texto = 422) | 404 · 409 · 422 |
| GET | `/pcp/usuarios` | admin | não | Usuários com `permissoes` e `setores` | — |
| POST | `/pcp/usuarios` | admin | sim | Cria `{username, password, full_name, role, permissoes, setores}` | 409 · 422 |
| PUT | `/pcp/usuarios?id=N` | admin | sim | Atualiza (inclui `password`, `active`) | 404 · 422 |
| DELETE | `/pcp/usuarios?id=N` | admin | sim | Exclui (não o último admin, nem a si) | 404 · 409 |

Abas válidas em `permissoes`: `painel, fila, alertas, carga, necessidade, busca, pedido,
indicadores, bipagem, estrutura, tipos, comercial, etiquetas, expedicao` (`ABAS` em `admin.js`).

## `/api/pcp/ordem-corte` (`routes/ordem-corte.js`) — todos autenticados

| Método | Caminho | Quem pode | CSRF | O que faz | Erros |
|---|---|---|---|---|---|
| GET | `/ordem-corte/preview?pedidos=a,b&setor_id=N` | autenticado | não | Cortes calculados por setor (usado pela Ficha de Produção) | 400 |
| GET | `/ordem-corte/status?pedidos=a,b` | autenticado | não | Se já foi impresso + histórico | — |
| POST | `/ordem-corte/imprimir` `{pedidos, setor_id?, modo}` | autenticado | sim | **Legado** (OC local aposentada em 09/08/2026; sem ponto de entrada na UI) | — |
| POST | `/ordem-corte/registrar` `{pedidos}` | autenticado | sim | Registra impressão do plano do Núcleo (log/reimpressão) | 400 |
| GET | `/ordem-corte/plano-nucleo?pedido=X` | autenticado | não | Plano de corte via Núcleo de Produtos (`POST /plano-corte` lá) | 503 sem `PRODUTOS_SERVICE_KEY` · 502 Núcleo fora · 404 pedido |
| POST | `/ordem-corte/plano-nucleo` `{pedido, overrides}` | autenticado | sim | Idem, com variante de peça escolhida pelo operador | idem |
| GET | `/ordem-corte/log?pedido=X` | autenticado | não | Histórico recente | — |

## `/api/pcp/etiquetas` (`routes/etiquetas.js`)

| Método | Caminho | Quem pode | CSRF | O que faz | Erros |
|---|---|---|---|---|---|
| GET | `/etiquetas/campos` | autenticado | não | Dicionário de campos disponíveis para o modelo | — |
| GET | `/etiquetas/modelos` | autenticado | não | Modelos ativos (editor/preview) | — |
| POST / PUT / DELETE | `/etiquetas/modelos[?id=N]` | admin | sim | Cria / atualiza / desativa modelo (formato mm, setores, campos, código) | 404 · 422 |
| GET | `/etiquetas/dados?pedidos=a,b[&setores=1,2]` | etiquetas:ver | não | Prévia dos dados (sem registrar) | 400 | (cada etiqueta traz `ambiente` — o cômodo da peça — e, desde 27/11/2026, `grupo_pedido` quando o ambiente não é o próprio grupo; o campo `grupo_pedido` está no dicionário de `GET /etiquetas/campos`)
| POST | `/etiquetas/imprimir` `{pedidos, setor_ids?, peca_ids?}` | etiquetas:editar | sim | Gera códigos faltantes + registra log + devolve os dados de impressão | 400 |
| GET | `/etiquetas/log?pedido=x` | etiquetas:ver | não | Histórico recente | — |

## `/api/pcp/estrutura-regras` (`routes/estrutura-regras.js`)

| Método | Caminho | Quem pode | CSRF | O que faz | Erros |
|---|---|---|---|---|---|
| GET | `/estrutura-regras/campos` | autenticado | não | Campos + operadores das condições | — |
| GET | `/estrutura-regras/` | estrutura:ver | não | Regras (inclusive inativas) | — |
| POST | `/estrutura-regras/` | estrutura:editar | sim | Cria regra `{descricao, produto_id, prioridade, condicoes[]}` | 422 |
| PUT | `/estrutura-regras/?id=N` | estrutura:editar | sim | Atualiza regra | 404 · 422 |
| DELETE | `/estrutura-regras/?id=N` | estrutura:editar | sim | Exclui regra | 404 |
| POST | `/estrutura-regras/testar` `{spec}` | estrutura:ver | não | Avalia uma peça de exemplo (não grava) | 422 |
| POST | `/estrutura-regras/aplicar` `{pedidos?, sobrescrever?}` | fila:editar | sim | (Re)aplica as regras na fila em aberto | — |
| GET | `/estrutura-regras/categorias-colecao` | estrutura:ver | não | Categoria de tecido por coleção (variável `categoria` das regras) | — |
| POST / DELETE | `/estrutura-regras/categorias-colecao` | estrutura:editar | sim | Grava / remove categoria de uma coleção | 422 |

## `/api/pcp/expedicao` (`routes/expedicao.js`)

| Método | Caminho | Quem pode | CSRF | O que faz | Erros |
|---|---|---|---|---|---|
| GET | `/expedicao/gavetas` | autenticado | não | Gavetas com ocupação | — |
| POST / PUT / DELETE | `/expedicao/gavetas[?id=N]` | expedicao:editar | sim | Cria / atualiza / desativa (só vazia) | 404 · 409 · 422 |
| POST | `/expedicao/guardar` `{codigo, gaveta_id}` | expedicao:editar | sim | Guarda/transfere a peça embalada; com todas as peças do PED- guardadas avança para `NA_EXPEDICAO` (outbox se o Comercial cair) | 404 etiqueta · 409 peça sem baixa · 422 |
| POST | `/expedicao/retirar` `{codigo}` | expedicao:editar | sim | Saída para instalação | 404 · 422 |
| GET | `/expedicao/mapa` | autenticado | não | Gavetas com as peças dentro | — |
| GET | `/expedicao/pedido?pedido=X` | autenticado | não | Onde está cada peça do pedido | 400 |
| GET | `/expedicao/log?pedido=X` | autenticado | não | Movimentações recentes | — |

## `/api/pcp/fotos-ecommerce` (`routes/fotos-ecommerce.js`) — mini-PWA `/pcp/fotos/`

| Método | Caminho | Quem pode | CSRF | O que faz | Erros |
|---|---|---|---|---|---|
| GET | `/fotos-ecommerce/` | autenticado | não | Registros (com contagem e 1ª foto) | — |
| POST | `/fotos-ecommerce/` | autenticado | sim | Cria registro (spec da peça fotografada) | 422 |
| PUT | `/fotos-ecommerce/?id=N` | autenticado | sim | Atualiza spec | 404 |
| DELETE | `/fotos-ecommerce/?id=N` | autenticado | sim | Exclui registro + fotos do disco | 404 |
| POST | `/fotos-ecommerce/:id/foto` (corpo binário `image/*`) | autenticado | sim | Upload da foto comprimida (sem multer; `express.raw`) | 404 · 413 · 415 |
| GET | `/fotos-ecommerce/foto/:arquivoId` | autenticado | não | Stream da foto (nunca público) | 404 |
| DELETE | `/fotos-ecommerce/foto/:arquivoId` | autenticado | sim | Exclui uma foto | 404 |
| GET | `/fotos-ecommerce/export.csv` | autenticado | não | Specs + links para o e-commerce | — |

Pasta das fotos: `ECOMMERCE_FOTOS_DIR` (padrão `<repo>/uploads/ecommerce`, fora do git).

## `/api/qualidade` (`routes/qualidade.js`)

| Método | Caminho | Quem pode | CSRF | O que faz | Erros |
|---|---|---|---|---|---|
| GET | `/qualidade/ncs[?id=N]` (filtros `status, impacto, data_inicio, data_fim`) | autenticado | não | Lista / lê NC | 404 |
| POST | `/qualidade/ncs` | autenticado | sim | Cria NC (`data_ocorrencia`, `descricao` obrigatórios) → `{id}` | 422 |
| PUT | `/qualidade/ncs?id=N` | autenticado | sim | Atualização parcial → `{ok, message}` | 400 · 404 · 422 |
| DELETE | `/qualidade/ncs?id=N` | autenticado | sim | Remove → `{ok, message}` | 400 · 404 |
| GET | `/qualidade/kpis` | autenticado | não | Indicadores agregados (status, impacto, origens, setores) | — |

## `/api/comercial` — ciclo do pedido, Fases B/C (`routes/comercial.js`)

Todas chamam o **Comercial** (:3010) com `X-Service-Key` (`COMERCIAL_API_BASE` /
`COMERCIAL_SERVICE_KEY`). Erros de integração chegam ao navegador: **503** integração não
configurada · **502** Comercial inacessível ou chave de serviço recusada (nunca 401/403, que
deslogariam o usuário).

| Método | Caminho | Quem pode | CSRF | O que faz | Erros |
|---|---|---|---|---|---|
| GET | `/comercial/pedidos?status=` | comercial:ver | não | Fila do Comercial (`GET /pedidos?status=`; padrão `EM_ANALISE_PCP`) | 502 · 503 |
| GET | `/comercial/pedidos/:id` | comercial:ver | não | Detalhe (itens + spec + cliente) | 404 · 502 · 503 |
| GET | `/comercial/pedidos/:id/desenhos` | comercial:ver | não | Lista desenhos de fabricação/instalação | 502 · 503 |
| GET | `/comercial/pedidos/:id/desenhos/:desenhoId/arquivo` | comercial:ver | não | Proxy binário do desenho (CSP `imgSrc 'self'`) | 404 · 502 |
| GET | `/comercial/pedidos/:id/estrutura-previa` | comercial:ver | não | Por item, a estrutura que a liberação escolheria (override > regra > SKU > nome > "pelo Núcleo" > pendente) | 502 · 503 |
| POST | `/comercial/pedidos/:id/devolver` `{motivo}` | comercial:editar | sim | `DEVOLVIDO_PCP` com o motivo (vendedor corrige a spec) | 422 motivo · 502 |
| POST | `/comercial/pedidos/:id/liberar` | comercial:editar | sim | `LIBERADO_PRODUCAO` + importa itens/peças para a fila com `spec_nucleo` e `pcp_pedido_info` (**idempotente por PED-**; acessório é pulado). Desde 25/11/2026 a spec guarda `cotacao {produto, tubo_equiparado}` quando o item do Comercial traz `nucleoCotacao` (v2.140.1) | 409 · 502 |
| POST | `/comercial/pedidos/:id/status` `{status}` | comercial:editar | sim | Avança o estado federado: só `EM_PRODUCAO`, `EMBALADO`, `NA_EXPEDICAO` | 422 status · 502 |

## Lista de materiais — o corpo que vai ao Núcleo (25/11/2026)

`server/src/nucleo-spec.js` (puro, teste `server/test/nucleo-spec.test.mjs`) monta, por peça, o
corpo do `POST /lista-materiais` **como a venda cotou** — o mesmo que a tela do Comercial manda ao
`/precificar` (Comercial v2.139.1):

| Parte | Regra | De onde vem |
|---|---|---|
| Produto | `spec_nucleo.cotacao.produto`: `__auto` → sem `produto_sku` (o Núcleo escolhe estrutura e tubo pela coleção + medidas); `__so_tecido` → `so_tecido: true`; sentinela (`__ph50`, `__painel`) ou sku → `produto_sku` | `nucleoCotacao.produto` do item do pedido (cadastro "Tipos de peça" do Comercial) |
| Tubo equiparado | `tubo_equiparado` junto da seleção automática | `nucleoCotacao.tuboEquiparado` (regra do Comercial, já resolvida) |
| Tecido | `colecao` (+ `cor`); `tecido_sku` só sem coleção escrita | colunas do item do PCP › spec |
| Sku FIXO (como antes) | peça sem `cotacao` (liberada antes), tipo que não aponta produto do motor, ou "SKU do Núcleo" trocado no PCP | `pcp_itens.produto_sku` › sku da Estrutura › sku da venda |

**Reserva** (`corposDaPeca` → `calcularComReserva`): os códigos efetivos gravados na venda
(`produto_sku` + `tecido_sku`) formam o corpo de até 25/11. A peça que **não calcula** pelo corpo
como a venda, ou calcula **outra estrutura** que a vendida (o cadastro mudou depois da venda), é
pedida de novo por eles — e a reserva só vale se calculou. Caso normal = 1 chamada por bloco; com
reserva, 2 (3 quando o resultado é misto). `so_tecido` acompanha a peça também na reserva.

Utilitários (em `server/`, com o `.env` do serviço):

| Comando | O que faz |
|---|---|
| `node bin/completar-spec-nucleo.js [--simular] [--pedido PED-…] [--concluidos]` | Acrescenta `spec_nucleo.cotacao` às peças já na fila relendo o pedido no Comercial (só onde falta; idempotente). Saída 0 = tudo completo · 2 = ficou pendência (motivo no texto) · 1 = erro |
| `node bin/conferir-lista-materiais.js --sonda` | Sonda os provedores: Núcleo v14.97 (troca de tela volta só com o tecido) e Comercial v2.140.1 (itens com `nucleoCotacao`). Saída 0 · 3 Núcleo anterior · 4 Comercial anterior · 5 não deu para sondar |
| `node bin/conferir-lista-materiais.js --sonda-plano` | Sonda o Núcleo v14.98 (consumo de tecido pelo plano do pedido): a resposta do `/lista-materiais` traz `plano_tecido`; diz se a regra está desligada no painel do Núcleo. Saída 0 · 3 Núcleo anterior · 5 não deu para sondar |
| `node bin/conferir-lista-materiais.js --sonda-comodo` | Sonda o Núcleo v14.100 (o cômodo pela peça + plano rolo a rolo): a resposta do `/lista-materiais` traz `parametros.comodo_pela_peca` e `plano_rolo_a_rolo`; diz se estão desligadas no painel do Núcleo. Saída 0 · 3 Núcleo anterior · 5 não deu para sondar |
| `node bin/conferir-lista-materiais.js --sonda-corte-sheer` | Sonda o Núcleo v14.101 (no plano de corte por peça, o tecido sheer sai com 2 × altura + folga do tubo): lê a versão do `/api/health` (comparada como número) e diz se a regra está ligada. Saída 0 · 3 Núcleo anterior · 5 não deu para sondar |
| `node bin/conferir-lista-materiais.js --producao [--pedido PED-…]` | Resumo dos documentos da produção por etapas (padrão: o pedido aberto com mais peças): por partes?, tecido por largura (metros e rolos), barras por perfil, andamento das partes |
| `node bin/conferir-lista-materiais.js [--pedido PED-…]` | Resumo da lista de um pedido: peças que calculam, pela reserva, itens sem "como foi cotada", os rolos do plano de corte do tecido, os ambientes das peças, avisos |
| `node bin/completar-ambiente.js [--simular] [--pedido PED-…] [--concluidos] [--detalhe]` | Relê no Comercial o AMBIENTE das peças já na fila ainda não relidas (`ambiente_origem` nulo): grava o grupo do pedido e a origem e, onde o `ambiente` está vazio ou é o nome do bloco, o cômodo escrito na peça (27/11/2026); o que foi digitado no PCP fica; idempotente. Saída 0 · 2 = ficou pendência que depende do Comercial |

## Integração servidor-a-servidor — `/api/integracao` (`routes/integracao.js`)

Consumidor: backend da **Logística** (`persianas-api`). **Não usa sessão nem CSRF**: header
**`X-API-Key`** igual a `INTEGRACAO_API_KEY` do `.env` daqui (= `FABRICA_API_KEY` na
Logística; comparação em tempo constante). É a **exceção** ao padrão `X-Service-Key` da
federação (linha B da matriz do `PROTOCOLO-FEDERACAO.md`). **Somente leitura.**

| Método | Caminho | O que faz | Erros |
|---|---|---|---|
| GET | `/integracao/pedidos?concluidos=1&desde=YYYY-MM-DD&pedido=NNN` | Pedidos agrupados com progresso das peças (`total_pecas`, `pecas_concluidas`, `itens[]`); itens sem número de pedido são ignorados | 422 data inválida |
| GET | `/integracao/peca?codigo=` | Uma peça pela etiqueta: `conclusao`, `gaveta`, `guardada_em`, pedido, produto, progresso do pedido (a Expedição da Logística só aceita se `conclusao != null`) | 422 · 404 |
| GET | `/integracao/expedicao?pedido=` | Localização de todas as peças do pedido nas gavetas: `{pedido, total_pecas, embaladas, guardadas, completo_na_expedicao, pecas[]}` | 422 · 404 |

Comuns às três: **503** `INTEGRACAO_API_KEY` não configurada · **401** chave inválida ou ausente.

**Pedido por partes (27/11/2026 — chaves ADITIVAS; quem não lê segue como antes).** A regra é a dos documentos de
produção (`server/src/producao.js pedidoPorPartes`: dois grupos ou mais no pedido e o cômodo escrito na maioria das
peças, ou o que o PCP definiu). **Consumidas pela Logística v5.47** (expedição, agenda e baixa por parte — é
CONTRATO: `por_partes`, `partes[].{parte, total_pecas, pecas_concluidas, concluida}`, `parte`, `comodo`,
`total_pecas_parte` e `pecas[].codigo` não mudam de nome sem mexer lá):

| Rota | Chaves novas |
|---|---|
| `/integracao/pedidos` | por pedido: `por_partes` (bool) e `partes[]` = `{parte, total_pecas, pecas_concluidas, pecas_guardadas, concluida, na_expedicao}` (vazio no pedido comum) |
| `/integracao/peca` | `por_partes`, `parte` (nulo no pedido comum), `comodo`, `total_pecas_parte`, `pecas_concluidas_parte` |
| `/integracao/expedicao` | `por_partes`, `partes[]` e, em cada peça, `parte` e `comodo` |

## O que a Fábrica CHAMA nos vizinhos (para referência cruzada)

| Vizinho | Rotas (lado deles) | Cliente aqui | Fail-soft |
|---|---|---|---|
| Comercial :3010 | `GET /pedidos?status=` · `GET /pedidos?codigo=` · `GET /pedidos/:id` (cada item com **`nucleoCotacao {produto, tuboEquiparado}`** desde a v2.140.1 — chave aditiva; ausente = Comercial anterior; o **ambiente** da peça é lido de `ambientes[]` pelo `ambienteId` do item — a coluna de texto `ambiente` do item é legada) · `PATCH /pedidos/:id/status` · `GET /pedidos/:id/desenhos[/:id/arquivo]` | `server/src/comercial-client.js` (+ `completar-spec.js`, só leitura) | outbox `pcp_ciclo_pendencias` (`CICLO_RETRY_MS`) |
| Núcleo de Produtos :3070 | `GET /api/v1/catalogo/produtos/:sku/bom` · `POST /api/v1/plano-corte` · `GET /api/v1/plano-corte/variantes` · `POST /api/v1/lista-materiais` (peça **como a venda cotou**; a troca de tela exige o Núcleo **v14.97** para voltar só com o tecido — eco `pecas[].so_tecido`; desde 26/11/2026 cada peça leva o **`pedido`** e a resposta traz **`plano_tecido[]`** — Núcleo **v14.98**) | `server/src/produtos-client.js` | best-effort (null/[]), flags `PRODUTOS_*` |
| Compras :3050 | `GET /api/v1/integracao/estoque/saldos?skus=` · `POST …/solicitacoes-compra` · `GET …/solicitacoes-compra/:numero` · `POST …/estoque/saida-producao` | `server/src/compras-client.js` | outbox `pcp_compras_pendencias` (`COMPRAS_RETRY_MS`) |
