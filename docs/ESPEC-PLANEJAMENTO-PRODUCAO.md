# Espec para decisão — Planejamento de produção no PCP reaproveitando o Núcleo, requisição de compra ao Compras e retomada das Solicitações

**Status:** **decidido pelo cliente em 05/11/2026** (§6 traz as respostas; §4 a ordem de execução).
Nada foi codificado ainda.
**Pedido:** *"melhorar o PCP com o planejamento de produção; fizemos várias melhorias no cálculo de
custo com base na forma de fabricação e preciso implementar essas regras no PCP, que é quem vai
planejar a produção. No PCP não tem onde adicionar um pedido de cortina para calcular o consumo de
tecido e mandar a solicitação para o Compras; os planos de produção são com base só no que já tem
cadastrado lá, sendo que diversas outras fórmulas já implementamos no motor de cálculo e dá para
reaproveitar. Além disso, retomar o sistema de comunicação interna e solicitações (o planejamento
já faria a solicitação de compras) e as melhorias pendentes do Compras."*

Este documento diz **o que existe hoje em cada módulo** (lido no código dos quatro repositórios, não
por suposição), **o que já dá para reaproveitar sem recadastrar fórmula**, **o que falta**, a proposta
em fases e as decisões que só o cliente pode tomar.

---

## 1. Diagnóstico — por que o PCP não planeja hoje

### 1.1 O PCP (Fábrica) só conhece o que está cadastrado NELE

- A **Estrutura do Produto** do PCP (`pcp_produtos`, seed `server/data/estrutura-produtos.json`) tem
  **35 estruturas**: rolôs Soft/Premium/Motorizada/Intermediária/Acoplada (lisa, sheer, vision ×
  trilho plus, bandô vision, box), Romana, Romana de Teto, Painel 3 e 4 vias, PH 25 e PH 50 nos 4
  materiais. **Não existe cortina de tecido, cortina fixa, painel 2 vias, celular, vertical, toldo,
  Plus Size, Vision Sheer, Romana motorizada, Romana de Teto motorizada nem PH50 monocomando/motorizada.**
  É isso que você sentiu: "não tem onde adicionar um pedido de cortina".
- **Nenhuma estrutura tem o SKU do Núcleo** (`produto_sku` vazio em todas): a seleção automática casa
  por regra F3 ou pelo nome exato; o casamento por SKU (que o Comercial manda desde a v2.29.0) nunca
  acontece.
- As fórmulas de tecido do PCP são só a **dimensão do pano** (largura − x, altura + 12/15/20): não há
  metros lineares por rolo, aproveitamento, corte × bobina, lâminas compradas, panos da cortina.
  Tudo isso **já existe no Núcleo** (v14.60 painel por vias, v14.65 abertura da cortina, v14.79 lâminas
  por comprimento comprado, v14.81 aproveitamento por cor, v14.84 via em pé no rolo, v14.87 cortina fixa).
- A **Ordem de Corte local está aposentada desde 09/08**: a aba "Ordem de Corte" abre o **plano de
  corte do Núcleo** (`plano-corte-nucleo.html`) — mas **um pedido por vez**, e o "Tecido do pedido"
  (`resumo_tecido`) sai por coleção e largura de rolo **sem cor, sem aproveitamento entre peças e sem
  somar pedidos**. O BOM do Núcleo (`/catalogo/produtos/:sku/bom`) é chamado com o SKU da **estrutura**
  (que está vazio) e só aparece como "custo estimado" — desligado por padrão (`PRODUTOS_BOM_ENABLED=0`).
- **O cadastro manual "Novo pedido"** existe, mas o formulário não manda SKU do Núcleo, coleção, cor
  nem as opções da peça (o backend até aceita). Sem isso o Núcleo não consegue calcular nada da peça
  criada à mão.
- **Na liberação do Comercial o PCP joga fora a especificação**: `comercial.js` copia tipo, coleção,
  cores, acionamento, medidas, atributos e 5 textos derivados (afastamento, revestimento do bandô,
  altura do comando, curvas e cor do trilho) — e **descarta os JSONB `nucleo_*`** (cortina: peça/estilo/
  mecanismo/volume/barra/abertura; PH50: comando/monocomando; painel: vias/varetas/comando; celular;
  bandô reto; afastamento; tubo manual/equiparado; trilho plus; motor/emissor; rota PH25/vertical).
  O `GET /pedidos/:id` do Comercial **entrega todos esses campos** (todas as colunas de
  `orcamento_itens`), então o dado está disponível e é perdido na porta.
