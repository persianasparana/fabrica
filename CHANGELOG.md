# CHANGELOG — Fábrica / PCP + Qualidade

Histórico legível por **data** (o repo não versiona por número). Reconstruído em 16/11/2026 a
partir do `git log` e das seções "Estado" do `CLAUDE.md`; entradas mais novas no topo.
**"Muda preço?"**: nunca — o PCP não calcula preço (preço é do Comercial + Núcleo). Migrations
deste módulo rodam **no boot** (`server/src/db.js`), por isso "migration: no boot" quer dizer
"só reiniciar o serviço". "Deploy" = script em `deploy/`; produção = linha em
`deploy/REGISTRO-DEPLOYS.md`.

## 25/11/2026 — lista de materiais COMO A VENDA COTOU (pendente de deploy)
- **O que estava errado** (medido na réplica; as mesmas três diferenças que o Comercial fechou na
  recotação dele, v2.139.1): `nucleo-spec.js corpoDaPeca` fixava os códigos efetivos gravados na
  venda e o Núcleo trata sku fixado de outro jeito — peça manual da linha "tubo 53" listada com o
  perfil do tubo 47; troca de tela listada como a peça inteira (15 componentes); peça larga de
  coleção com rolos de duas larguras em "peças que não calcularam" (422 `peca_excede_rolo`).
- **Agora**: o corpo vai como a tela do Comercial — produto pelo cadastro do tipo de peça que o
  Comercial manda em `nucleoCotacao` (seleção automática, somente tecido, sentinela/sku, tubo
  equiparado) e tecido pela coleção. Os códigos gravados viram **reserva**: peça que não calcula
  ou calcula outra estrutura que a vendida volta por eles (`corposDaPeca`, `calcularComReserva`).
  Varredura de 51.816 vendas simuladas: nenhuma peça que calculava deixou de calcular; a lista
  nova é igual à da venda em 100%; 4,2% passaram a calcular, 3,6% trocaram o tubo para o da
  linha, 8,1% (trocas de tela) ficaram só com o tecido.
