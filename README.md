# Fábrica — PCP e Qualidade (Persianas Paraná)

## O que é

Sistema do **chão de fábrica** da Persianas Paraná e um dos 8 módulos da federação ERP da
empresa. É o **consumidor de produção do Pedido do Comercial**: o vendedor fecha o pedido no
Painel Comercial, o Financeiro aprova, e ele chega aqui para o PCP conferir a estrutura, liberar
a produção, acompanhar cada peça por setor (bipagem), imprimir a Ficha de Produção e o plano de
corte, guardar nas gavetas da expedição e entregar à Logística. Também tem o módulo de
**Qualidade** (não conformidades e indicadores). Tudo em um único serviço Node + PostgreSQL.

**Abas do PCP hoje:** Painel · Fila de Produção · Arquivo (baixados) · Alertas ·
**Planejamento de carga** · **Necessidade de materiais** (+ Requisitar ao Compras) · Buscar
Pedido · Editar Pedido · Indicadores · **Pedidos Comercial** (análise e liberação) · Bipagem ·
Estrutura do Produto (+ regras de seleção automática) · Plano de Corte (pelo Núcleo) ·
Expedição (gavetas) · Etiquetas · Status / Tipos / Setores / Usuários (admin) · Manual ·
Ficha de Produção (página própria) · **Fotos para e-commerce** (mini-PWA em `/pcp/fotos/`).
Não existe mais entrada manual de pedidos nem importação PDF/Excel — a entrada é só a
liberação do pedido do Comercial (decisão do cliente, 05/11/2026).

## Estado atual

| | |
|---|---|
| **Em produção desde** | **26/11/2026 17:48** — lista de materiais como a venda cotou, commit `48f66c6`, script `deploy/aplicar-lista-como-a-venda.sh` (linha em `deploy/REGISTRO-DEPLOYS.md`); antes, 10/11/2026 — P3 do planejamento de produção (cobre P0–P2), commit `44bde24` |
| **Branch de produção** | `claude/unified-server-status-7633oz` (checkout git em `/var/www/fabrica`). `main` está parado em 09/06/2026 — não é referência |
| **Pendente de deploy** | `e981f14 fix(auth)` (login recusava credencial certa — caixa do usuário e bloqueio por IP), só na branch de federação. A revisão de 16/11/2026 (`SESSION_SECRET` obrigatória, CI, docs — commit `5f82e5b`) entrou em 26/11/2026 17:48, no mesmo `git pull` da lista de materiais |
| **Versão** | o repo não versiona por número; o histórico é por data em `CHANGELOG.md` |

## Como rodar localmente

Requer Node 20+ e PostgreSQL (banco `fabrica_db`, role `fabrica_user`).

```bash
cd server
cp .env.example .env            # preencha PGPASSWORD, SESSION_SECRET (obrigatória), FABRICA_ADMIN_*
npm install
npm run install-app             # schema (migrations no boot) + seeds de TESTE + admin
npm run dev                     # http://127.0.0.1:3020 — /pcp/, /qualidade/, /api/*
```

Os frontends são estáticos (HTML/CSS/JS, sem build) — edite e recarregue. O seed do
`install.js` (34 estruturas, 186 itens da planilha antiga, 4 setores, 7 status) é **dado de
teste**, não o de produção. Sem os vizinhos (Comercial :3010, Núcleo :3070, Compras :3050) o
sistema sobe normalmente: cada integração fica desligada enquanto a chave não existe no `.env`.

## Como testar

```bash
cd server
npm test        # sem banco: sequenciador de carga (test/carga.test.mjs) + corpo do Núcleo como a venda (test/nucleo-spec.test.mjs)
npm run check   # node --check nos módulos principais
```

O CI (`.github/workflows/ci.yml`) roda os dois, mais `node --check` nos frontends e um smoke
test completo contra um PostgreSQL de serviço (login, estrutura, bipagem, pedido, status,
Qualidade). As provas ponta a ponta das fases P0–P3 foram feitas na réplica da sessão (scripts
não versionados — ver `CLAUDE.md`).