- **Não há planejamento no sentido de carga**: a fila tem datas (`chegada_pcp`, `prev_producao` digitada
  à mão, `data_cliente`), status, bipagem por setor com roteiro e gavetas; **não há prioridade,
  capacidade por setor, calendário, sequenciamento**. A data prometida ao cliente é derivável
  (`aprovadoFinanceiroEm + prazoEntregaDias`, obrigatório desde a v2.25) e o PCP já a grava em
  `data_cliente`.
- **Nada no PCP fala com o Compras**: nenhuma env `COMPRAS_*`, nenhuma "falta de material" calculada;
  "Aguardando material" é só um motivo de atraso digitado.

### 1.2 O Núcleo já calcula quase tudo — mas expõe com buracos

O que **já serve** por chamada de serviço (`X-Service-Key`):

| Rota | O que devolve | Vale para |
|---|---|---|
| `POST /relatorio-orcamento` (até 300 peças, aceita os mesmos campos do `/precificar` + `ambiente`, `qtd`, `cor`, `avulso_sku`) | por peça: produto efetivo, tubo, variante, `tecido_cobrado_m`, emenda, aproveitamento, avisos; **`materiais[]` somados por sku** (qtd, un); **`tecido[]`** por coleção × rolo (metros, metros de bobina, bobinas, sobra, modo corte × bobina); **`perfis[]` em barras** (First-Fit Decreasing com `tamanho_barra`); `tubos[]`; `aproveitamento[]` por ambiente × coleção × cor com desenho | todos os produtos (cortina e cortina fixa saem pela receita + `tamanho_barra`) |
| `POST /plano-corte` (até 500 peças) | corte por peça (linhas com medida em cm) + `resumo_tecido` | rolô, romana, romana de teto, painel 2/3/4, PH50 |
| `GET /catalogo/produtos/:sku/bom` | receita crua × medida | só receita (sem tecido, sem mecanismo da cortina, sem tubo/kit/motor/box/bandô) |
| `GET /catalogo/componentes` · `/tecidos` · `/colecoes` · `/cortina` · `/painel` · `/ph50` · `/parametros` | cadastros com unidade, `tamanhoBarra`, largura do rolo, cores por fornecedor, `metrosBobinaRolo`, lâminas | — |

O que **falta ou está errado** para virar "lista de materiais de produção":

1. **`materiais[]` do relatório não inclui os "adicionais"** (tubo, kit e motor da motorizada,
   emissor, perfil/tampas/escovas do box, bandô, mecanismo motorizado) — eles vivem em `add.*` e não
   são somados. Para a fábrica são material como qualquer outro.
2. **Quantidade derivada do custo**: em `linhas[]` a `qtd` é `valor ÷ custo_unit` e vira **null quando o
   componente tem custo zero** (ex.: escovas e tampas do box, bandô de madeira até ontem). Lista de
   materiais com quantidade nula é inútil para comprar.
3. **Tecido sem cor** no `tecido[]` (a chave é coleção × rolo); só o `aproveitamento[]` separa por cor.
   Compra-se por cor.
4. **PH25 e Vertical** saem sem linhas de material (`sku:null`, lâminas e lamelas só no custo).
5. **Plano de corte × relatório divergem na cortina**: o plano usa `telaMetros` (volume do produto,
   sem barra, sem abertura central) e o relatório usa `telaM` (respeita volume/barra/abertura da venda).
6. **Tudo vem com preço e margem** (`totais`, `venda`, `markup`, `custo_*`): a fábrica não precisa ver
   e, pela regra 4 do PROTOCOLO (bounded contexts), não deveria receber.
7. **Não existe função "BOM de 1 peça em quantidades"** separada do preço: a lista efetiva (com
   trocas de tubo/comando pela banda, box efetivo, variante sheer/motorizada, mecanismo) só nasce
   dentro de `precificarPeca`.

