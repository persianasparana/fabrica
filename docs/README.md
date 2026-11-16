# Documentação — índice (Fábrica / PCP + Qualidade)

**Leia nesta ordem:** 1) `VISAO-GERAL.md` (como funciona, sem jargão) → 2) `../README.md` (o que
é, estado atual, como rodar) → 3) `API.md` (as rotas) → 4) `../CHANGELOG.md` (o que mudou e
quando) → 5) `../deploy/README.md` (como vai para o ar) → 6) `PROTOCOLO-FEDERACAO.md` (quem
chama quem) → 7) `../CLAUDE.md` (detalhe técnico para quem altera o código).

| Documento | Para quem | O que responde | Atualizado em |
|---|---|---|---|
| [`VISAO-GERAL.md`](VISAO-GERAL.md) | Todos (direção, PCP, novos devs) | O que o sistema resolve, fluxo ponta a ponta, telas, tabelas, vizinhos, glossário | 16/11/2026 |
| [`../README.md`](../README.md) | Quem chega agora | O que é, estado atual, rodar, testar, deploy, lugar na federação | 16/11/2026 |
| [`API.md`](API.md) | Devs e integradores | Todas as rotas com permissão, CSRF e erros; a seção de integração por `X-API-Key` | 16/11/2026 |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Devs | Arquitetura, as 26 tabelas, integrações, outboxes, como as migrations rodam | 16/11/2026 |
| [`INTEGRACAO.md`](INTEGRACAO.md) | Quem vai integrar OUTRO sistema a este | Autenticação, API, modelo de dados, padrões (API key, conta de serviço) | 16/11/2026 |
| [`PROTOCOLO-FEDERACAO.md`](PROTOCOLO-FEDERACAO.md) | Qualquer conversa/dev que toque integração | Mapa dos 8 módulos, matriz quem-chama-quem, regras e checklist obrigatório (replicado nos 8 repos) | 06/11/2026 (v1.1) |
| [`MAPA-DO-SERVIDOR.md`](MAPA-DO-SERVIDOR.md) | Infra | Portas/processos/bancos canônicos do servidor `aplicativos` (idêntico nos repos) | 26/06/2026 |
| [`SERVIDOR-COMPARTILHADO.md`](SERVIDOR-COMPARTILHADO.md) | Quem opera o servidor | O que é reservado dos outros módulos e o que a Fábrica usa | 16/11/2026 |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Quem instala | Primeira instalação no servidor (banco, .env, PM2, Nginx) e atualização manual | 16/11/2026 |
| [`../deploy/README.md`](../deploy/README.md) | Quem publica | Scripts `aplicar-*.sh`, ordem, registro de deploys, diagnóstico do servidor | 16/11/2026 |
| [`ROTEIRO-DEPLOY-PLANEJAMENTO.md`](ROTEIRO-DEPLOY-PLANEJAMENTO.md) | Quem publica o planejamento P0–P6 nos 4 repos | Ordem entre Núcleo → Compras → Fábrica → Logística → Agenda, bloco copy-paste, cadastros depois, como voltar | 10/11/2026 (Fábrica publicada) |
| [`ESPEC-PLANEJAMENTO-PRODUCAO.md`](ESPEC-PLANEJAMENTO-PRODUCAO.md) | Direção e devs | Diagnóstico, proposta, decisões do cliente (05/11) e andamento das fases P0–P6 | 06/11/2026 (implementado) |
| [`IDENTIDADE-VISUAL.md`](IDENTIDADE-VISUAL.md) | Devs de frontend | Marca, cores, tipografia, onde os assets vivem (`shared/brand/`) | — |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Todos | Histórico de entregas por data (muda preço? migration? script) | 16/11/2026 |
| [`../CLAUDE.md`](../CLAUDE.md) | Quem altera o código (humano ou assistente) | Contexto técnico, decisões, fases, armadilhas | 16/11/2026 |
| [`../server/README.md`](../server/README.md) · [`../pcp/README.md`](../pcp/README.md) · [`../qualidade/README.md`](../qualidade/README.md) | Devs | Cada parte do monorepo | 16/11/2026 |
| Manual do usuário | Operadores do PCP | Aba **Manual** dentro do sistema (`pcp/public/assets/js/manual.js`) | a cada função nova |

## Históricos / alternativos (não são mais a referência)

| Documento | Situação |
|---|---|
| [`PROPOSTA-ETIQUETAS-E-ESTRUTURA-AUTO.md`](PROPOSTA-ETIQUETAS-E-ESTRUTURA-AUTO.md) | **Histórico** — proposta (julho/2026) das etiquetas próprias (F1/F2) e da seleção automática da Estrutura (F3/F4). Foi implementada; o estado real está em `API.md` (`/api/pcp/etiquetas`, `/api/pcp/estrutura-regras`) e no `CLAUDE.md`. |
| `logistica/docs/HANDOFF-INTEGRACAO-PCP.md` e `logistica/docs/FABRICA-INTEGRACAO.md` (repo da Logística) | **Históricos** — hand-off da integração Logística ↔ PCP (junho/2026). O contrato vigente é a linha B da matriz do `PROTOCOLO-FEDERACAO.md` + `/api/integracao/*` em `API.md`. |
| `INTEGRACAO.md` §3 (referência antiga da API) | **Alternativo** — mantido por compatibilidade; a lista completa e atual é `API.md`. |