## Como fazer deploy

Produção é um checkout git da branch acima. **Nunca** dê `checkout` de outra branch no servidor
(incidente 16/07/2026). Cada entrega tem um script idempotente em `deploy/aplicar-*.sh` que
confere o commit, reinicia o PM2, testa o `/healthz` e registra a linha em
`deploy/REGISTRO-DEPLOYS.md`. Scripts, ordem com os outros módulos e o que está no ar:
**[`deploy/README.md`](deploy/README.md)**. Primeira instalação: `docs/DEPLOYMENT.md`.

## Onde está a documentação

Índice para leigos e ordem de leitura: **[`docs/README.md`](docs/README.md)**. Resumo:

| Documento | O que é |
|---|---|
| [`docs/VISAO-GERAL.md`](docs/VISAO-GERAL.md) | Como funciona, em linguagem simples (fluxo, telas, tabelas, glossário) |
| [`docs/API.md`](docs/API.md) | Todas as rotas (método, caminho, permissão, CSRF, erros) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitetura, 26 tabelas, integrações e outboxes |
| [`docs/INTEGRACAO.md`](docs/INTEGRACAO.md) | Para quem vai integrar outro sistema a este |
| [`docs/PROTOCOLO-FEDERACAO.md`](docs/PROTOCOLO-FEDERACAO.md) | Contrato entre os 8 módulos (quem chama quem) |
| [`docs/ESPEC-PLANEJAMENTO-PRODUCAO.md`](docs/ESPEC-PLANEJAMENTO-PRODUCAO.md) | Espec do planejamento P0–P6 (implementado) |
| [`docs/ROTEIRO-DEPLOY-PLANEJAMENTO.md`](docs/ROTEIRO-DEPLOY-PLANEJAMENTO.md) | Deploy coordenado do planejamento nos 4 repos |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/SERVIDOR-COMPARTILHADO.md`](docs/SERVIDOR-COMPARTILHADO.md) | Instalação e regras do servidor compartilhado |
| [`CHANGELOG.md`](CHANGELOG.md) | Histórico de entregas por data |
| [`CLAUDE.md`](CLAUDE.md) | Contexto técnico detalhado (para quem vai alterar o código) |
| [`server/README.md`](server/README.md) · [`pcp/README.md`](pcp/README.md) · [`qualidade/README.md`](qualidade/README.md) | Cada parte do monorepo |
| Manual do usuário | Aba **Manual** do PCP (`pcp/public/assets/js/manual.js`) e `gerenciador`/app da Logística para o resto da federação |

## Lugar na federação

| Recurso | Valor |
|---|---|
| Porta | **3020** (bind `127.0.0.1`) · health `GET /healthz` |
| Banco | `fabrica_db` (role `fabrica_user`) — migrations idempotentes no boot (`server/src/db.js`) |
| PM2 | `fabrica-server` (`deploy/ecosystem.config.js`) |
| Nginx | `/fabrica/` → `/fabrica/pcp/`, `/fabrica/qualidade/`, `/fabrica/api/*` (snippet `infra/nginx/fabrica-subpath.conf`) |
| Diretório | `/var/www/fabrica` |
| **Chama** | Comercial :3010 (ciclo do pedido, Fases B/C, outbox `pcp_ciclo_pendencias`) · Núcleo de Produtos :3070 (BOM, plano de corte, lista de materiais) · Compras :3050 (saldo, solicitação de compra, saída de produção, outbox `pcp_compras_pendencias`) |
| **É chamado por** | Logística :3000 (`/api/integracao/*`, header `X-API-Key`) |

Regras de convivência (portas reservadas, chave de serviço, contrato aditivo, outbox):
`docs/PROTOCOLO-FEDERACAO.md`. Identidade visual: `docs/IDENTIDADE-VISUAL.md` e `shared/brand/`.

## Licença

Software proprietário da **Persianas Paraná**. Uso interno restrito. © 2026 Persianas Paraná.
