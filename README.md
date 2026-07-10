# Fábrica — Persianas Paraná

Monorepo dos sistemas de **chão de fábrica** da Persianas Paraná: planejamento e
controle da produção (PCP) e gestão da qualidade (não conformidades).

> Stack alinhada ao servidor de aplicativos da empresa: **Node.js + PostgreSQL +
> Nginx**. Os dois sistemas são servidos por **um único backend Node**.

---

## Sistemas

| Sistema | Pasta | Descrição |
|---|---|---|
| **PCP** | [`pcp/`](pcp/) | Planejamento da produção: pedidos com várias peças, **bipagem por setor** (início/fim) com roteiro/dependências, **status de produção** configuráveis, **setores** e **usuários com permissão por aba** (admin), Estrutura do Produto (cortes por setor + BOM), importação de ordens (PDF/Excel), indicadores e edição em massa de pedido. |
| **Qualidade** | [`qualidade/`](qualidade/) | Frontend HTML/CSS/JS: não conformidades, planos de ação, KPIs e treinamentos. |
| **Backend** | [`server/`](server/) | Node + Express + PostgreSQL — APIs dos dois sistemas + autenticação/permissões compartilhadas. |
| **Marca** | [`shared/brand/`](shared/brand/) | Design tokens, cores, tipografia e logotipo (fonte única). |

---

## Arquitetura

```
fabrica/
├── server/            # Backend único Node + Express + PostgreSQL (APIs + auth)
├── pcp/public/        # Frontend do PCP (HTML/CSS/JS, sem build)
├── qualidade/public/  # Frontend estático (HTML/CSS/JS)
├── shared/brand/      # Design tokens + logotipo (fonte única da marca)
├── infra/             # nginx/ (server block) e systemd/ (unit)
├── docs/              # Arquitetura e implantação
└── .github/workflows/ # CI (sintaxe dos frontends + smoke test do backend)
```

Um processo Node serve `/pcp`, `/qualidade` e `/api/*`, atrás do Nginx, com
PostgreSQL — o mesmo padrão dos demais apps da empresa. Detalhes em
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Desenvolvimento

Requer Node 20+ e um PostgreSQL local (banco `fabrica_db`).

```bash
cd server
cp .env.example .env          # ajuste PG*, SESSION_SECRET, FABRICA_ADMIN_*
npm install
npm run install-app           # cria schema + seeds (estrutura/fila) + admin
npm run dev                   # serve /pcp, /qualidade e /api em http://127.0.0.1:3020
```

Os frontends são estáticos (sem build) — basta editar e recarregar a página.

- PCP: http://localhost:3020/pcp/ · Qualidade: http://localhost:3020/qualidade/

---

## Documentação

| Doc | Para quê |
|---|---|
| [`docs/INTEGRACAO.md`](docs/INTEGRACAO.md) | **Integrar outro sistema a este** — API completa, autenticação, modelo de dados e padrões de integração |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitetura, tabelas e decisões |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Instalar/atualizar no servidor (PM2 + Nginx + PostgreSQL) |
| [`docs/SERVIDOR-COMPARTILHADO.md`](docs/SERVIDOR-COMPARTILHADO.md) | Regras de convivência no servidor `aplicativos` |
| [`pcp/README.md`](pcp/) · [`server/README.md`](server/) | Detalhes do PCP e do backend |

---

## Identidade visual

Identidade **oficial** da Persianas Paraná aplicada: preto `#1D1D1B` + branco,
vermelho `#C1212D` (acento do Qualidade) e dourado `#C6B784` (acento do PCP),
tipografia **Manrope** e logotipos oficiais — tudo centralizado em
[`shared/brand/`](shared/brand/). Para ajustar, edite a pasta e rode
`bash shared/brand/sync.sh`.

---

## Licença

Software proprietário da **Persianas Paraná**. Uso interno restrito.
© 2026 Persianas Paraná.