### 1.3 O Compras tem estoque e OC, mas não tem requisição nem consumo

- **Existe**: fornecedores (com `lead_time_dias` e `threshold_frete_gratis`), produtos (vindos do Bling
  ou seed; **sem POST de cadastro e `sku` não é UNIQUE**), `estoque_saldo` (mínimo, ponto de
  ressuprimento, cobertura-alvo), movimentações, OC `OC-2026-0007` com itens/parcelas/PDF/e-mail e
  previsão no Financeiro, NF de entrada → estoque → conta a pagar, preços por fornecedor (metro × bobina),
  fichas de bobina, NC, higienização, cockpit (curva ABC, **sugestão de compra**, simuladores corte × rolo
  e frete), Bling só leitura.
- **Não existe requisição/solicitação de compra** (tabela, rota ou tela) — é o requisito **R12
  "Solicitações do PCP"** do escopo do comprador, documentado e não atendido.
- **A sugestão de compra não enxerga a produção**: ela usa o consumo médio de 90 dias das **saídas**
  registradas, e **nenhuma rota grava `saida_producao`** (o tipo existe no schema, nunca é escrito).
  Só ajustes e perdas entram. Resultado: cobertura em dias e ponto de pedido calculados sobre nada.
- **Ligação com o Núcleo é fraca**: o Núcleo puxa `GET /custos` (custo médio/reposição por `sku` do
  Compras) e casa pelo de-para `custo_fonte` **que vive no Núcleo e só cobre componentes** — tecidos
  (`t0…t296`) não têm de-para. **Não há rota de serviço que devolva saldo por sku**; `/estoque/saldos`
  exige JWT de usuário.
- O estoque **de verdade está no Bling** (decisão de 2026: Bling = ponte temporária); o Compras
  espelha saldos. Importar o histórico de movimentações do Bling segue como decisão em aberto.
- Docs desatualizados: `05-ENTREGUE-E-ROADMAP.md` marca como "a fazer" o dashboard, a sugestão, a
  curva ABC e os simuladores, que já existem; o `CLAUDE.md` diz "deploy pendente" da migration 012,
  aplicada em 16/09. As decisões do `00-CONTEXTO` foram tomadas sobre o "ERP" (React/tRPC/MySQL) que
  não é o `compras-api` em produção.

### 1.4 Solicitações e Comunicados

A espec `logistica/docs/ESPEC-SOLICITACOES-COMUNICADOS.md` (28/10) está pronta e **parada nas 8
decisões** (onde mora, departamentos, quem publica, login, prazos de alerta, app do técnico,
WhatsApp, leitura obrigatória). Ela já previa o tipo *material* endereçado ao departamento
**Compras**. O que este documento acrescenta: a requisição que nasce do **planejamento** precisa ser
**estruturada** (itens com sku, quantidade, unidade, data de necessidade, pedidos de origem) para virar
OC sem redigitação — texto livre não serve.

### 1.5 Defeitos achados de passagem (valem correção mesmo sem o planejamento)

- PCP: o modal de edição do item regrava `produto_id = null` quando o nome do produto não bate com
  o nome de uma estrutura — apaga a estrutura escolhida por regra (`app.js:1527-1534`).
- PCP: `PUT /itens` não atualiza `produto_sku`/`colecao`; o "Novo pedido" não os envia.
- Núcleo: `/bom` com receita que usa a variável `A` (altura do comando) dá 500 em vez de 422.
- Núcleo: `qtd` nula em componente de custo zero (§1.2 item 2); cortina no plano × relatório (item 5).
- Comercial: `GET /pedidos/checklist/:id` aceita só JWT (a chave do PCP não entra) — não bloqueia nada
  hoje, mas é a rota com `prazoEntregaDias`.
- Compras: `produtos.sku` sem UNIQUE; `GET /custos` sem paginação e devolvendo inativos; `/custos`
  documentado como `autenticarOuServico` mas só aceita chave.

---

## 2. Princípio da proposta

