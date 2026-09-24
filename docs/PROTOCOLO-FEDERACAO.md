# 🧭 PROTOCOLO DA FEDERAÇÃO — regras, processos e procedimentos para mexer em QUALQUER módulo sem quebrar a integração

> **Documento canônico, IDÊNTICO nos 8 repositórios** (`logistica`, `agenda-consultores`,
> `fabrica`, `rh`, `financeiro`, `compras`, `fiscal`, `produtos`), em `docs/PROTOCOLO-FEDERACAO.md`.
> **Toda conversa do Claude Code lê este arquivo ANTES de alterar um repositório** e o
> **atualiza no MESMO conjunto de commits** sempre que mexer em contrato, chave, porta, branch,
> hub/Nginx ou ordem de deploy — replicando a versão nova nos 8 repos (procedimento em §7).
>
> Pedido do cliente (24/09/2026): *"ajustar os arquivos que coordenam a integração com os outros
> módulos, registrar as atualizações nos repositórios, regras de integração, histórico de
> conhecimento, para que a conversa individual que vai alterar o repositório da logística não
> cause danos na integração. Com regras, processos e procedimentos instruídos em um arquivo para a
> outra conversa ler e seguir. Isso vale para todos os módulos e é importante sempre deixar esses
> arquivos atualizados."*
>
> **Versão 1.0 — 24/09/2026.** Fonte: leitura direta dos 8 repositórios (código dos clientes HTTP,
> middlewares de `X-Service-Key`, `.env.example`, scripts de deploy, `REGISTRO-DEPLOYS.md`, `CLAUDE.md`)
> e das branches remotas nesta data. Se este arquivo divergir do código, **o código manda** e
> este arquivo deve ser corrigido no mesmo commit.

---

## 0. Como usar (para a conversa que vai alterar um repositório)

1. Leia o `CLAUDE.md` do repositório (contexto local) **e este arquivo** (contexto da federação).
2. Confirme a **branch certa** (§1 — coluna "Produção"). `main` está **atrasado** em quase todos os
   repos; nunca ramifique dele. Espelhe o trabalho na branch de federação da sessão quando ela existir.
3. Antes de tocar em algo que aparece em §2 (rota, DTO/campo, status, chave, env, porta, Nginx, hub,
   migration de tabela lida por outro módulo): rode o **procedimento de mudança de contrato** (§4).
4. Ao terminar: suítes + build, script de deploy **cumulativo com guardas**, ordem de deploy
   (provedor ANTES do consumidor), registro em `deploy/REGISTRO-DEPLOYS.md`, `CLAUDE.md` do repo,
   e **este arquivo replicado nos 8 repos** se algo de §1–§3 mudou (§7).
5. Toda revisão/impacto segue as **5 lentes** de `compras/docs/DIRETRIZES-REVISAO-ERP.md`
   (contrato · resiliência/idempotência · bounded contexts · concorrência/N+1 · `X-Service-Key`).

Regra de ouro em uma frase: **mudança de integração é ADITIVA, tolerante a falha do vizinho, com
chave de serviço, sem tocar no banco do outro, deployada do provedor para o consumidor e registrada.**

---

## 1. Mapa da federação (servidor `aplicativos`, 192.168.0.207 — um só Nginx, um só PostgreSQL)

| Módulo | Porta | PM2 | Banco (role) | Dir em produção | Nginx | Branch de **PRODUÇÃO** (checkout do servidor) | `main` | Deploy |
|---|---|---|---|---|---|---|---|---|
| **Logística** (gerenciador + app do técnico + **hub**) | 3000 | `persianas-api` | `persianas_db` (`persianas_user`) | `/var/www/persianas` | vhost raiz `/`, `/app/`, `/api/` | **`claude/nice-cerf-eimyzr`** (federação = mesmo conteúdo) | ⚠ atrasado (01/07) | `bash deploy/atualizar-producao.sh` |
| **Comercial / Agenda** (Painel Comercial) | 3010 api · 3011 admin | `agenda-api`, `agenda-admin` | `agenda_consultores` (`persianas`) | `/var/www/agenda/agenda-consultores` | `/agenda/` | **`claude/trusting-johnson-K7jQ7`** (federação = mesmo conteúdo, só o registro difere) | ⚠ atrasado (27/05) | `bash deploy/aplicar-vX.Y.Z.sh` (cumulativo) |
| **Fábrica** (PCP + Qualidade) | 3020 | `fabrica-server` | `fabrica_db` (`fabrica_user`) | `/var/www/fabrica` | `/fabrica/pcp/`, `/fabrica/qualidade/` | **`claude/unified-server-status-7633oz`** | ⚠ atrasado (09/06) | `git pull --ff-only origin claude/unified-server-status-7633oz && pm2 restart fabrica-server` (health `/healthz`) |
| **RH** (ponto e banco de horas) | 3030 | `rh-api` | `rh_db` (`rh_user`) | `/var/www/rh` | `/rh/` | `claude/confident-ritchie-bg863c` (= federação; **confirmar no servidor**: `cd /var/www/rh && git branch --show-current`) | — | `git pull --ff-only` + `pm2 delete rh-api && pm2 start deploy/ecosystem.config.js` |
| **Financeiro** | 3040 | `financeiro-api` | `financeiro_db` (`financeiro_user`) | `/var/www/financeiro` | `/financeiro/` | **`claude/unified-server-status-7633oz`** (federação só sem o último registro) | — | `bash deploy/aplicar-*.sh` (cumulativo, `lib-estado.sh`) |
| **Compras** | 3050 | `compras-api` | `compras_db` (`compras_user`) | `/var/www/compras` | `/compras/` | **`claude/unified-server-status-7633oz`** (idem) | — | `bash deploy/aplicar-*.sh` (cumulativo, `lib-estado.sh`) |
| **Fiscal** (Núcleo Fiscal) | 3060 | `fiscal-api` | `fiscal_db` (`fiscal_user`) | `/var/www/fiscal` | `/fiscal/` | `claude/unified-server-status-7633oz` (= federação) | — | `bash deploy/update.sh` |
| **Núcleo de Produtos & Precificação** | 3070 | `produtos-api` | `produtos_db` (`produtos_user`) | `/var/www/produtos` | `/produtos/` (painel estático) | **`main`** (federação é espelho) | ✅ = produção | `git pull --ff-only origin main && bash deploy/aplicar-v14-XX-*.sh` (cumulativo) |

