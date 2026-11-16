# Arquitetura — fabrica (PCP + Qualidade)

Monorepo com dois sistemas (PCP e Qualidade) servidos por **um único backend Node (ESM)**,
atrás do **Nginx**, usando **PostgreSQL** — o mesmo padrão dos demais módulos da federação.
Atualizado em 16/11/2026 ao estado em produção (P3 do planejamento, 10/11/2026).

```
┌──────────────────────────── Servidor "aplicativos" (Ubuntu) ───────────────────────────────┐
│  Nginx (80/443) — UM vhost, include snippets/<app>.conf por módulo (hub = Logística :3000)   │
│        │ /fabrica/  (prefixo removido)                                                      │
│        ▼                                                                                    │
│  fabrica-server (Node/Express ESM · PM2)  127.0.0.1:3020                                    │
│   ├─ /pcp/*, /pcp/fotos/*  → estático pcp/public (PCP + mini-PWA de fotos)                  │
│   ├─ /qualidade/*          → estático qualidade/public                                      │
│   ├─ /api/auth             sessão (cookie fabrica.sid + CSRF)                               │
│   ├─ /api/pcp[/…]          fila, pedido, bipagem, estrutura, carga, necessidade,            │
│   │                        ordem-corte, etiquetas, estrutura-regras, expedicao,            │
│   │                        fotos-ecommerce, setores/usuários (admin)                       │
│   ├─ /api/qualidade        NCs + KPIs                                                       │
│   ├─ /api/comercial        proxy autenticado do ciclo do pedido (→ Comercial :3010)        │
│   └─ /api/integracao       leitura por X-API-Key (← Logística :3000)                       │
│        │ clientes HTTP (X-Service-Key)                                                      │
│        ├──▶ Comercial :3010   comercial-client.js   (outbox pcp_ciclo_pendencias)          │
│        ├──▶ Núcleo    :3070   produtos-client.js    (best-effort, sem outbox)              │
│        └──▶ Compras   :3050   compras-client.js     (outbox pcp_compras_pendencias)        │
│        ▼                                                                                    │
│  PostgreSQL (5432) · banco `fabrica_db` (role `fabrica_user`) · 26 tabelas + `session`      │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Componentes

| Pasta | Papel |
|---|---|
| `server/src/server.js` | App Express: helmet (CSP), sessão em PostgreSQL, mounts, estáticos, tratamento de erro (502/503 chegam ao navegador; 500 mascarado). Aborta sem `SESSION_SECRET`. |
| `server/src/db.js` | Pool `pg` + **`migrate()`**: todo o schema, idempotente, rodado no boot. |
| `server/src/auth.js` | Login (bcrypt), rate limiting em banco, CSRF, `requireAuth`/`requireAdmin`/`requirePerm`, `audit()`. |
| `server/src/routes/` | `auth`, `pcp` (1.270 linhas: fila, pedido, bip, peças, estrutura, status, tipos, carga, necessidade, materiais), `admin` (setores, usuários), `ordem-corte`, `etiquetas`, `estrutura-regras`, `expedicao`, `fotos-ecommerce`, `qualidade`, `comercial`, `integracao`. Todas em `docs/API.md`. |
| `server/src/corte.js` · `ordem-corte.js` · `ordem-corte-nucleo.js` | Motor de fórmulas de corte (cm), cálculo da OC por peça (legado, ainda alimenta a Ficha) e plano de corte via Núcleo. |
| `server/src/estrutura-regras.js` · `roteiro.js` · `nucleo-spec.js` | Seleção automática da Estrutura (regras F3 + categoria por coleção); roteiro por estrutura ou por linha; spec da venda e corpo das chamadas ao Núcleo. |
| `server/src/carga.js` · `necessidade.js` · `lista-materiais.js` | Planejamento P2 (sequenciador puro, testado), P1 (necessidade) e P0 (lista de materiais em blocos). |
| `server/src/comercial-client.js` · `produtos-client.js` · `compras-client.js` · `etiquetas.js` | Clientes HTTP dos vizinhos e geração de etiquetas. |
| `server/bin/` | `install.js`, `migrate.js`, `reset-senha.js`, `limpar-fila.js`, utilitários da Estrutura (ver `server/README.md`). |
| `pcp/public/` | Frontend do PCP (HTML/CSS/JS sem build) + `ficha-producao.html`, `plano-corte-nucleo.html`, `fotos/` (PWA). |
| `qualidade/public/` | Frontend do Qualidade (+ Chart.js vendorizado). |
| `shared/brand/` · `infra/` · `deploy/` | Marca; snippets de Nginx e unit systemd; scripts de deploy, PM2, registro, diagnóstico. |

## Modelo de dados (PostgreSQL, banco `fabrica_db`) — 26 tabelas de `db.js` + `session`

| Tabela | Uso |
|---|---|
| `users` | Login compartilhado pelos dois sistemas (bcrypt), `role` admin/user, `permissoes` JSONB por aba. |
| `login_attempts` | Rate limiting persistido (usuário + IP); limpeza de >2 dias no boot. |
| `audit_log` | Auditoria (`app` pcp/qualidade/auth; `entity_id` VARCHAR aceita UUID do Comercial). |
| `pcp_produtos` | Estrutura do Produto: `cortes` (fórmulas por setor, `key`, barra), `componentes` (BOM), `roteiro`, `unidade`, `produto_sku` do Núcleo (N:1). |
| `pcp_itens` | Item da fila (produto, `produto_id`, pedido, qnt, datas, tipo, motivo, `especial`, `status_id`, `prioridade`, spec estruturada F1: cliente/coleção/cores/acionamento/ambiente/`atributos`, `comercial_item_id`, `produto_sku`, **`spec_nucleo`** JSONB). |
| `pcp_pecas` | Peça física (etiqueta `cod_barras` única, `largura`/`altura` em cm, `medidas` JSONB, baixa `conclusao`, `gaveta_id`, `guardada_em`, `materiais_baixados_em`). |
| `pcp_peca_etapas` | Início/fim por setor de cada peça (bipagem). |
| `pcp_status` · `pcp_tipos` · `pcp_setores` | Cadastros do admin: status (`final`), tipos de entrada (`padrao`), setores (`status_id`, `ordem_corte`, `capacidade_dia`). |
| `usuario_setores` | N:N usuário ↔ setor. |
| `nao_conformidades` | NCs do Qualidade (`setores`/`origens` JSONB). |
| `pcp_ordem_corte_log` · `pcp_etiqueta_log` · `pcp_expedicao_log` | Rastreabilidade de impressões do plano de corte, de etiquetas e das movimentações da expedição. |
| `pcp_ciclo_pendencias` | **Outbox do Comercial** — avanço de estado que falhou; 1 linha por pedido (mantém o alvo mais adiante). |
| `pcp_compras_pendencias` | **Outbox do Compras** — `tipo` solicitacao/saida, `chave` única, `bloqueada` em 4xx definitivo. |
| `pcp_requisicoes` | Solicitações de compra feitas pela Necessidade (`origem_ref` única = idempotência dos dois lados). |
| `pcp_pedido_info` | Dados de nível de pedido vindos do Comercial (cliente, vendedor, modalidade, prazo, `desenho_fabricacao`/`_instalacao`). |
| `pcp_colecao_categorias` · `pcp_estrutura_regras` | Categoria de tecido por coleção e regras condicionais de seleção da Estrutura (F3). |
| `pcp_config` | Chave/valor: `ordem_corte_modo_padrao`, `carga_cfg`, `roteiro_linhas`. |
| `pcp_etiqueta_modelos` | Modelos de etiqueta (mm, setores, campos, código; seed 100×24). |
| `pcp_gavetas` | Gavetas da expedição. |
| `ecommerce_fotos_registros` · `ecommerce_fotos_arquivos` | Fotos para o e-commerce (arquivos em `uploads/ecommerce`, fora do git). |
| `session` | Sessões (`connect-pg-simple`, `createTableIfMissing`). |

### Como as migrations funcionam (diferente dos irmãos)

Não há pasta `migrations/` nem tabela de versão. `server/src/db.js migrate()` roda **no boot**
(e em `npm run migrate`/`install-app`) e é inteiramente idempotente (`IF NOT EXISTS`,
`ON CONFLICT DO NOTHING`, `UPDATE … WHERE … IS NULL`). Regra: bloco já aplicado em produção
nunca é reescrito — acrescenta-se um novo, aditivo. O dono dos objetos é o role que roda o
boot (`fabrica_user`); por isso não há `OWNER TO` explícito — rodar como `postgres` cria
tabelas com dono errado (bug nº 2 da federação). Deploy = restart (ver `deploy/README.md`).

## Integrações (contrato em `docs/PROTOCOLO-FEDERACAO.md`, matriz §2)

| Linha | Direção | Para quê | Resiliência |
|---|---|---|---|
| **C** | Fábrica → Comercial (:3010, `X-Service-Key` = `SERVICE_API_KEY_PCP`) | Listar `GET /pedidos?status=`, detalhe, devolver/liberar (`PATCH /pedidos/:id/status`), avançar `EM_PRODUCAO → EMBALADO → NA_EXPEDICAO`, proxy dos desenhos | Outbox `pcp_ciclo_pendencias` + agendador (`CICLO_RETRY_MS`); 401/403 do Comercial viram 502 (nunca deslogam o usuário) |
| **D** | Fábrica → Núcleo (:3070) | BOM por SKU, `POST /plano-corte`, `POST /lista-materiais` (sem dinheiro) | Best-effort: null/[] e a tela diz o motivo; flags `PRODUTOS_*` |
| **M** | Fábrica → Compras (:3050, `SERVICE_KEY_PCP`) | Saldos, solicitação de compra, saída de produção na 1ª bipagem | Outbox `pcp_compras_pendencias` + agendador (`COMPRAS_RETRY_MS`); sem chave = desligado |
| **B** | Logística (:3000) → Fábrica | `GET /api/integracao/{pedidos,peca,expedicao}` | `X-API-Key` (= `INTEGRACAO_API_KEY`); 503 sem a chave — exceção ao padrão `X-Service-Key` |

Nenhum módulo lê o banco de outro; tudo por REST.

## Decisões

- **Um serviço, um login.** PCP e Qualidade compartilham `users` e a sessão.
- **Entrada de peças só pelo Comercial** (decisão do cliente, 05/11/2026): a liberação do pedido
  importa itens/peças com a spec da venda; `POST /pcp/itens[/lote]` respondem 410. A Estrutura
  é escolhida por override > regra > SKU > nome > "pelo Núcleo" > pendente, conferida ANTES de
  liberar.
- **Peças individuais com etiqueta própria.** Conclusão do item é derivada das peças.
- **Bipagem como motor de fluxo** (início assume o status do setor após as dependências; fim do
  setor final dá a baixa) e como gatilho federado (1ª bipagem → `EM_PRODUCAO` + baixa de
  materiais no Compras; última baixa → `EMBALADO`; todas guardadas → `NA_EXPEDICAO`).
- **O Núcleo é a fonte das fórmulas de consumo** (tecido, perfis, componentes, plano de corte);
  o PCP guarda só as regras de corte locais da Ficha. Unidades: peças em **cm**; Núcleo em metros.
- **Controle de acesso por aba** (`none`/`ver`/`editar`); o backend gateia só escritas.
- **Frontends estáticos, sem build**, com caminhos relativos — funcionam sob `/fabrica/`.
- **Fail-soft e outbox** para todo vizinho: falha remota nunca derruba a operação local.

## Segurança

- Sessão em cookie HttpOnly + SameSite=Lax; `Secure` sob HTTPS (`TRUST_PROXY`, `COOKIE_SECURE`).
- `SESSION_SECRET` obrigatória (o boot aborta sem ela — 16/11/2026).
- CSRF por token de sessão (`X-CSRF-Token` nas escritas); rate limiting de login em banco.
- `helmet` com CSP (`scriptSrc 'self'`, handlers inline só por atributo); queries parametrizadas.
- Integração: `X-API-Key` comparada em tempo constante; chaves de serviço só no `.env`.

## Convivência no servidor

Isolado: PM2 `fabrica-server`, porta **3020**, banco `fabrica_db`/`fabrica_user`, diretório
`/var/www/fabrica`, rota `/fabrica/` via `include` no vhost único da Logística. Regras em
[`SERVIDOR-COMPARTILHADO.md`](SERVIDOR-COMPARTILHADO.md); instalação em [`DEPLOYMENT.md`](DEPLOYMENT.md).