**A regra de consumo vive UMA vez, no Núcleo; o PCP planeja com ela; o Compras recebe a necessidade
estruturada.** Nenhuma fórmula de tecido/lâmina/perfil é recadastrada no PCP. O PCP continua dono do
que é chão de fábrica (fila, roteiro por setor, bipagem, cortes impressos na Ficha, gavetas) e passa a
ser dono do **plano de necessidade de materiais**. O Compras continua dono de estoque, fornecedor, OC
e NF e passa a ser dono da **requisição de compra**. Cada um só toca o próprio banco; tudo por REST com
`X-Service-Key`, outbox + retry e receptor idempotente (PROTOCOLO §3).

```
Comercial ──pedido (itens + nucleo_*)──▶ PCP ──peças──▶ Núcleo /lista-materiais ──▶ PCP consolida
                                          │                                            (necessidade por
                                          │◀── Compras /estoque/saldos?skus= ◀────────  coleção×cor, perfis,
                                          │                                             tubos, componentes)
                                          └──requisição estruturada (outbox)──▶ Compras solicitações_compra ──▶ OC
```

---

## 3. O que muda em cada módulo

### 3.1 Núcleo — `POST /lista-materiais` (rota nova, só quantidades)

Um endpoint de serviço que recebe a MESMA entrada do `/relatorio-orcamento` (lista de peças com `ref`,
`qtd`, `pedido`, `ambiente`, medidas, sku/coleção/cor e as seleções da venda) e devolve **só
quantidades**, sem preço, sem margem:

- `materiais[]` por sku **completo**: receita + mecanismo da cortina + **`add.*`** (tubo pela banda ou
  manual/equiparado, kit, motor, emissor, perfil/tampa/escova/guias do box efetivo, bandô e sua tira,
  afastamento) + lâminas da PH50 (n × comprimento comprado) + lamelas/lâminas de PH25 e Vertical —
  com `qtd` calculada pela **regra da receita**, nunca por `valor ÷ custo` (fecha o item 2 do §1.2).
- `tecido[]` por **coleção × cor × largura de rolo**: metros cobrados, metros de corte, bobinas
  (`metrosBobinaRolo`/`metrosPeca`), modo (corte × bobina × bobina em estoque), aproveitamento quando
  há grupo (ambiente × coleção × cor), sobra reaproveitável.
- `perfis[]` em barras (o FFD que já existe) e `tubos[]` — por sku e por **pedido de origem**
  (`ref` ecoada), para o PCP saber de que pedido vem cada barra.
- `avisos[]` por peça (via não cabe, medida exige motor, cor em falta nos fornecedores, box recusado…).
- Internamente é `precificarPeca` + o agregador do relatório, **sem o bloco de preço** — um módulo puro
  `services/lista-materiais.js` que o relatório da diretoria também passa a usar (uma regra, dois
  consumidores). Paridade 3.032 intacta (nada muda no motor puro).
- Correções que entram junto: cortina no `/plano-corte` passa a usar a mesma conta do relatório
  (volume/barra/abertura da venda); `/bom` com `A` responde 422.

### 3.2 PCP — receber a especificação, cadastrar peça pelo Núcleo, planejar

**(a) Guardar o que o Comercial manda.** `pcp_itens.spec_nucleo` (JSONB) recebe, na liberação, os
`nucleo_*` + `tecido_sku` + `cor` + `area_m2` + `preco_custo`… — tudo que o `/lista-materiais` precisa.
O item do PCP passa a carregar a peça **como foi vendida**. Peça antiga (sem spec) segue como hoje.

**(b) Entrada de pedido só pelo Comercial** (decisão 2). O cadastro manual "Novo pedido" do PCP
(formulário, importação por Excel/CSV/PDF/JSON) **sai da tela**; reposição, retrabalho e amostra entram
como pedido no Comercial (que já tem o tipo de peça, a coleção e todas as opções) e chegam ao PCP pela
liberação com a especificação completa. O caso "pedido de cortina para calcular o consumo" é resolvido
por (a) + (d): a cortina vendida no Comercial chega com mecanismo/estilo/volume/abertura e o Núcleo
calcula o tecido.