- **Branch de federação da sessão atual:** `claude/persianas-parana-federation-64icd0` existe nos 8
  repos como **espelho** do trabalho; a autoridade é a coluna "Produção". Quem trabalha numa
  conversa nova: `git fetch --all --prune` e confira com
  `git for-each-ref --sort=-committerdate --format='%(refname:short) %(committerdate:short) %(contents:subject)' refs/remotes/`
  qual branch tem o trabalho mais novo — **use a branch de produção como base**, espelhe na
  federação, e **nunca recrie a partir do `main`** (incidente da Logística em 16/06/2026).
- **Divergiu?** `merge` preservando os dois lados. Nunca `reset`/recriar. Nunca `checkout` de outra
  branch no servidor (incidente da Fábrica em 16/07/2026 derrubou login/abas).
- **Portas reservadas:** 3000 · 3001 (admin da Agenda, interno) · 3010 · 3011 · 3020 · 3030 · 3040 ·
  3050 · 3060 · 3070 · 5432. App novo: próxima livre a partir de 3080, e entra nesta tabela.
- **Nginx:** UM vhost (`/etc/nginx/sites-available/persianas`, fonte em `logistica/nginx/persianas-ssl.conf`)
  com `include snippets/<app>.conf` por módulo. **Nunca sobrescrever o vhost**: editar acrescentando,
  `nginx -t`, `reload`, auto-revert (incidente 30/06/2026). Passo a passo: `logistica/docs/HUB-E-ROTEAMENTO.md`.
- **Hub:** `logistica/public/home.html` (array `APPS`) — o card de TODO módulo mora no repo da
  Logística. Card novo = mudança na Logística (só frontend), deploy da Logística.
- **PM2:** se `pm2 restart` não pegar a mudança, `pm2 delete <app> && pm2 start …` (bug nº 1).
- **Migrations:** idempotentes (`IF NOT EXISTS`) e **sempre `OWNER TO <role do módulo>`** (bug nº 2).
  `pg_dump` do banco antes de migration em produção. Nenhum módulo lê/escreve no banco de outro.

---

## 2. Matriz de integração — quem chama quem (o CONTRATO entre módulos)

Convenções comuns: REST JSON; listas `{ data: [...] }` (Compras/Financeiro/Fiscal/RH/Logística usam
`/api/v1/`; o Comercial expõe as rotas de pedido na **raiz** `http://127.0.0.1:3010/pedidos`; o Núcleo
em `/api/v1/`); erros `{ error: 'snake_case', message }`; **toda chamada serviço-a-serviço leva
`X-Service-Key`** (ADR-0008) e nunca confia em vir de 127.0.0.1. Chaves **por par de módulos**, no
`.env` (fora do git), rotacionáveis; a chave única legada segue aceita até a migração.

