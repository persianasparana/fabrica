# PCP — Planejamento e Controle da Produção

Frontend do sistema de PCP da **Persianas Paraná**: pedidos, produção,
apontamento de tempos, estoque, suprimentos, plano-mestre, indicadores e
catálogo de produtos (com as fórmulas oficiais de corte e estrutura de produto).

> SPA **React + Vite + Tailwind**. O backend é o serviço Node unificado em
> [`../server`](../server) (APIs sob `/api/pcp` e `/api/auth`).

```
pcp/frontend/
├── src/
│   ├── App.jsx            # aplicação (regras de negócio + UI)
│   ├── AppRoot.jsx        # gate de login
│   ├── api.js, session.js, storage.js   # cliente da API (substitui o window.storage)
│   └── components/Login.jsx
├── public/brand/          # ativos da marca (sincronizados de shared/brand)
├── tailwind.config.js     # remapeia `amber` -> terracota da marca
└── vite.config.js
```

## Desenvolvimento

```bash
# Suba o backend antes (ver ../server)
npm install
npm run dev          # http://localhost:5173 (proxy /api -> http://127.0.0.1:8080)
```

## Build

```bash
npm run build        # gera dist/ (servido pelo backend em /pcp ou pelo Nginx)
```

## Notas

- **Persistência:** o componente principal usa `window.storage`, reimplementado
  em `src/storage.js` sobre a API REST → dados compartilhados (multiusuário).
- **Identidade:** o Tailwind lê `public/brand/palette.json` e remapeia a escala
  `amber` para o terracota da marca — sem reescrever componentes.
- **Fontes:** Bricolage Grotesque + JetBrains Mono via `@fontsource` (sem CDN).