- Ficha de Produção: nota no item ("SOMENTE TECIDO (troca de tela)…", "lista pelos códigos
  gravados na venda…"). `GET /pcp/pedido/materiais`: `por_item[].notas/so_tecido`,
  `itens_sem_cotacao`, `reservas` (aditivo). A baixa de materiais da 1ª bipagem usa a mesma decisão.
- Peças já na fila: `bin/completar-spec-nucleo.js` relê o pedido no Comercial e acrescenta
  `spec_nucleo.cotacao` (só onde falta). `bin/conferir-lista-materiais.js` sonda os provedores.
- Testes: `server/test/nucleo-spec.test.mjs` (64 verificações, sem banco) entra no `npm test` e no CI.
- Deploy: `deploy/aplicar-lista-como-a-venda.sh` (com `deploy/lib-estado.sh`, trazido do Núcleo:
  log em `deploy/logs/` + linha FALHOU/INTERROMPIDO no registro). **Ordem: Núcleo v14.97 →
  Comercial v2.140.1 → Fábrica** (o script sonda os dois e aborta dizendo o que aplicar).
- Migration: não. Muda preço? Não (o PCP não calcula preço).

## 16/11/2026 — revisão da federação (working tree; ainda sem deploy)
- `SESSION_SECRET` passou a ser **obrigatória**: sem ela o `fabrica-server` aborta o boot com
  mensagem clara (antes havia um segredo padrão no código). Conferir o `server/.env` antes do
  próximo restart — o `deploy/install.sh` já a gera desde 10/06/2026.
- CI (`.github/workflows/ci.yml`): smoke test ajustado ao **410** de `POST /api/pcp/itens[/lote]`
  (peças de teste entram por SQL); passos `npm run check` e `npm test` novos.
- `server/package.json`: scripts `test` (sequenciador de carga) e `check` (`node --check`).
- `server/.env.example`: removida `PCP_DIST` (nunca foi lida — o código lê `PCP_DIR`);
  acrescentadas `PCP_DIR` (comentada), `NODE_ENV`, `ECOMMERCE_FOTOS_DIR`, `CICLO_RETRY_MS`,
  `COMPRAS_RETRY_MS`, com comentários; `SESSION_SECRET` marcada como obrigatória.
- Vendor: `pdf.min.js`, `pdf.worker.min.js` e `xlsx.full.min.js` apagados (sem referência desde
  o P0); `qrcode.js` fica. `docs/diag-servidor.sh` → `deploy/diag-servidor.sh`.
- `routes/qualidade.js`: PUT/DELETE de NC devolvem `{ ok: true, message }` (aditivo).
- Documentação padrão da federação: `README.md`, `docs/README.md`, `docs/VISAO-GERAL.md`,
  `docs/API.md`, `CHANGELOG.md`, `deploy/README.md`, `.editorconfig`; `DEPLOYMENT.md`,
  `ARCHITECTURE.md`, `INTEGRACAO.md`, `SERVIDOR-COMPARTILHADO.md`, `server/README.md`,
  `pcp/README.md`, `CLAUDE.md` atualizados ao estado real (P3 em produção).
- Migration: não. Deploy: entra no próximo script cumulativo.

## 10/11/2026 — P3 do planejamento EM PRODUÇÃO (commit `44bde24`)
- `deploy/aplicar-planejamento-p3.sh` publicou P0 + P2 + P1 + P3 de uma vez (migrations no boot).
  Envs `COMPRAS_API_BASE`/`COMPRAS_SERVICE_KEY` e `PRODUTOS_LISTA_MATERIAIS_ENABLED=1` gravadas
  pelo roteiro (`docs/ROTEIRO-DEPLOY-PLANEJAMENTO.md`). Health OK.

## 09/11/2026 — revisão adversarial P1/P3 (`564d58f`)
- Falta desconta o que já está a caminho (reservado/em OC); baixa parcial deixa a peça aberta;
  pendência bloqueada da outbox pode ser reenviada; outbox do Compras limpa na exclusão do
  pedido; payload da Necessidade = só as peças do horizonte. Sem migration.

## 06/11/2026 — Planejamento de produção P0 → P2 → P1 → P3 (espec `docs/ESPEC-PLANEJAMENTO-PRODUCAO.md`)
- **P0** (`da89578`): `pcp_itens.spec_nucleo` (a peça como foi vendida) gravado na liberação;
  lista de materiais pelo Núcleo v14.88 (`GET /api/pcp/pedido/materiais`) na Ficha de Produção;
  estruturas ganham `produto_sku` por de-para; linhas sem estrutura local ("pelo Núcleo") com
  roteiro por linha; **entrada manual e importação Excel/PDF removidas** (`POST /itens[/lote]`
  → 410); modal "Ver" da fila não apaga mais `produto_id`. Migration: no boot.
- **P2** (`5c5b256`): aba **Planejamento de carga** — capacidade por setor (`pcp_setores.capacidade_dia`),
  prioridade do item (`pcp_itens.prioridade`), calendário (`pcp_config.carga_cfg`), sequenciador
  puro `server/src/carga.js` (teste `server/test/carga.test.mjs`). Migration: no boot.
- **P1** (`f2229c6`): aba **Necessidade de materiais** — horizonte "liberado e não cortou",
  tecido por coleção × cor × rolo, perfis em barras, componentes, CSV; lista de materiais em
  blocos de ≤250 peças. Sem migration.
- **P3** (`d3180dd`): integração com o **Compras** — saldo/falta por sku, "Requisitar ao
  Compras" (`pcp_requisicoes`, idempotente), baixa de materiais na 1ª bipagem e manual,
  outbox `pcp_compras_pendencias` com reenvio. Migration: no boot.
- Deploy: `aplicar-planejamento-p0/p1/p2/p3.sh` (o p3 cobre todos).

## 03/11/2026 — atributos `curvas_trilho` e `cor_trilho` na Ficha/etiqueta (`ff75230`)
- Par do Comercial v2.130.0 / Núcleo v14.86 (trilho suíço caixa alta). Sem migration; deploy `git pull` + restart.

## 29/09/2026 — atributo `altura_comando` na Ficha/etiqueta (`681fa9c`) · 28/09 — `revestimento_bando` (`25d2b0b`)
- Pares do Comercial v2.122.0/v2.121.0. Sem migration.

## 02–03/09/2026 — perfil de afastamento na Ficha e etiqueta (`87dcd08`, `0f3650e`) · 01/09 — profundidade e cor no painel (`9f86444`)
- Atributo legível "Perfil … — laterais + inferior + superior"; visual do painel no padrão do Compras. Sem migration.

## 20/08/2026 — fix(auth): login recusava credencial certa (`e981f14`) — **PENDENTE DE DEPLOY**
- Caixa do nome de usuário e bloqueio por IP (`TRUST_PROXY`). Só na branch de federação; precisa
  ir à `claude/unified-server-status-7633oz` e ser publicado.

## 14/08/2026 — acessório do Comercial não entra na fila (`e06a710`)
- A liberação pula itens ACESSORIO (par da Agenda v2.61.0). Sem migration.

## 09–10/08/2026 — plano de corte só pelo Núcleo (`3eb74ea`, `6dfb28d`, `16925e6`, `0c9f914`)
- OC local aposentada: a aba abre `plano-corte-nucleo.html`; tecido/bobinas + saída de perfis
  no plano; peça "somente box" vai sem guias; acabamento com "box" corta a variante certa.

## 07/08/2026 — desenhos de fabricação/instalação do Comercial no PCP (`b127d6d`)
- Flags em `pcp_pedido_info`, proxy do arquivo, badge na fila e seção na Ficha. Migration: no boot.
  Em produção desde 10/11 (entrou no deploy do P3).

## 03/08/2026 — Plano de Corte do pedido via Núcleo (`a9009df`) — EM PRODUÇÃO (registro 03/08)
- Rota `/plano-nucleo`, página imprimível, `pcp_itens.produto_sku`. Deploy `aplicar-plano-corte-nucleo.sh`.

## 20–21/07/2026 — F3 BOM+custo na OC + seleção de estrutura por SKU (`36a0a71`, `06f5dbe`) — EM PRODUÇÃO (registro 21/07)
- Saída de Materiais enriquecida com o BOM do Núcleo (`PRODUTOS_BOM_ENABLED`); estrutura casada
  pelo `produtoSku` do pedido (regra > sku > nome > pendente); campo SKU no editor.

## 13–16/07/2026 — Ordem de Corte, Ficha de Produção e fixes da revisão federada
- OC no formato das planilhas + desenho das barras + saída de perfis (`5231278`); componentes/BOM
  na OC; altura do comando por peça; reordenar cortes; ficha com peças separadas; estrutura
  conferível antes de liberar + Ficha imprimível (`ec4d53b`); ficha com infos do pedido +
  categorias de tecido + etiquetas completas (`e997945`); outbox do ciclo (`382fb12`);
  `audit_log.entity_id` VARCHAR (`c10688b`); excluir pedido limpa infos e pendências (`5b1c80e`).

## 06–07/07/2026 — ciclo do pedido (Fase B/C), etiquetas, regras, expedição, fotos, manual
- Fase B: avaliação do PCP + produção com o Comercial (`cdcd86d`); etiquetas próprias + spec
  estruturada (F1+F2, `f5bc8e0`); seleção automática da Estrutura por regras (F3+F4, `0c187a3`);
  expedição com gavetas + avanço automático do ciclo (`285f4a4`); login split-screen (`ad16e90`);
  erros 502/503 chegam ao navegador e 401 do Comercial não desloga (`e35b354`, `58ee75e`);
  aba Manual (`70bea75`); mini-PWA Fotos p/ e-commerce (`8d105c5`).

## 11–23/06/2026 — novo modelo do PCP
- Novo modelo de planejamento + Estrutura do Produto (`6ee6ede`); bipagem por peça; novo pedido
  em 2 etapas (removido em 06/11); editar pedido em massa; status configuráveis; setores +
  usuários com permissão por aba; estrutura com cortes por setor + roteiro; bipagem por setor
  com dependências e baixa; editar status; `bin/reset-senha.js` (`bf9501d`); fix edição de usuário.

## 09–10/06/2026 — base do monorepo
- Qualidade (identidade visual, segurança, UX); identidade visual oficial (`58d9430`); instalador
  único `deploy/install.sh` (`017b92d`); PCP migrado do app Vite/React + PHP para o backend
  unificado Node + PostgreSQL.