| # | Chamador → Provedor | Para quê (contrato) | Rotas do provedor | Env no CHAMADOR | Env/validação no PROVEDOR | Comportamento sem o provedor |
|---|---|---|---|---|---|---|
| A | **Logística → Comercial** | **Fase D do ciclo do pedido**: expedição completa → `NA_EXPEDICAO`; agenda publicada → `INSTALACAO_AGENDADA`; instalação OK no app do técnico → `ENTREGUE`. Proxy dos **desenhos de instalação** para gerenciador/app técnico. | `GET /pedidos?codigo=PED-…` · `PATCH /pedidos/:id/status` · `GET /pedidos/:id/desenhos` · `GET /pedidos/:id/desenhos/:did/arquivo` | `COMERCIAL_API_URL` (`http://127.0.0.1:3010`), `COMERCIAL_SERVICE_KEY`, `COMERCIAL_TIMEOUT_MS`, `CICLO_RETRY_MS` | `SERVICE_API_KEY_LOGISTICA` (ator `service:logistica`, transições permitidas: `EM_PRODUCAO→EMBALADO→NA_EXPEDICAO→INSTALACAO_AGENDADA→ENTREGUE` + legados) ou `SERVICE_API_KEY` legada | **Tolerante**: pedido sem `PED-` é ignorado; falha vira `warn` e entra na **outbox `ciclo_pendencias`** (migration 004) drenada por retry — o fluxo manual da Logística nunca trava (decisão do cliente 07/07/2026). Sem `COMERCIAL_SERVICE_KEY` = no-op. |
| B | **Logística → Fábrica** | Consultar pedidos/peças na **expedição da fábrica** (gavetas) para montar a agenda e baixar peças. | `GET /api/integracao/pedidos?…` · `GET /api/integracao/peca?codigo=` | `FABRICA_API_URL` (`http://127.0.0.1:3020`), `FABRICA_API_KEY`, `FABRICA_TIMEOUT_MS` | `INTEGRACAO_API_KEY` (header `X-API-Key`; **deve ser igual** à `FABRICA_API_KEY` da Logística); 503 se não configurada | Rotas da Logística devolvem erro orientativo; agenda manual segue. |
| C | **Fábrica → Comercial** | **Fase B/C do ciclo**: PCP avalia `EM_ANALISE_PCP` → `LIBERADO_PRODUCAO` (importa itens para a fila, **idempotente por PED-**) ou `DEVOLVIDO_PCP`; produção avança `EM_PRODUCAO → EMBALADO → NA_EXPEDICAO` (gavetas); baixa desenhos do pedido; grava flags em `pcp_pedido_info`. | `GET /pedidos?codigo=` · `GET /pedidos/:id` · `PATCH /pedidos/:id/status` · `GET /pedidos/:id/desenhos[/…/arquivo]` · `GET /pedidos/:id/checklist` | `COMERCIAL_API_BASE`, `COMERCIAL_SERVICE_KEY`, `CICLO_RETRY_MS` (`server/src/comercial-client.js`) | `SERVICE_API_KEY_PCP` (ator `service:pcp`, só transições do PCP) ou legada | Outbox `pcp_ciclo_pendencias` + retry; fila interna do PCP soberana. **Acessório NÃO entra na fila** (pulado na liberação). |
| D | **Fábrica → Núcleo de Produtos** | **F3**: BOM/estrutura por SKU e **plano de corte** (Ordem de Corte). | `GET /api/v1/catalogo/produtos/:sku/bom?largura=&altura=` · `POST /api/v1/plano-corte` · `GET /api/v1/plano-corte/variantes` | `PRODUTOS_API_BASE`, `PRODUTOS_SERVICE_KEY`, flags `PRODUTOS_BOM_ENABLED=1`, `PRODUTOS_PLANO_CORTE_ENABLED` | `SERVICE_KEY` do Núcleo (`autenticarOuServico`) | Flags desligadas/erro → PCP usa a estrutura local; peça sem Estrutura resolvida é **pulada pela Ordem de Corte**. |
| E | **Comercial → Núcleo de Produtos** | **F2 — preço**: cotação por peça e em lote (aproveitamento), catálogo/listas, raio-X de custo, relatório da diretoria, venda avulsa. | `POST /precificar` · `POST /cotar` · `POST /relatorio-orcamento` · `GET /catalogo/*` (colecoes, cores, produtos, avulsos, cortina, painel, afastamentos…) | `PRODUTOS_API_BASE` (`…:3070/api/v1`), `SERVICE_API_KEY_PRODUTOS`, `PRODUTOS_PRICING_ENABLED` (+ toggle em `empresa_config`), `PRODUTOS_COTACAO_VALIDADE_HORAS` | `SERVICE_KEY` do Núcleo | **Fail-soft**: cotação persistida com validade (7 d) vale; sem preço, motivo visível ao vendedor; travas 422 da whitelist barram o save; avisos exigem confirmação. **O eco é contrato** (`selecao`, `tubo_efetivo`, `motor_efetivo`, `avisos`, `markup_quebra`, `custo_fabrica`…): shape novo = campo NOVO, nunca renomear. |
| F | **Comercial → Financeiro** | **F5a**: títulos do contas a receber do pedido — sinal na aprovação, saldo previsto, reancoragem na entrega, cancelamento. | `POST /api/v1/integracao/contas-receber` · `…/contas-receber/entrega` · `…/contas-receber/cancelar` | `FINANCEIRO_API_BASE`, `FINANCEIRO_SERVICE_KEY`, `FINANCEIRO_EMPRESA_ID` (fallback legado; a empresa vem do pedido) | `SERVICE_KEY_COMERCIAL`/`SERVICE_KEY_AGENDA` (`exigirServico('comercial','agenda')`) ou legada | Outbox `financeiro_pendencias` (drenada a cada 5 min); receptor **idempotente** por `(empresa_id, origem, origem_id)`; falha nunca derruba a transição do pedido. |
| G | **Financeiro → Comercial** | **Fase A do ciclo**: análise financeira do pedido — aprovar (`AGUARDANDO_FINANCEIRO → EM_ANALISE_PCP`, com **empresa obrigatória** e plano de recebimento) ou reprovar; ler plano/opções. | `GET /pedidos[?…]` · `GET /pedidos/:id` · `GET /pedidos/:id/plano-recebimento` · `PATCH /pedidos/:id/status` | `COMERCIAL_API_BASE`, `COMERCIAL_SERVICE_KEY` | `SERVICE_API_KEY_FINANCEIRO` (ator `service:financeiro`) ou legada | Tela do Financeiro mostra "Comercial indisponível"; nada é gravado pela metade. |
| H | **Compras → Financeiro** | **Fase 4 / C2 / C3**: NF de entrada → conta a pagar; **previsão a pagar da OC**; cancelamento (Higienização). | `POST /api/v1/integracao/contas-pagar` · `…/contas-pagar/cancelar` | `FINANCEIRO_API_BASE`, `FINANCEIRO_SERVICE_KEY`, `FINANCEIRO_EMPRESA_ID`, `FINANCEIRO_CATEGORIA_SLUG`, `FINANCEIRO_CATEGORIA_HIGIENIZACAO`, `FINANCEIRO_SYNC_MS` | `SERVICE_KEY_COMPRAS` (`exigirServico('compras')`) ou legada | Guardas dos dois lados (15/09/2026); idempotência por `numero_documento`/origem; NF fica "pendente de conferência" no Financeiro. |
| I | **Compras → Fiscal** e **Financeiro → Fiscal** | Documentos fiscais (consulta, XML, manifestação). | `GET /api/v1/documentos[/:id[/xml]]` · `POST …/manifestar` | `FISCAL_API_BASE` | `SERVICE_KEY` do Fiscal (`autenticarOuServico`) | Fail-soft; Fiscal v0.x. |
| J | **Núcleo de Produtos → Compras** | **F4 — custo-sync**: custos de matéria-prima do Compras alimentam o motor. | `GET /api/v1/custos` (Compras) | `COMPRAS_API_BASE`, `COMPRAS_SERVICE_KEY`, `CUSTO_SYNC_MS` | `SERVICE_KEY_PRODUTOS`/`SERVICE_KEY` (`exigirServiceKey`) | Sem envs = desativado com log; motor segue com o custo do cadastro. |
| K | **Compras → Bling** (externo) | Ponte temporária somente-leitura. | API Bling (OAuth) | `BLING_*` | — | Sem Bling nada quebra localmente. |
| L | **Todos → Hub/Nginx (Logística)** | Card no hub + `location` no vhost único. | `public/home.html` · `snippets/<app>.conf` | — | — | Ver §1 (regras do vhost). |
| — | **RH** | **Isolado**: nenhuma chamada a outro módulo; só o card no hub. | — | — | — | — |

