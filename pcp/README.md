# PCP — Planejamento e Controle da Produção

Sistema de PCP da **Persianas Paraná**: pedidos, produção, apontamento de
tempos, estoque, suprimentos, plano-mestre, indicadores e catálogo de produtos
(com as fórmulas oficiais de corte e estrutura de produto).

```
pcp/
├── frontend/   # SPA React + Vite + Tailwind (regras de negócio + UI)
└── api/        # Backend PHP: armazenamento chave-valor autenticado (multiusuário)
```

O frontend mantém **toda** a lógica de cálculo. O backend é um *document store*
autenticado que substitui a persistência local original por dados
**compartilhados** entre usuários/máquinas.

---

## Desenvolvimento

### Backend (PHP)

```bash
cd pcp/api
php scripts/install.php          # cria config.php, banco e usuário admin
php -S 127.0.0.1:8090 -t public  # sobe a API em http://127.0.0.1:8090
```

### Frontend (Vite)

```bash
cd pcp/frontend
npm install
npm run dev                      # http://localhost:5173 (proxy /api -> :8090)
```

Em dev, o Vite encaminha `/api/*` para o backend em `localhost:8090`
(ver `vite.config.js`).

---

## Build de produção

```bash
cd pcp/frontend
npm run build                    # gera dist/ (estático)
```

Servir `dist/` como estático e expor o backend PHP sob `/api` **na mesma
origem** (cookies de sessão são `same-origin`). Ver `docs/DEPLOYMENT.md` e o
`docker-compose.yml` na raiz.

---

## Identidade visual

As cores vêm de `shared/brand` (sincronizadas em `public/brand/` por
`bash shared/brand/sync.sh`). O `tailwind.config.js` lê `public/brand/palette.json`
e **remapeia a escala `amber` para o terracota da marca** — por isso todo o app
adota a identidade da Persianas Paraná sem reescrever os componentes.

---

## Notas de arquitetura

- **Persistência:** `window.storage` (interface usada pelo componente principal)
  é reimplementado em `src/storage.js` sobre a API REST (`src/api.js`,
  `src/session.js`). Trocar de backend significa alterar apenas esses módulos.
- **Autenticação:** sessão por cookie HttpOnly + CSRF nas escritas; o gate em
  `src/AppRoot.jsx` exige login antes de montar o app.
- **Fontes:** Bricolage Grotesque + JetBrains Mono auto-hospedadas via
  `@fontsource` (sem CDN).
