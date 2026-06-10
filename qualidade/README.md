# Sistema de Gestão de Não Conformidades

**Persianas Paraná** — Aplicação web para registro, acompanhamento e análise de
não conformidades operacionais, com KPIs, planos de ação e sugestões de
treinamento por setor.

> Frontend HTML/CSS/JS (sem build). O backend é o serviço Node unificado em
> [`../server`](../server) — APIs sob `/api/qualidade` e `/api/auth`.

---

## Funcionalidades

| Módulo | Descrição |
|---|---|
| **Registrar NC** | Data, pedido, setores envolvidos, origem do erro (multi-seleção), impacto, descrição, causa raiz, ação imediata, **ação corretiva**, responsável, prazo, status |
| **Histórico** | Listagem filtrada por status, impacto e período |
| **Planos de Ação** | NCs em aberto, com alteração de status inline |
| **KPIs** | Total, taxa de resolução, gráficos por origem, evolução temporal e distribuição por impacto (Chart.js local) |
| **Treinamentos** | Sugestão automática de temas por frequência de ocorrências |

---

## Estrutura

```
qualidade/
└── public/
    ├── index.html, login.html
    └── assets/
        ├── css/style.css          # usa os tokens de shared/brand
        ├── js/{app.js, login.js}  # consome /api/qualidade e /api/auth
        ├── brand/                 # ativos da marca (sincronizados)
        └── vendor/chart.umd.min.js
```

O conteúdo de `public/` é servido pelo backend Node (rota `/qualidade`) ou
diretamente pelo Nginx.

---

## Desenvolvimento

Suba o backend (ver [`../server`](../server)) e acesse
`http://localhost:8080/qualidade/`.

---

## Segurança

Autenticação por sessão, CSRF nas escritas, rate limiting de login persistido em
banco, prepared statements e cabeçalhos de segurança — implementados no backend
(`server/`). Visão geral em [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

---

## Licença

Software proprietário da **Persianas Paraná**. Uso interno restrito.
© 2026 Persianas Paraná.