**Máquina de estados do pedido (fonte da verdade: Comercial; canônico em
`agenda-consultores/docs/CICLO-DO-PEDIDO.md`):** `AGUARDANDO_FINANCEIRO → EM_ANALISE_PCP (Financeiro)
→ LIBERADO_PRODUCAO | DEVOLVIDO_PCP (PCP) → EM_PRODUCAO → EMBALADO → NA_EXPEDICAO (PCP/Logística)
→ INSTALACAO_AGENDADA → ENTREGUE (Logística)`; `REPROVADO_FINANCEIRO`, `CANCELADO`. Cada módulo só
faz as transições do seu setor (tabela `pedidos.service.ts`); toda transição grava evento no histórico
(invariante 4). **Status novo ou transição nova = mudança em TRÊS repos** (Comercial + quem transita
+ quem lê) e neste arquivo.

---

## 3. Regras (o que NÃO pode acontecer)

1. **Contrato é aditivo.** Campo novo entra opcional (com default); campo antigo só sai depois de
   TODOS os consumidores migrarem (convivência), nunca no mesmo deploy. Renomear = campo novo + antigo
   mantido. Tipo não muda (o `Number(null) = 0` já custou o "(tubo 0)" e um fator 0×).
2. **Provedor antes do consumidor.** Quem expõe o campo/rota/eco sobe primeiro; o consumidor sobe
   depois e **falha aberto** (fail-soft) se o provedor ainda for antigo. O script de deploy do
   consumidor **sonda a versão do provedor e aborta** com a instrução do que aplicar antes
   (exemplos: `aplicar-v2.118.0.sh` sonda `/relatorio-orcamento` com `avulso_sku`).