**(c) Estruturas com SKU.** Migração que preenche `pcp_produtos.produto_sku` nas 35 estruturas pelo
de-para evidente (Soft → `soft`/`soft_sheer`, Premium → `premium`/`premium47`, Romana → `romana`,
Painel 3/4 → `painel3`/`painel4`, PH25 → `ph25`, PH50 por material → `ph50*cad/fita`…), para o casamento
por SKU finalmente acontecer. Peça cujo SKU não tem estrutura local (cortina, fixa, celular…) **não
fica mais "pendente"**: o roteiro por setor vem de um cadastro mínimo por **linha** (cortina → costura
→ montagem → embalagem), e os cortes da Ficha vêm do `/plano-corte` quando existir.

**(d) Tela nova "Planejamento → Necessidade de materiais".** Abre com o padrão **"tudo que está
liberado e ainda não cortou"** (decisão 6; filtros por data prometida, período e status na hora), chama
o `/lista-materiais` com as peças desses pedidos e mostra:

- **Tecido** por coleção × cor × rolo: metros, bobinas, sobra, quais pedidos; "cor em falta nos
  fornecedores" em âmbar.
- **Perfis** em barras consolidadas entre os pedidos (o FFD do Núcleo já aceita o lote).
- **Tubos**, **componentes** por sku (com os adicionais).
- Ao lado de cada linha, o **saldo do Compras** (§3.3) e a **falta** (necessidade − saldo − já requisitado).
- Botões: **Imprimir/CSV** (separação de estoque) e **Requisitar ao Compras** (as linhas com falta, ou
  todas) — gera a requisição estruturada **direto na fila do comprador** (decisão 6: sem aprovação
  intermediária); a resposta volta com o número da SC, que fica no pedido. Reenviar não duplica
  (idempotente por `origem_ref`).
- O plano de corte por pedido continua onde está (aba Ordem de Corte); a Ficha passa a trazer a lista
  de materiais da peça (hoje não traz).

**(e) Baixa de estoque** (decisão 4): a **saída de produção** (sku, quantidade, pedido) vai ao Compras
na **primeira bipagem que existir** para o pedido — a de início do setor de corte quando os leitores
estiverem no chão de fábrica; enquanto só houver a bipagem final da expedição, é ela que dispara — e
também por **botão manual "Dar baixa dos materiais"** no pedido (gerência/PCP). Idempotente por pedido ×
sku × plano: bipar de novo ou clicar duas vezes não baixa duas vezes; baixa manual depois de uma
automática não repete. É o que faltava para a sugestão de compra do Compras ter consumo real.

**(f) Planejamento de carga** (fase posterior): data prometida = `aprovadoFinanceiroEm + prazoEntregaDias`
(já em `data_cliente`); capacidade por setor (peças/dia ou minutos por tipo de peça, cadastro);
calendário semanal com a fila sequenciada por data prometida e prioridade; alerta de setor estourado.
O Comercial não precisa mudar (ele não espera nada de volta além do status).

### 3.3 Compras — requisição, saldo por sku, saída de produção, de-para

- **`solicitacoes_compra` + `solicitacao_itens`** (migration 013): número `SC-2026-NNNN` pela
  `numeracao`; `origem` (`pcp` | `manual` | `sugestao`), `origem_ref` UNIQUE (idempotência: ex.
  `pcp:plano-2026-11-05-1`), `empresa_id`, status (`aberta` → `em_cotacao` → `atendida` | `cancelada`),
  `data_necessidade`, itens com `produto_id` **ou** `sku_origem` + descrição + quantidade + unidade +
  pedidos de origem; `oc_item_id` quando atendida. Tela `solicitacoes.html` (fila do comprador: abrir,
  agrupar por fornecedor, **"gerar OC"** com os itens selecionados). A **sugestão de compra** do cockpit
  passa a gerar SC também (fase 2 do blueprint).
- **Rotas de serviço** (`X-Service-Key`, módulo `PCP` já previsto no `serviceKey.js`):
  `POST /integracao/solicitacoes-compra` (idempotente), `GET /integracao/estoque/saldos?skus=a,b,c`
  (saldo + reservado + em OC aberta), `POST /integracao/estoque/saida-producao` (idempotente por
  `pedido + sku + plano`).
