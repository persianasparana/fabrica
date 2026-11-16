# PCP — Planejamento e Controle da Produção

Frontend do PCP da **Persianas Paraná**: fila de produção com prazos do cliente, pedidos
vindos do Comercial, bipagem por setor, planejamento de carga, necessidade de materiais,
etiquetas, expedição, Ficha de Produção e plano de corte. HTML/CSS/JS **sem build**, servido
como estático. O backend é o serviço Node unificado em [`../server`](../server) — APIs sob
`/api/pcp`, `/api/comercial` e `/api/auth`, dados em PostgreSQL. Rotas: `../docs/API.md`.

> Desde o P0 do planejamento (06/11/2026) **não há "Novo Pedido" manual nem importação
> PDF/Excel/CSV/JSON**: a entrada de peças é só a liberação do pedido do Comercial.

## Abas (sidebar de `index.html`)

| Aba | O que faz |
|---|---|
| **Painel** | Métricas gerais + vencidos, atenção (≤ 3 dias) e em produção |
| **Fila de Produção** / **Arquivo (baixados)** | Tabela completa com busca, filtros (status/tipo/situação/datas), ordenação, paginação, badges de prioridade/especial/"pelo Núcleo"; modal "Ver" edita a peça (estrutura por select, SKU, coleção, cores, acionamento, ambiente, prioridade, medidas) |
| **Alertas** | Pedidos vencidos e prestes a vencer |
| **Planejamento de carga** (P2) | Grade de dias por setor (capacidade × programado), itens que vão atrasar, gravar previsões, calendário (admin) |
| **Necessidade de materiais** (P1/P3) | Tecido por coleção × cor × rolo, perfis/tubos em barras, componentes do horizonte (pelo Núcleo), saldo/falta do Compras, **Requisitar ao Compras**, requisições feitas, CSV, impressão |
| **Buscar Pedido** | Por número de pedido, produto ou observações |
| **Editar Pedido** | Edição em massa de todas as peças de um pedido (prazo, tipo, motivo, especial, prioridade, observações), concluir/reabrir tudo, baixar materiais no Compras, excluir o pedido |
| **Indicadores** | % no prazo, top produtos com atraso, motivos, mix por tipo |
| **Pedidos Comercial** | Pedidos `EM_ANALISE_PCP` do Comercial: prévia da Estrutura por item, desenhos anexados, **Liberar produção** / **Devolver** |
| **Bipagem** | Por setor (Início/Fim): o Início assume o status do setor (após as dependências do roteiro); o Fim do setor cujo status é **final** dá a baixa. Setores ofertados = os do usuário |
| **Estrutura do Produto** | Catálogo de como fabricar: cortes por setor, componentes (BOM), roteiro, SKU do Núcleo; regras de seleção automática e categoria por coleção |
| **Plano de Corte** | `plano-corte-nucleo.html` — plano de corte do pedido vindo do Núcleo (variante por peça, registro de impressão) |
| **Expedição** | Gavetas: guardar/retirar peças bipando a etiqueta, mapa das gavetas, onde está cada peça do pedido |
| **Etiquetas** | Modelos (admin: formato mm, campos, QR/código) e impressão por pedido/setor/peça (Argox iX4-250) |
| **Status (admin)** / **Tipos de Produção** / **Setores** / **Usuários** | Cadastros: status (com "final"), tipos de entrada (com padrão), setores (status, setor de corte, capacidade/dia), usuários com permissão por aba e setores |
| **Manual** | Manual do usuário (`assets/js/manual.js`, visível a todos os logados) |
| **Ficha de Produção** | `ficha-producao.html?pedido=PED-…` — specs, infos do pedido, desenho de fabricação, cortes por setor, lista de materiais por item e resumo |
| **Fotos para e-commerce** | mini-PWA `fotos/` (celular): registro da peça com a spec + fotos comprimidas; exportação CSV |
| **Exportação** | CSV da fila compatível com Excel (gerado em JS puro) |

## Estrutura

```
pcp/public/
├── index.html, login.html, ficha-producao.html, plano-corte-nucleo.html
├── fotos/                    # mini-PWA (index.html, app.js, sw.js, manifest)
└── assets/
    ├── css/style.css         # estilo + identidade oficial
    ├── js/app.js             # fila / editar pedido / estrutura / cadastros / bipagem
    ├── js/comercial.js       # aba Pedidos Comercial (prévia, liberar, devolver)
    ├── js/carga.js · necessidade.js        # P2 e P1/P3
    ├── js/etiquetas.js · expedicao.js      # etiquetas e gavetas
    ├── js/regras-estrutura.js              # regras de seleção da Estrutura
    ├── js/ordem-corte-plano.js · plano-corte-nucleo.js · ficha-producao.js
    ├── js/manual.js · login.js
    ├── fonts/                # Manrope auto-hospedada
    ├── brand/                # ativos da marca (sincronizados de shared/brand)
    └── vendor/               # qrcode.js (sem CDN) — ver vendor/README.md
```

Permissões por aba (`ABAS_PERM` em `app.js` = `ABAS` em `server/src/routes/admin.js`):
`painel, fila, alertas, carga, necessidade, busca, pedido, indicadores, bipagem, estrutura,
tipos, comercial, etiquetas, expedicao`. A CSP do backend não permite `<script>` inline nem
CDN (só handlers por atributo).

## Dados (PostgreSQL — ver `../docs/ARCHITECTURE.md`)

`pcp_itens` (item do pedido, com `spec_nucleo`) → `pcp_pecas` (peça com etiqueta, medidas em
**cm**, baixa, gaveta) → `pcp_peca_etapas` (bipagem). Cadastros: `pcp_produtos`, `pcp_status`,
`pcp_tipos`, `pcp_setores`, `pcp_gavetas`, `pcp_etiqueta_modelos`, `pcp_estrutura_regras`.
Outboxes: `pcp_ciclo_pendencias` (Comercial), `pcp_compras_pendencias` (Compras).

O seed do `install.js` (186 itens da planilha antiga, 34 estruturas) é **dado de teste**.

## Desenvolvimento

Suba o backend (ver [`../server`](../server)) e acesse `http://localhost:3020/pcp/`.