3. **Chave de serviço sempre.** Rota entre módulos valida `X-Service-Key`; chave por par
   (`SERVICE_KEY_<MODULO>` no provedor = `<PROVEDOR>_SERVICE_KEY` no chamador); chave legada só
   até migrar; nunca commitar chave; a variável ausente = integração **desativada com log**, não crash.
4. **Nenhum cross-database.** Cada módulo só toca o próprio banco/role/PM2/dir/porta. Dados do
   vizinho vêm por REST. Regra de negócio do vizinho não é reescrita (preço/desconto = Comercial +
   Núcleo; fila de produção = PCP; títulos = Financeiro; imposto = Fiscal).
5. **Idempotência e outbox.** Toda escrita remota que pode repetir tem chave de idempotência
   (`PED-…/sinal`, `numero_documento`, importação por PED-); toda transição/lançamento que depende de
   outro módulo tem **outbox + retry** (`ciclo_pendencias`, `pcp_ciclo_pendencias`,
   `financeiro_pendencias`) — falha do vizinho **nunca** derruba a operação local.
6. **Erro explícito.** 502/503 com mensagem orientativa em PT-BR; nunca "Erro interno"; timeout
   configurado (`*_TIMEOUT_MS`).
7. **Hub e vhost são da Logística.** Card, `location`, snippet: só pelo passo a passo de
   `logistica/docs/HUB-E-ROTEAMENTO.md`. Vhost nunca é sobrescrito.
8. **Migration lida por outro módulo é contrato.** Coluna/tabela que outro módulo consome via API
   entra aditiva e documentada aqui.
9. **Concorrência e N+1.** Saldo, numeração, reserva, fila: `SELECT … FOR UPDATE` ou versão
   otimista; nada de query em loop em rota quente.
10. **Servidor compartilhado.** Antes de qualquer comando global (Nginx, PostgreSQL global, `pm2`
    de outro app, `apt`), **perguntar ao cliente**. Comandos para ele em **um único bloco copy-paste**
    sem placeholders.

---

## 4. Procedimento — mudança que toca integração (checklist obrigatório)

**Antes**
- [ ] `git fetch --all --prune` + `for-each-ref`; trabalhar na branch de produção (§1); espelhar na federação.
- [ ] Ler `CLAUDE.md` do repo, este arquivo e `compras/docs/DIRETRIZES-REVISAO-ERP.md`.
- [ ] Identificar na matriz (§2) quem consome o que vai mudar. Conferir no código com grep nos outros
      repos (todos clonados lado a lado em `/home/user/<repo>`):
      ```bash
      # rota/campo/status que vai mudar — procure nos CONSUMIDORES
      grep -rn "<rota-ou-campo>" /home/user/*/backend/src /home/user/*/server/src /home/user/*/admin-panel/src \
        /home/user/logistica/gerenciador /home/user/logistica/app-tecnico 2>/dev/null | grep -v node_modules
      # variáveis de ambiente do par
      grep -rn "<NOME_DA_ENV>" /home/user/*/.env.example /home/user/*/*/.env.example 2>/dev/null
      ```
- [ ] Decidir: aditivo? default? quem sobe primeiro? o consumidor falha aberto? há idempotência/outbox?

**Durante**
- [ ] Provedor: campo/rota nova **ao lado** da antiga; eco novo; validação de `X-Service-Key`;
      teste production-safe (suíte roda contra o banco de PRODUÇÃO no deploy do Núcleo — não assumir seed).
- [ ] Consumidor: parse tolerante (ausente = comportamento de hoje); DTO com decorators
      (Comercial: `whitelist + forbidNonWhitelisted` — campo novo sem decorator derruba TODO save);
      `translateCreateDto/UpdateDto` no painel; `CAMPOS_OPCIONAIS_PECA`; hidratação; specs.
- [ ] Rodar as suítes dos DOIS lados + build. Quando der, E2E com o cliente compilado contra o
      provedor real na réplica.

**Depois**
- [ ] Script de deploy cumulativo com guardas de commit + sonda do provedor + migrations idempotentes
      + `pg_dump` + suítes + restart + health + `registrar_deploy` (`deploy/lib-estado.sh`).
- [ ] Ordem de deploy explícita no `CLAUDE.md` e no cabeçalho do script.
- [ ] Documentar: `CLAUDE.md` (seção da versão com pedido do cliente, apurado, decisões, o que muda de
      preço/contrato, provas, ordem de deploy); `deploy/REGISTRO-DEPLOYS.md` (o script grava);
      `agenda-consultores/docs/CICLO-DO-PEDIDO.md` se estados mudaram; `compras/docs/GUIA-DO-INTEGRADOR.md`
      se a superfície do Compras mudou; **este arquivo** se §1–§3 mudaram (§7).
- [ ] Commit na branch de produção + espelho na federação (`cherry-pick -x` ou merge), push nos dois.
- [ ] Entregar ao cliente o bloco copy-paste de deploy, na ordem certa, e o que testar.