- **De-para sku do Núcleo ↔ produto do Compras**: hoje mora no Núcleo (`custo_fonte`, só componentes,
  cadastrado à mão). Decisão 7: o produto do Compras é por **coleção × cor**. O Compras ganha a coluna
  `produtos.nucleo_sku` (componente `cf_base_duo`; tecido por cor `t123:BEGE`), preenchida por tela com
  sugestão automática por nome, e o `/custos` do Compras já devolve `nucleo_sku` — o Núcleo passa a
  casar por ela e o `custo_fonte` vira legado. Um de-para, dois usos (custo e estoque).
- **Pendências do roadmap que entram no caminho**: `produtos.sku` UNIQUE + POST de produto; fase 2
  (SC/OC a partir da sugestão); fase 5 (consolidar por fornecedor/UF) nasce junto com a tela de SC;
  histórico de movimentações do Bling (decisão); estoque por CNPJ (decisão); write-back Bling (fase 6,
  depois). Docs corrigidos (roadmap e CLAUDE.md).

### 3.4 Solicitações e Comunicados — o canal humano (decisões de 05/11)

O módulo da espec de 28/10 segue como proposto, com as decisões fechadas hoje:
- **Módulo novo no hub** (porta 3080, banco `solicitacoes_db`, stack da Logística/RH), card
  "Solicitações" com badge.
- **Departamentos iniciais (10):** Comercial · Fábrica/PCP · Expedição · Logística/Instalação · Compras ·
  Financeiro · Fiscal · RH · TI · Diretoria (responsável de cada um no cadastro).
- **Comunicado:** publicam gerência/diretoria (para todos) e o responsável de cada departamento (para o
  próprio setor). Leitura obrigatória **só avisa e insiste** (banner fixo até "Li e entendi"; o autor vê
  quem não leu) — nunca bloqueia o app/painel.
- **Prazos de alerta:** urgente sem dono em **2 h úteis** avisa responsável + diretoria; concluída sem
  confirmação fecha sozinha em **3 dias** (ambos editáveis no cadastro).
- **Notificação:** e-mail + sino no hub + push no app do técnico. WhatsApp fica para uma 2ª etapa.
- **App do técnico: formulário DENTRO do app, offline** (como o check list da v5.34: fila no IndexedDB +
  sync; fotos/áudio como anexo), não só um link. É a parte mais cara da fase.
- **Login pelo módulo de Credenciais** (§3.5): Solicitações nasce nele.
- A requisição de compra **estruturada** mora no Compras (§3.3, decisão 3) e **aparece no módulo** como
  solicitação do tipo *material* para Compras, com link para a SC — o comprador tem a fila dele no
  Compras e todo mundo vê o andamento num lugar só. "Falta de material" aberta à mão pelo operador vira
  SC manual.

### 3.5 Credenciais — login único, migração um a um (decisão nova de 05/11)

Hoje cada sistema tem a própria tabela de usuários e a própria senha (8 cadastros; sem SSO — achado
também na espec do espelho VPS). Decisão: **módulo de Credenciais** no hub (porta própria, banco
`credenciais_db`): usuários, papéis **por módulo** (admin no Compras, consultor no Comercial, técnico na
Logística…), senha, 2FA, primeiro acesso/redefinição, API de login (`POST /login` → token assinado) e
de validação (`GET /me`, chave pública), auditoria. **Estratégia gradual:** o módulo de Solicitações
nasce nele; os sistemas existentes trocam o login **um por vez**, cada um importando os usuários que já
tem (mesmo e-mail = mesma pessoa) e aceitando os dois tokens durante a transição (o próprio e o das
Credenciais). Ordem sugerida de migração: Logística (hub e app do técnico) → Comercial → Fábrica →
Compras → RH → Financeiro → Fiscal → Núcleo. Nenhum usuário perde acesso: a senha antiga vale até a
pessoa definir a nova no módulo.

### 3.6 Estoque próprio no Compras, migrando do Bling aos poucos (decisão 5)

O Compras já tem `estoque_saldo`/`estoque_movimentacoes`, mas só espelha o saldo do Bling. Decisão:
virar **módulo de estoque de verdade** dentro do Compras, integrado ao Bling nos dois sentidos para
migrar sem corte: (1) movimentação própria (entrada por NF, saída de produção vinda do PCP, ajuste,
inventário com contagem), (2) sincronização Bling → Compras continua (saldo de referência) e nasce
**Compras → Bling** (write-back das movimentações, fase 6 do blueprint), (3) por item, um marcador
"fonte da verdade = Bling | Compras" para migrar categoria a categoria (ex.: tecidos primeiro), (4)
tela de divergência Bling × Compras por item. Depende da requisição/saída de produção (§3.3) para ter
movimento real; o histórico de movimentações do Bling é importado uma vez no início.

