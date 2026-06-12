# Integração — fabrica (PCP + Qualidade)

> **Para quem vai integrar OUTRO sistema a este.** Documento autossuficiente:
> identidade, topologia no servidor, autenticação, referência completa da API,
> modelo de dados e padrões de integração. Não pressupõe contexto prévio.
>
> Repositório: `persianasparana/fabrica` · Stack: **Node + Express + PostgreSQL**,
> atrás do **Nginx**, processo **PM2**. Tudo em português.

---

## 1. O que é e onde roda

`fabrica` é um único serviço Node que serve **dois sistemas** e suas APIs:

- **PCP** — planejamento e controle da produção (pedidos, peças, bipagem por
  setor, estrutura do produto, status, indicadores).
- **Qualidade** — não conformidades + KPIs.

| Recurso | Valor |
|---|---|
| Processo (PM2) | **`fabrica-server`** |
| Porta interna | **`127.0.0.1:3020`** (não exposta direto) |
| Diretório | **`/var/www/fabrica`** |
| Banco PostgreSQL | **`fabrica_db`** (role **`fabrica_user`**) · `localhost:5432` |
| Rota pública (Nginx) | **`/fabrica/`** → `/fabrica/pcp/`, `/fabrica/qualidade/`, `/fabrica/api/*` |
| Health check | `GET /healthz` → `{"ok":true}` |
| Identidade visual | `shared/brand/` (preto #1D1D1B, vermelho #C1212D, dourado #C6B784, Manrope) |

> O Nginx encaminha `/fabrica/` → `127.0.0.1:3020` removendo o prefixo `/fabrica`.
> Internamente as rotas são `/api/...`, `/pcp/...`, `/qualidade/...`.
> Detalhes em [`DEPLOYMENT.md`](DEPLOYMENT.md) e [`SERVIDOR-COMPARTILHADO.md`](SERVIDOR-COMPARTILHADO.md).

**Base URL das APIs**
- De dentro do servidor (server-to-server): `http://127.0.0.1:3020/api`
- Pela rede/VPN (via Nginx): `https://192.168.0.207/fabrica/api`

---

## 2. Autenticação e autorização

Sessão por **cookie** (`fabrica.sid`, HttpOnly) + **CSRF** por token. Não há
API key/JWT — a integração server-to-server usa uma **conta de serviço**.

### 2.1 Fluxo

1. `POST /api/auth/login` com `{ "username", "password" }` →
   resposta `{ user, csrf_token }` e **Set-Cookie: fabrica.sid=...**.
2. Guardar o **cookie** (cookie jar) e o **`csrf_token`**.
3. Em toda **escrita** (POST/PUT/DELETE), enviar o cookie **e** o header
   `X-CSRF-Token: <csrf_token>`. Leituras (GET) precisam só do cookie.
4. `GET /api/auth/session` revalida e devolve `{ user, csrf_token }` (401 se anônimo).
5. `POST` ou `DELETE /api/auth/logout` encerra.

Sessão: cookie `SameSite=Lax`, `Secure` sob HTTPS, validade padrão 8h (rolling).

### 2.2 Exemplo server-to-server (curl)

```bash
JAR=cookie.txt
CSRF=$(curl -s -c $JAR -X POST -H 'Content-Type: application/json' \
  -d '{"username":"integracao","password":"SENHA"}' \
  http://127.0.0.1:3020/api/auth/login | jq -r .csrf_token)

# leitura
curl -s -b $JAR http://127.0.0.1:3020/api/pcp/itens

# escrita (cookie + CSRF)
curl -s -b $JAR -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"itens":[{"pedido":"19999","produto":"ROLO SOFT LISA","data_cliente":"2026-12-31"}]}' \
  http://127.0.0.1:3020/api/pcp/itens/lote
```

### 2.3 Papéis e permissões

- **role `admin`** → acesso total (inclui rotas de admin: setores, usuários, status).
- **role `user`** → governado por `permissoes` (JSONB por aba): cada aba pode ser
  `none` | `ver` | `editar`. O backend exige `editar` nas escritas das abas
  `novo`, `fila`, `pedido`, `bipagem`, `estrutura` (admin ignora a matriz).
- Para integração, **crie uma conta de serviço `admin`** (ou `user` com `editar`
  nas abas que vai escrever) via aba Usuários ou direto na API de usuários.

### 2.4 CORS

Não há CORS configurado (mesma origem). Server-to-server (sem navegador) funciona
com cookie + CSRF. Se o outro app precisar chamar **do navegador em outra origem**,
é necessário habilitar CORS — peça que isso é um ajuste pequeno (`cors` + lista de
origens em env), nos moldes do app de Logística.

---

## 3. Referência da API

Prefixo: `/api`. Todas exigem sessão (401 sem login). Escritas exigem
`X-CSRF-Token`. "Perm" = permissão exigida para `role user` (admin sempre pode).
**Só as escritas são gateadas no servidor**; os GETs exigem apenas autenticação
(o controle "ver" por aba é aplicado no frontend). Logo, uma conta de serviço
`user` lê tudo, mas só escreve onde tiver `editar`.

### 3.1 Autenticação — `/api/auth`

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/auth/login` | `{username, password}` | `{user, csrf_token}` · 401 inválido · 429 bloqueado |
| GET | `/auth/session` | — | `{user, csrf_token}` · 401 anônimo |
| POST/DELETE | `/auth/logout` | — | `{ok:true}` |

`user` = `{ id, username, full_name, role, permissoes, setores:[id] }`.

### 3.2 PCP — fila de produção (`/api/pcp/itens`)

Cada item = um produto de um pedido. Item com `qnt` N gera N **peças**
(`pcp_pecas`). A `conclusao` do item é **derivada** (fecha quando todas as peças
têm baixa).

| Método | Rota | Perm | Descrição |
|---|---|---|---|
| GET | `/pcp/itens` | (autenticado) | Lista todos os itens (com `pecas[]`, `status_*`, `especial`) |
| POST | `/pcp/itens` | editar novo | Cria item (`{produto, pedido, qnt, data_cliente, ...}`; `etiqueta` opcional vincula à peça 1) → `{id, item}` |
| POST | `/pcp/itens/lote` | editar novo | `{itens:[...], substituir?}` em transação → `{ids, count}` |
| PUT | `/pcp/itens?id=N` | editar fila | Atualização parcial (datas, tipo, motivo, `especial`, `status_id`, `qnt`, `conclusao`) |
| DELETE | `/pcp/itens?id=N` | editar fila | Exclui item (cascata nas peças) |

Campos do item: `produto, produto_id, pedido, qnt, chegada_pcp, prev_inicial,
prev_producao, conclusao, data_cliente, tipo, motivo_atraso, observacoes,
especial(bool), status_id`. Datas em `YYYY-MM-DD`. `tipo` ∈ {Produção nova,
Retrabalho, Higienização, Carry-over 2025, Showroom}.

### 3.3 PCP — pedido (edição em massa) (`/api/pcp/pedido`)

| Método | Rota | Perm | Descrição |
|---|---|---|---|
| GET | `/pcp/pedido?pedido=NNN` | (autenticado) | Todos os itens/peças do pedido |
| PUT | `/pcp/pedido?pedido=NNN` | editar pedido | Campos comuns + `acao:'concluir'\|'reabrir'` (todas as peças) + `status_id` |
| DELETE | `/pcp/pedido?pedido=NNN` | editar pedido | Exclui o pedido inteiro |

### 3.4 PCP — bipagem por setor (`/api/pcp/bip`)

| Método | Rota | Perm | Descrição |
|---|---|---|---|
| POST | `/pcp/bip` | editar bipagem | `{codigo, setor_id, evento:'inicio'\|'fim'}`. Início assume o status do setor (após dependências do roteiro estarem "fim"); Fim do setor com status **final** dá baixa. Respostas `acao`: `inicio\|fim\|baixa\|jafoi\|desconhecido` |
| POST | `/pcp/bip/vincular` | editar bipagem | `{codigo, pedido}` vincula etiqueta à próxima peça livre do pedido |
| PUT | `/pcp/pecas?id=N` | editar fila | Ajustes por peça: `{cod_barras:null}` desvincula, `{conclusao:'YYYY-MM-DD'\|null}` baixa/reabre |

### 3.5 PCP — estrutura do produto (`/api/pcp/estrutura`)

| Método | Rota | Perm | Descrição |
|---|---|---|---|
| GET | `/pcp/estrutura` | (autenticado) | Produtos ativos: `cortes[]` (c/ `setor_id`), `componentes[]`, `roteiro[]` |
| POST | `/pcp/estrutura` | editar estrutura | Cria produto `{nome, familia, tubo, unidade, cortes, componentes, roteiro}` |
| PUT | `/pcp/estrutura?id=N` | editar estrutura | Atualização parcial |
| DELETE | `/pcp/estrutura?id=N` | editar estrutura | Desativa (lógico) |

`cortes[]` = `{nome, formula, dim:'L'\|'A', qtd?\|qtdFormula?, setor_id?}`.
`roteiro[]` = `{setor_id, depende_de:[setor_id,...]}`.

### 3.6 PCP — status, setores, usuários (admin)

| Método | Rota | Perm | Descrição |
|---|---|---|---|
| GET | `/pcp/status` | (autenticado) | Status ativos `{id,nome,cor,ordem,final}` |
| POST/PUT/DELETE | `/pcp/status` | **admin** | Mantém status; `final` marca o que dá baixa |
| GET | `/pcp/setores` | (autenticado) | Setores `{id,nome,cor,ordem,status_id,status_*}` |
| POST/PUT/DELETE | `/pcp/setores` | **admin** | Mantém setores (associa a um status) |
| GET | `/pcp/usuarios` | **admin** | Lista usuários (+ `permissoes`, `setores`) |
| POST | `/pcp/usuarios` | **admin** | Cria `{username, password, full_name, role, permissoes, setores}` |
| PUT | `/pcp/usuarios?id=N` | **admin** | Atualiza (inclui `password`, `active`) |
| DELETE | `/pcp/usuarios?id=N` | **admin** | Exclui (não o último admin / nem a si) |

### 3.7 Qualidade — `/api/qualidade`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/qualidade/ncs` (`?id=` ou filtros `status,impacto,data_inicio,data_fim`) | Lista / lê NC |
| POST/PUT/DELETE | `/qualidade/ncs` (`?id=` em PUT/DELETE) | Cria/atualiza/remove NC (CSRF) |
| GET | `/qualidade/kpis` | Indicadores agregados |

Erros: JSON `{ "error": "mensagem" }` com status HTTP adequado (400/401/403/404/409/422/429/500).

---

## 4. Modelo de dados (PostgreSQL `fabrica_db`)

Compartilhado: **`users`** (login dos dois sistemas), `login_attempts`,
`audit_log`, `session` (connect-pg-simple).

```
users(id, username UNIQUE, password_hash, full_name, role['admin'|'user'],
      active, permissoes JSONB, created_at, last_login)
usuario_setores(user_id → users, setor_id → pcp_setores)            [N:N]

pcp_status(id, nome UNIQUE, cor, ordem, final BOOL, ativo)
pcp_setores(id, nome UNIQUE, cor, ordem, status_id → pcp_status, ativo)

pcp_produtos(id, chave UNIQUE, nome, familia, tubo, unidade['cm'|'m'],
             cortes JSONB, componentes JSONB, roteiro JSONB,
             calculo_extra_fonte, ativo)
   cortes[]  = {nome, formula, dim, qtd?|qtdFormula?, setor_id?}
   roteiro[] = {setor_id, depende_de:[setor_id]}

pcp_itens(id, produto, produto_id → pcp_produtos, pedido, qnt,
          chegada_pcp, prev_inicial, prev_producao, conclusao, data_cliente,
          tipo, motivo_atraso, observacoes, especial BOOL,
          status_id → pcp_status, created_by, created_at, updated_at)

pcp_pecas(id, item_id → pcp_itens (CASCADE), numero, cod_barras UNIQUE,
          conclusao, concluida_por, vinculada_em)        [1 etiqueta por peça]

pcp_peca_etapas(id, peca_id → pcp_pecas (CASCADE), setor_id → pcp_setores,
                inicio, fim, inicio_por, fim_por, UNIQUE(peca_id,setor_id))

nao_conformidades(id, pedido, data_ocorrencia, descricao, causa_raiz,
                  acao_imediata, acao_corretiva, impacto, status, responsavel,
                  prazo, setores JSONB, origens JSONB, created_by, ...)
```

Regras derivadas importantes:
- **Conclusão do item** = derivada das peças (fecha quando todas as peças têm `conclusao`).
- **Status da peça/item** muda na bipagem: `inicio` de um setor → item recebe o
  `status_id` do setor; o `fim` de um setor cujo status tem `final=true` → baixa da peça.
- **Dependências** (roteiro do produto) bloqueiam o `inicio` de um setor até os
  setores de que ele depende estarem com `fim`.
- IDs `BIGINT` chegam ao cliente como **string** no JSON (precisão) — compare com `==`/`String()`.

---

## 5. Padrões de integração recomendados

1. **HTTP REST com conta de serviço** (recomendado). O outro app autentica com um
   usuário dedicado e consome/produz dados via as rotas da Seção 3. Vantagens:
   respeita validações, permissões, transações e auditoria do fabrica.
2. **NÃO fazer cross-database** entre `fabrica_db` e o banco do outro app
   (regra do servidor compartilhado — ver `SERVIDOR-COMPARTILHADO.md`). Se for
   imprescindível ler dados crus, prefira uma rota REST nova de leitura.
3. **Webhooks/eventos**: o fabrica ainda **não emite** eventos. Se a integração
   precisar reagir a mudanças (ex.: "peça concluída"), as opções são: polling em
   `GET /pcp/itens` (ou um endpoint de "modificados desde"), ou adicionar emissão
   de eventos — ambos são extensões pequenas e podem ser pedidas.
4. **Identificadores de ligação**: o `pedido` (texto) e a `etiqueta` da peça
   (`cod_barras`, única) são as chaves naturais para casar dados com o outro
   sistema (que gera as etiquetas).

### Pontos de extensão prováveis para a integração
- Endpoint de **importação de pedidos** já existe (`POST /pcp/itens/lote`) — ideal
  para o outro app empurrar pedidos para o PCP.
- Endpoint de **leitura da fila** (`GET /pcp/itens`) e **por pedido**
  (`GET /pcp/pedido?pedido=`) para o outro app consultar status/baixas.
- Se precisar de filtros server-side, paginação ou "delta desde X", peça — são
  adições simples.

---

## 6. Convivência no servidor (NÃO quebrar)

O servidor `aplicativos` (192.168.0.207) roda **Logística** e **Agenda** em
produção. O fabrica é isolado: porta **3020**, processo **fabrica-server**, banco
**fabrica_db**, dir **/var/www/fabrica**, rota **/fabrica/**. **Não** reutilizar
portas/processos/bancos dos outros, nem editar `location` existentes do Nginx.
Reservas completas em [`SERVIDOR-COMPARTILHADO.md`](SERVIDOR-COMPARTILHADO.md).

---

## 7. Operação

```bash
# subir / atualizar
cd /var/www/fabrica && git pull && bash deploy/install.sh
pm2 status fabrica-server
pm2 logs fabrica-server
curl -s http://127.0.0.1:3020/healthz

# backup do banco
pg_dump -U fabrica_user -h 127.0.0.1 fabrica_db | gzip > fabrica_$(date +%F).sql.gz
```

Variáveis em `server/.env` (ver `server/.env.example`): conexão PostgreSQL,
`SESSION_SECRET`, `TRUST_PROXY`/`COOKIE_SECURE` (atrás de HTTPS), `PORT=3020`.

---

## 8. Mapa de arquivos (para quem for ler o código)

```
server/
  src/server.js              # app Express: helmet, sessão, mounts, estáticos
  src/db.js                  # pool pg + schema (migração idempotente) — fonte do modelo de dados
  src/auth.js                # login, sessão, CSRF, requireAuth/requireAdmin/requirePerm
  src/routes/auth.js         # /api/auth
  src/routes/pcp.js          # /api/pcp: itens, pedido, bip, pecas, estrutura, status
  src/routes/admin.js        # /api/pcp: setores, usuarios (admin)
  src/routes/qualidade.js    # /api/qualidade: ncs, kpis
  src/seed.js, bin/install.js# seeds (status, setores, estrutura, fila) + instalador
pcp/public/                  # frontend do PCP (HTML/CSS/JS, sem build)
qualidade/public/            # frontend do Qualidade
docs/                        # ARCHITECTURE, DEPLOYMENT, SERVIDOR-COMPARTILHADO, INTEGRACAO (este)
```

Dúvidas de arquitetura: [`ARCHITECTURE.md`](ARCHITECTURE.md). Implantação:
[`DEPLOYMENT.md`](DEPLOYMENT.md).