---

## 5. Regras específicas por módulo (o que a conversa daquele repo precisa saber)

### 5.1 Logística (`logistica`, :3000) — **o repo que uma conversa vai alterar agora**
- **Branch:** produção = `claude/nice-cerf-eimyzr` (idêntica em conteúdo à federação
  `claude/persianas-parana-federation-64icd0` em 24/09/2026 — só os hashes diferem). **`main` está
  em 01/07/2026, 19 commits atrás: NÃO use o `main`.** Deploy: `bash deploy/atualizar-producao.sh`.
- **Ela é o HUB e o VHOST de todo mundo:** `public/home.html` (cards de 10 apps) e
  `nginx/persianas-ssl.conf` (com os `include snippets/…`). Mexer aqui afeta os 8 módulos. Regras em
  `docs/HUB-E-ROTEAMENTO.md`; nunca `cp` do conf do repo para o servidor.
- **Integrações que NÃO podem quebrar (arquivos):**
  - `backend/src/services/comercial.js` — Fase D do ciclo (tabela §2-A). Os ganchos são chamados por
    `services/expedicao.js` (`marcarSaida` ao publicar agenda com pedido; `baixaPorInstalacao` quando o
    app do técnico conclui OK) e pela conclusão da instalação em `routes/instalacoes.js`. **Mudar nome
    de status da instalação/expedição, fluxo de publicar agenda ou de concluir instalação exige manter
    esses ganchos** — senão o pedido federado para de andar no Comercial e o Financeiro não cobra o saldo.
  - Outbox `ciclo_pendencias` (migration `004_ciclo_pendencias.sql`) + `CICLO_RETRY_MS`: não remover.
  - `routes/comercial-desenhos.js` — proxy dos desenhos do pedido para gerenciador/app técnico
    (`GET /api/v1/comercial-desenhos/:codigo[/arquivo/:id]`).
  - `services/fabrica.js` + `routes/fabrica.js` — consulta à expedição da Fábrica (`X-API-Key`).
  - `app-tecnico/sw.js` — **bump de versão do SW** em toda mudança de asset do PWA (senão o técnico fica
    com tela antiga); cache offline (IndexedDB) do app técnico.
- **Envs de integração:** `COMERCIAL_API_URL`, `COMERCIAL_SERVICE_KEY` (= `SERVICE_API_KEY_LOGISTICA`
  do Comercial), `COMERCIAL_TIMEOUT_MS`, `CICLO_RETRY_MS`, `FABRICA_API_URL`, `FABRICA_API_KEY`
  (= `INTEGRACAO_API_KEY` da Fábrica), `FABRICA_TIMEOUT_MS`. Nova env → `.env.example` + `docs/DEPLOY.md`.
- **Banco:** só `persianas_db`; migrations `backend/migrations/001–005` idempotentes, `OWNER TO persianas_user`.
- **Contrato que a Logística EXPÕE a outros:** hoje nenhum backend chama a Logística (a Fábrica NÃO
  chama; o Comercial NÃO chama). Rota nova para outro módulo → middleware `X-Service-Key` por módulo
  + entrada em §2.
- **Docs locais a manter:** `CLAUDE.md`, `docs/HISTORICO-PATCHES.md`, `docs/LICOES-MULTI-CONVERSA-E-DEPLOY.md`,
  `docs/HUB-E-ROTEAMENTO.md`, `docs/INFRAESTRUTURA-COMPARTILHADA.md`, `docs/MAPA-SERVIDOR-PARA-NOVOS-APPS.md`.

### 5.2 Comercial / Agenda (`agenda-consultores`, :3010/:3011)
- Produção `claude/trusting-johnson-K7jQ7`; federação = mesmo conteúdo. **`main` é de 27/05: não usar.**
- **Provedor** do pedido federado (rotas na raiz `/pedidos…`, guard `JwtOrServiceKeyGuard` com chaves
  por módulo `SERVICE_API_KEY_PCP/_LOGISTICA/_FINANCEIRO` e a legada `SERVICE_API_KEY`); transições por
  setor em `pedidos.service.ts`. **Consumidor** do Núcleo (F2) e do Financeiro (F5a, outbox).
- Lições que valem para qualquer mudança: campo novo no DTO **com decorators**; `translateUpdateDto`;
  `CAMPOS_OPCIONAIS_PECA`; client Prisma espelhado à mão na réplica (engine bloqueado); scripts
  cumulativos `aplicar-vX.Y.Z.sh` com sonda do Núcleo. Detalhe versão a versão no `CLAUDE.md`.

### 5.3 Fábrica (`fabrica`, :3020)
- Produção `claude/unified-server-status-7633oz`. **Em 24/09/2026 a federação tem um commit a mais que
  a produção:** `e981f14 fix(auth): login recusava credencial certa — caixa do usuário e bloqueio por IP`
  (auth.js, server.js, db.js, bin/reset-senha.js). Está fora do ar até ser levado à `unified` e deployado.