---

## 4. Fases e ORDEM de execução (decisão 9: do que gasta menos tokens para o que gasta mais, com
## as dependências respeitadas)

Estimativa de custo em "conversas" (uma conversa ≈ uma sessão de trabalho com levantamento, código,
testes, prova de tela, deploy e docs). As dependências estão na coluna própria; a ordem final é a
sequência da tabela.

| # | Fase | O que entra | Depende de | Custo |
|---|---|---|---|---|
| **1** | **P0 — Contratos e correções** | Núcleo `/lista-materiais` (só quantidades, com adicionais e tecido por cor) + correções do §1.2 e §1.5; PCP grava `spec_nucleo` na liberação, preenche `produto_sku` nas 35 estruturas e **remove o "Novo pedido" manual**; Ficha mostra a lista de materiais da peça | — | 2 |
| **2** | **P2 — Planejamento de carga** | Capacidade por setor (cadastro), calendário semanal sequenciado por data prometida (`data_cliente`) e prioridade, alerta de setor estourado | — (usa o que a fila já tem) | 2–3 |
| **3** | **P1 — Necessidade de materiais** | Tela Planejamento no PCP: tecido por coleção × cor × rolo, perfis em barras consolidadas, tubos, componentes, por pedido ou lote ("liberado e ainda não cortou" por padrão), CSV/impressão | P0 | 3 |
| **4** | **P3 — Requisição ao Compras** | Compras: `solicitacoes_compra` + tela do comprador (agrupar por fornecedor, gerar OC) + rotas de serviço (SC, saldo por sku, saída de produção) + `produtos.nucleo_sku` por coleção × cor + `sku` UNIQUE; PCP: coluna saldo/falta, botão "Requisitar" com outbox, baixa na 1ª bipagem (corte ou expedição) + manual; sugestão do cockpit gera SC; docs do Compras corrigidos | P1 | 3–4 |
| **5** | **P4 — Credenciais** | Módulo novo: usuários, papéis por módulo, senha/2FA/primeiro acesso, API de login e validação, auditoria; migração da Logística (hub + app) como 1º sistema | — | 3–4 |
| **6** | **P6 — Estoque próprio no Compras + Bling nos dois sentidos** | Movimentação própria, inventário, write-back ao Bling, marcador "fonte da verdade" por item, tela de divergência, importação do histórico do Bling | P3 | 3–4 |
| **7** | **P5 — Solicitações/Comunicados** | Módulo novo no hub (10 departamentos, comunicados, prazos, e-mail + sino + push), **formulário offline no app do técnico**, SC do Compras espelhada como solicitação | P4 (login) · P3 (espelho da SC) | 4–5 |

Observações sobre a ordem:
- P2 (carga) ficou antes de P1 (necessidade) porque custa menos e não depende de nada; se preferir
  atacar primeiro o relato da cortina, basta trocar as posições 2 e 3 — nada quebra.
- P4 (Credenciais) e P6 (Estoque) têm custo parecido; P4 vem antes porque P5 depende dele, e P5 é a
  mais cara (o formulário offline no app é o que pesa).
- Os 8 sistemas migram para o login único **depois** de P4, um por conversa curta cada (não contados
  acima): Comercial → Fábrica → Compras → RH → Financeiro → Fiscal → Núcleo.
- P0 e P1 são independentes do Compras e já entregam "o pedido de cortina entra e o consumo sai".

---

## 5. Riscos e limites

- **Estoque no Bling**: o saldo que o PCP vai ver é o espelho do Compras; se a sincronização falhar, a
  "falta" fica errada. A tela mostra a hora do último sync.
- **Casamento sku ↔ produto do Compras** é trabalho de cadastro (centenas de componentes, tecidos ×
  cores). Sem de-para a linha aparece como "sem cadastro no Compras" e ainda assim vai na SC pelo nome.
