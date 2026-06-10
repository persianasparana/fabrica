# Fábrica — Persianas Paraná

Monorepo dos sistemas de **chão de fábrica** da Persianas Paraná: planejamento e
controle da produção (PCP) e gestão da qualidade (não conformidades).

> Stack alinhada ao servidor de aplicativos da empresa: **Node.js + PostgreSQL +
> Nginx**. Os dois sistemas são servidos por **um único backend Node**.

---

## Sistemas

| Sistema | Pasta | Descrição |
|---|---|---|
| **PCP** | [`pcp/frontend/`](pcp/) | SPA React (Vite + Tailwind): pedidos, produção, apontamento, estoque, suprimentos, plano-mestre, indicadores e catálogo. Dados compartilhados (multiusuário). |
| **Qualidade** | [`qualidade/`](qualidade/) | Frontend HTML/CSS/JS: não conformidades, planos de ação, KPIs e treinamentos. |
| **Backend** | [`server/`](server/) | Node + Express + PostgreSQL — APIs dos dois sistemas + autenticação compartilhada. |
| **Marca** | [`shared/brand/`](shared/brand/) | Design tokens, cores, tipografia e logotipo (fonte única). |

---

## Arquitetura

```
fabrica/
├── server/            # Backend único Node + Express + PostgreSQL (APIs + auth)
├── pcp/frontend/      # SPA React + Vite + Tailwind
├── qualidade/public/  # Frontend estático (HTML/CSS/JS)
├── shared/brand/      # Design tokens + logotipo (fonte única da marca)
├── infra/             # nginx/ (server block) e systemd/ (unit)
├── docs/              # Arquitetura e implantação
└── .github/workflows/ # CI (build do PCP + smoke test do backend)
```

Um processo Node serve `/pcp`, `/qualidade` e `/api/*`, atrás do Nginx, com
PostgreSQL — o mesmo padrão dos demais apps da empresa. Detalhes em
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Desenvolvimento

Requer Node 20+ e um PostgreSQL local (banco `fabrica`).

```bash
# 1. Backend
cd server
cp .env.example .env          # ajuste PG*, SESSION_SECRET, FABRICA_ADMIN_*
npm install
npm run install-app           # cria schema + usuário admin
npm run dev                   # API em http://127.0.0.1:3020 (serve /pcp e /qualidade)

# 2. Frontend do PCP (hot reload, opcional)
cd ../pcp/frontend
npm install
npm run dev                   # http://localhost:5173 (proxy /api -> :3020)
```

- PCP: http://localhost:3020/pcp/ · Qualidade: http://localhost:3020/qualidade/

---

## Implantação

Guia completo (PostgreSQL + systemd + Nginx, sem afetar os apps existentes):
**[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**.

---

## Identidade visual

Paleta **provisória** derivada do terracota `#C0392B`. Ao receber a marca
oficial, atualize [`shared/brand/`](shared/brand/) e rode `bash shared/brand/sync.sh` —
os dois sistemas refletem a mudança.

---

## Licença

Software proprietário da **Persianas Paraná**. Uso interno restrito.
© 2026 Persianas Paraná.