- Consumidor do Comercial (Fases B/C, `server/src/comercial-client.js`, outbox `pcp_ciclo_pendencias`) e
  do Núcleo (F3 BOM/plano de corte, `produtos-client.js`, flags). Provedor da Logística
  (`routes/integracao.js`, `INTEGRACAO_API_KEY`, `X-API-Key`).
- Casamento da Estrutura por `produto_sku` do item (regra > sku > nome > pendente); item sem
  Estrutura é pulado pela Ordem de Corte; **acessório é pulado na liberação**.

### 5.4 Núcleo de Produtos (`produtos`, :3070)
- **`main` = produção**; federação é espelho. Deploy cumulativo `aplicar-v14-XX-*.sh` com suítes
  **contra o banco de produção** (testes production-safe).
- **Paridade 3.032 casos é sagrada**; regra nova nasce parametrizável; travas/avisos/ecos em `peca.js`.
- Provedor de Comercial (E) e Fábrica (D); consumidor do Compras (J). **Eco é contrato**: a Agenda lê
  `selecao`, `tubo_efetivo`, `motor_efetivo`, `avisos`, `markup_quebra`, `trilho_plus`, `custo_fabrica`…
  — antes de mudar shape, conferir `agenda-consultores/backend/src/produtos/produtos-client.service.ts`
  e `fabrica/server/src/produtos-client.js`.

### 5.5 Financeiro (`financeiro`, :3040)
- Produção `unified-server-status-7633oz`. Provedor de Comercial (F) e Compras (H) em
  `routes/integracao.js` com `exigirServico('<modulo>')` (`SERVICE_KEY_<MODULO>`); consumidor do
  Comercial (G) e do Fiscal (I). O razão `lancamentos` é a fonte da verdade do caixa; título é
  idempotente por `(empresa_id, origem, origem_id)`.
- ⚠ **Branches com trabalho fora da federação/produção:** `claude/financeiro-cobrancas-itau` e
  `claude/serene-hypatia-aukaeb` (Integração Itaú Fase 1 — cobrança PIX/boleto/BoleCode + baixa
  automática, 02/07/2026) **não estão** na `unified` nem na federação (`grep -i itau backend/src` = 0).
  Decisão do cliente: mesclar ou descartar. Não recriar.

### 5.6 Compras (`compras`, :3050)
- Produção `unified-server-status-7633oz`. Consumidor do Financeiro (H), Fiscal (I) e Bling (K);
  provedor do Núcleo (J, `middleware/serviceKey.js`, `SERVICE_KEY_<MODULO>`). Superfície completa em
  `docs/GUIA-DO-INTEGRADOR.md`; decisões em `docs/adr/` (ADR-0008 = auth de serviço; ADR-0009 =
  número do pedido como chave). **`docs/DIRETRIZES-REVISAO-ERP.md` mora aqui** (norma das 5 lentes).

### 5.7 Fiscal (`fiscal`, :3060)
- Federação = `unified`. Provedor de Compras e Financeiro (`autenticarOuServico`, `SERVICE_KEY`).
  v0.x: não inventar regra fiscal — confirmar antes de implementar cálculo de imposto.
- Branch antiga `claude/fiscal-core-repo-vn9x4l` (fundação, 01/07) tem histórico não relacionado à
  federação — não ramificar dela.

### 5.8 RH (`rh`, :3030)
- Isolado (nenhuma integração). Só o card no hub da Logística. Branch de produção a confirmar no
  servidor (§1).

---

## 6. Histórico de conhecimento — onde está cada coisa (índice)