- **Peças antigas** na fila (liberadas antes da F0) não têm `spec_nucleo`: o planejamento as calcula
  com o que tem (sku + medidas) e marca "especificação incompleta".
- **Cortina fixa, celular, vertical** não têm plano de corte no Núcleo (por desenho): entram na lista
  de materiais, não na Ordem de Corte.
- Mudança de contrato Núcleo → PCP é **aditiva** (rota nova); o relatório da diretoria passa a usar o
  mesmo módulo e precisa de suíte provando que os números não mudam.

---

## 6. Decisões do cliente (05/11/2026)

1. **Fonte da lista de materiais:** **só o Núcleo** — o que for editado lá reflete no PCP. O PCP guarda
   só as regras de corte e o roteiro, que são de fabricação.
2. **Pedido manual no PCP:** **removido**; a entrada de pedidos é só pelo Comercial.
3. **Requisição de compra:** registro estruturado **no Compras**, espelhado no módulo de Solicitações.
4. **Baixa de estoque:** **na bipagem do corte e também manual** — a infraestrutura física dos leitores
   ainda não está pronta e, por enquanto, possivelmente só a bipagem final da expedição vai funcionar;
   o mecanismo tem de ser flexível (§3.2 e).
5. **Estoque:** segue no Bling por ora; **módulo de estoque no Compras integrado ao Bling** para migrar
   aos poucos (§3.6).
6. **Horizonte:** padrão "tudo que está liberado e ainda não cortou". **Aprovação:** a requisição vai
   **direto para o comprador**.
7. **Produto do Compras por coleção × cor.**
8. **Solicitações/Comunicados** (remodeladas e respondidas em 05/11): módulo novo no hub; 10
   departamentos (Comercial · Fábrica/PCP · Expedição · Logística/Instalação · Compras · Financeiro ·
   Fiscal · RH · TI · Diretoria); publicam gerência/diretoria + responsável do departamento; alertas 2 h
   e 3 dias; **formulário offline dentro do app do técnico**; e-mail + sino (WhatsApp depois); leitura
   obrigatória só avisa e insiste; **login pelo módulo de Credenciais** (novo — §3.5), com migração dos
   sistemas existentes um a um.
9. **Ordem:** do que gasta menos tokens para o que gasta mais, com dependências — tabela do §4.

**Próximo passo:** começar a P0 (Núcleo `/lista-materiais` + PCP recebendo a especificação).

---

## 7. Referências do levantamento (05/11/2026)

- Fábrica: `server/src/routes/comercial.js` (liberação, `inserirItem`, `atributosDe`), `server/src/
  ordem-corte.js`, `routes/ordem-corte.js` (OC local aposentada 09/08), `produtos-client.js` (BOM com
  flag, plano de corte), `pcp/public/plano-corte-nucleo.html`, `server/data/estrutura-produtos.json`.
- Núcleo: `backend/src/services/relatorio.js` (materiais, tecido, perfis, tubos, aproveitamento),
  `plano-corte.js`, `peca.js` (entrada do `/precificar`, `linhas[]` com `qtd = valor ÷ custo_unit`),
  `motor.js` (`consumoCortina`, `painelTela`, `telaMetros`, `empacotarBarras`), `laminas.js`,
  `routes/catalogo.js` (`/bom`).
- Comercial: `backend/src/pedidos/pedidos.service.ts` (`GET /pedidos/:id` com todas as colunas do
  item; transições do `service:pcp`; `prazoEntregaDias` + `aprovadoFinanceiroEm`),
  `budgets-actions/relatorio-custo.service.ts` + `produtos/produtos-client.service.ts`
  (`montarCorpoPrecificar` — o mapeamento item → corpo do Núcleo que o PCP vai espelhar).
- Compras (branch de produção `claude/unified-server-status-7633oz`): `backend/src/routes/{estoque,
  ordens-compra,analises,custos}.js`, `services/estoque.js` (custo médio, `saida_producao` nunca
  escrita), `middleware/serviceKey.js`, `docs/01-ESCOPO-COMPRADOR.md` (R12), `03-BLUEPRINT-COCKPIT.md`,
  `05-ENTREGUE-E-ROADMAP.md`.
- Solicitações: `logistica/docs/ESPEC-SOLICITACOES-COMUNICADOS.md`.
