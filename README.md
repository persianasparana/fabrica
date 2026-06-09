# Fábrica — Persianas Paraná

Monorepo dos sistemas de **chão de fábrica** da Persianas Paraná: planejamento e
controle da produção (PCP) e gestão da qualidade (não conformidades).

> PCP · Produção · Relatórios de Qualidade — identidade visual unificada,
> deploy no mesmo servidor de aplicativos.

---

## Sistemas

| Sistema | Pasta | Stack | Descrição |
|---|---|---|---|
| **PCP** | [`pcp/`](pcp/) | React (Vite) + Tailwind · backend PHP | Pedidos, produção, apontamento, estoque, suprimentos, plano-mestre, indicadores e catálogo de produtos. Dados **compartilhados** (multiusuário). |
| **Qualidade** | [`qualidade/`](qualidade/) | PHP 8 + SQLite/MySQL · HTML/CSS/JS | Registro e acompanhamento de não conformidades, planos de ação, KPIs e treinamentos. |
| **Marca** | [`shared/brand/`](shared/brand/) | Design tokens | Cores, tipografia e logotipo — fonte única consumida pelos dois apps. |

---

## Arquitetura

```
fabrica/
├── shared/brand/      # Design tokens (cores, fontes, logo) — fonte única da marca
├── qualidade/         # App de Qualidade (PHP) — self-contained
├── pcp/
│   ├── frontend/      # SPA React + Vite + Tailwind (lógica de negócio)
│   └── api/           # Backend PHP: armazenamento autenticado + multiusuário
├── infra/             # Dockerfiles, configs de Apache/Nginx
├── docs/              # Documentação compartilhada (deploy, arquitetura, marca)
├── docker-compose.yml # Sobe os dois sistemas
└── .github/workflows/ # CI (build do PCP, lint PHP)
```

Os dois apps são **independentemente deployáveis** e compartilham apenas os tokens
de marca. Rodam no mesmo servidor (Apache/PHP) como *virtual hosts* separados, ou
em containers via Docker Compose.

---

## Início rápido (desenvolvimento)

```bash
# Subir tudo com Docker (recomendado)
docker compose up --build

#   PCP        → http://localhost:8080
#   Qualidade  → http://localhost:8081
```

Ou rodar cada app isoladamente — ver `pcp/README.md` e `qualidade/README.md`.

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Implantação no servidor (Docker e Apache nativo) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitetura do monorepo e dos sistemas |
| [`shared/brand/README.md`](shared/brand/README.md) | Como aplicar/atualizar a identidade visual |
| [`pcp/README.md`](pcp/README.md) · [`qualidade/README.md`](qualidade/README.md) | Guias por sistema |

---

## Status da identidade visual

A paleta atual é **provisória**, derivada do terracota `#C0392B` já utilizado. Ao
receber o logotipo e as cores oficiais, basta atualizar [`shared/brand/`](shared/brand/) —
os dois sistemas refletem a mudança automaticamente.

---

## Licença

Software proprietário da **Persianas Paraná**. Uso interno restrito.
© 2026 Persianas Paraná. Todos os direitos reservados.