| Assunto | Documento canônico |
|---|---|
| Norma de revisão (5 lentes + formato) | `compras/docs/DIRETRIZES-REVISAO-ERP.md` |
| Decisões de arquitetura (ADRs 0000–0009) | `compras/docs/adr/` |
| Plano da federação (dono de cada domínio, roteiro) | `compras/docs/PLANO-INTEGRACAO-ERP.md` |
| Ciclo do pedido (estados, donos, invariantes) | `agenda-consultores/docs/CICLO-DO-PEDIDO.md` |
| Fluxo pedido → contas a receber (F5) | `compras/docs/REVISAO-FLUXO-PEDIDO-E-CONTAS-A-RECEBER.md` |
| Superfície da API do Compras | `compras/docs/GUIA-DO-INTEGRADOR.md` |
| Compras ↔ Financeiro | `compras/docs/INTEGRACAO-FINANCEIRO-FASE4.md`, `financeiro/docs/INTEGRACAO-COMPRAS.md` |
| Núcleo: contratos F2/F3/F4 e deploy das integrações | `produtos/docs/INTEGRACOES-F2-F3-F4.md`, `produtos/docs/DEPLOY-INTEGRACOES.md`, `produtos/docs/ESPECIFICACAO-PRECIFICACAO.md` (regra viva do preço) |
| Logística ↔ Fábrica | `logistica/docs/INTEGRACAO-LOGISTICA-FABRICA.md`, `logistica/docs/FABRICA-INTEGRACAO.md`, `fabrica/docs/INTEGRACAO.md` |
| Hub + Nginx (vhost único, cards) | `logistica/docs/HUB-E-ROTEAMENTO.md`, `logistica/nginx/persianas-ssl.conf` |
| Infra compartilhada (portas, PM2, bancos, bugs 1–7) | `logistica/docs/INFRAESTRUTURA-COMPARTILHADA.md`, `logistica/docs/MAPA-SERVIDOR-PARA-NOVOS-APPS.md`, `docs/MAPA-DO-SERVIDOR.md` (⚠ cópias divergentes — ver §8) |
| Lições de múltiplas conversas/branches | `logistica/docs/LICOES-MULTI-CONVERSA-E-DEPLOY.md`, `agenda-consultores/docs/LICOES-APRENDIDAS.md` |
| Identidade visual | `docs/IDENTIDADE-VISUAL.md` (rh, produtos, agenda) — fonte `logistica/docs/identidade-visual/` |
| Registro de deploys (por repo) | `deploy/REGISTRO-DEPLOYS.md` + `deploy/lib-estado.sh` (agenda, produtos, compras, financeiro; fábrica só registro) |
| Histórico por versão | `CLAUDE.md` de cada repo (Agenda e Núcleo têm a seção por versão), `logistica/docs/HISTORICO-PATCHES.md` |

---

## 7. Manutenção DESTE arquivo (obrigatória)

- Ele é **idêntico nos 8 repos**. Quem muda §1–§3 (porta, branch, chave, rota, campo de eco, status,
  ordem de deploy, hub/Nginx) edita **uma vez**, sobe a **versão e a data** no cabeçalho, acrescenta uma
  linha em §9 e **copia o arquivo para os 8 repos no mesmo conjunto de commits** (branch de produção +
  federação de cada um):
  ```bash
  # a partir do repo onde editou (ex.: logistica)
  for r in logistica agenda-consultores fabrica rh financeiro compras fiscal produtos; do
    cp /home/user/logistica/docs/PROTOCOLO-FEDERACAO.md /home/user/$r/docs/PROTOCOLO-FEDERACAO.md
  done
  # conferir que ficaram idênticos
  md5sum /home/user/*/docs/PROTOCOLO-FEDERACAO.md
  ```
- O `CLAUDE.md` de cada repo aponta para ele no topo (bloco "⚠️ Antes de mexer em integração").
- Divergência entre cópias = defeito: a cópia mais nova (maior versão) vence e é replicada.

---

## 8. Pendências de coordenação conhecidas (24/09/2026 — para decisão do cliente)

1. **Fábrica:** o fix de login `e981f14` está na federação e **não** na `unified` (produção).
   Levar à `unified` (cherry-pick) e deployar, ou descartar. *(não feito nesta sessão: é código de
   produção da Fábrica, decisão do cliente)*
2. **Financeiro:** Integração Itaú Fase 1 vive só em `claude/financeiro-cobrancas-itau` /
   `claude/serene-hypatia-aukaeb` (julho) — fora da produção. Mesclar ou aposentar.
3. **`docs/MAPA-DO-SERVIDOR.md`** existe em 4 repos (agenda, fabrica, compras, financeiro) com
   **3 conteúdos diferentes** e "última verificação 26/06/2026" — ausente em logistica, rh, fiscal,
   produtos. A tabela §1 deste protocolo é a referência atual de portas/branches; o MAPA precisa de
   uma rodada de `diag-servidor.sh` no servidor e replicação (ou ser aposentado em favor deste arquivo).
4. **`main` atrasado** em logistica (01/07), agenda (27/05) e fabrica (09/06): decidir se o `main` é
   promovido por fast-forward à branch de produção (recomendado pela lição 2.4 da Logística) ou
   abandonado como referência. Enquanto não decidir: **ninguém ramifica do `main`**.
5. **Chaves legadas** (`SERVICE_API_KEY` no Comercial, `SERVICE_KEY` em Compras/Financeiro) seguem
   aceitas; migrar cada par para `SERVICE_KEY_<MODULO>` (script de migração já entregue ao cliente
   em 17/07/2026 para a Agenda).
6. **RH:** confirmar no servidor a branch do checkout (`/var/www/rh`).

---

## 9. Histórico deste protocolo

| Versão | Data | O quê |
|---|---|---|
| 1.0 | 24/09/2026 | Criação. Mapa dos 8 módulos (portas, PM2, bancos, branch de produção × federação × `main`, deploy); matriz de integração A–L com rotas, envs dos dois lados e comportamento sem o provedor; regras 1–10; checklist de mudança de contrato; regras por módulo (Logística em detalhe, por ser o próximo repo a ser alterado); índice do conhecimento; pendências 1–6. Fonte: código e branches lidos nesta data. |
