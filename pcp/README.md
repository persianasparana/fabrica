# PCP — Planejamento e Controle da Produção

Sistema de PCP da **Persianas Paraná**, construído sobre o modelo de negócio
oficial do planejamento da produção: fila de produção com prazos do cliente,
alertas de vencimento, bipagem por código de barras, importação de ordens
(PDF/Excel/CSV), indicadores e a **Estrutura do Produto** (catálogo oficial com
fórmulas de corte e componentes/BOM).

> Frontend HTML/CSS/JS (sem build), servido como estático. O backend é o
> serviço Node unificado em [`../server`](../server) — APIs sob `/api/pcp` e
> `/api/auth`, dados em PostgreSQL.

## Funcionalidades

| Módulo | Descrição |
|---|---|
| **Painel** | Métricas gerais + vencidos, atenção (≤ 3 dias) e em produção |
| **Fila de Produção** | Tabela completa com busca, filtros por status/tipo/situação e por data (período, mês, semana, próximos N dias), ordenação e paginação |
| **Alertas** | Pedidos vencidos e prestes a vencer |
| **Buscar Pedido** | Busca por número de pedido, produto ou observações |
| **Indicadores** | % no prazo, top produtos com atraso, motivos de atraso, mix por tipo |
| **Bipagem** | Leitor de código de barras: 1º bip = entrada no PCP, 2º bip = conclusão; vinculação de códigos a pedidos |
| **Estrutura do Produto** | Catálogo oficial: fórmulas de corte (`L − 2.2`, `A + 15`…) e componentes (BOM) por família — alimenta a lista de produtos do novo pedido. Produtos podem ser criados/editados/desativados |
| **Novo Pedido** | Cadastro com produto selecionado da Estrutura do Produto (ou texto livre) |
| **Importação** | PDF da ordem de produção (pdf.js local), Excel/CSV (SheetJS local) e JSON colado — com tela de revisão antes de salvar |
| **Exportação** | CSV compatível com Excel |

## Estrutura

```
pcp/public/
├── index.html, login.html
└── assets/
    ├── css/style.css        # estilo do modelo + identidade oficial
    ├── js/{app.js, login.js}
    ├── fonts/               # Manrope auto-hospedada
    ├── brand/               # ativos da marca (sincronizados de shared/brand)
    └── vendor/              # pdf.js + SheetJS (sem CDN)
```

## Dados (PostgreSQL — ver `../server`)

- `pcp_itens` — itens da fila de produção (produto, pedido, datas, tipo, motivo, código de barras)
- `pcp_produtos` — estrutura do produto (fórmulas de corte e BOM em JSONB)

O seed inicial carrega a planilha oficial de planejamento (186 itens) e o
catálogo completo (34 produtos em 7 famílias).

## Desenvolvimento

Suba o backend (ver [`../server`](../server)) e acesse
`http://localhost:3020/pcp/`.
