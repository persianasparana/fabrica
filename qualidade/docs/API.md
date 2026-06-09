# Especificação da API REST

Documentação completa dos endpoints HTTP do sistema.

> **Base URL:** `/api/`
> **Formato:** JSON (request e response)
> **Autenticação:** Sessão via cookie `PERSIANAS_QSESS` (HttpOnly)
> **CSRF:** Header `X-CSRF-Token` obrigatório em POST/PUT/DELETE

---

## Convenções

### Formato de respostas

**Sucesso:**
```json
{ "data": [...] }
{ "id": 123, "message": "Criado com sucesso" }
```

**Erro:**
```json
{ "error": "Mensagem descritiva" }
```

### Códigos HTTP

| Código | Significado |
|---|---|
| `200 OK` | Sucesso (GET, PUT, DELETE) |
| `201 Created` | Recurso criado (POST) |
| `400 Bad Request` | JSON inválido ou parâmetro obrigatório ausente |
| `401 Unauthorized` | Não autenticado ou sessão expirada |
| `403 Forbidden` | Token CSRF inválido ou sem permissão |
| `404 Not Found` | Recurso inexistente |
| `405 Method Not Allowed` | Método HTTP não suportado pelo endpoint |
| `422 Unprocessable Entity` | Erro de validação de domínio |
| `429 Too Many Requests` | Rate limit (login bloqueado temporariamente) |
| `500 Internal Server Error` | Erro inesperado no servidor |

### Cabeçalhos comuns

**Request:**
```
Content-Type: application/json
X-CSRF-Token: <token obtido em GET /api/auth.php>
Cookie: PERSIANAS_QSESS=<gerado pelo servidor>
```

**Response:**
```
Content-Type: application/json; charset=utf-8
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```

---

## 1. Autenticação

### `GET /api/auth.php`

Retorna o usuário da sessão atual e o token CSRF.

**Autenticação:** obrigatória

**Resposta 200:**
```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "full_name": "Administrador",
    "role": "admin"
  },
  "csrf_token": "a1b2c3d4..."
}
```

**Resposta 401:** `{ "error": "Não autenticado" }`

---

### `POST /api/auth.php`

Login no sistema.

**Autenticação:** não requerida

**Corpo:**
```json
{
  "username": "joao.silva",
  "password": "senha-do-usuário"
}
```

**Resposta 200:** Igual ao GET acima — retorna usuário e token CSRF. Inicia a sessão (cookie).

**Resposta 401:** `{ "error": "Credenciais inválidas" }`

**Resposta 429:** `{ "error": "Muitas tentativas falhas. Tente novamente em alguns minutos." }`
> Bloqueio após 5 tentativas falhas (15 min de duração)

---

### `DELETE /api/auth.php`

Logout — destrói a sessão atual.

**Autenticação:** opcional (nunca falha)

**Resposta 200:** `{ "ok": true }`

---

## 2. Não Conformidades (NCs)

### `GET /api/ncs.php`

Lista todas as NCs com filtros opcionais.

**Autenticação:** obrigatória

**Query params (opcionais):**
- `status` — `Aberta` | `Em andamento` | `Encerrada`
- `impacto` — `Baixo` | `Médio` | `Alto`
- `data_inicio` — `YYYY-MM-DD`
- `data_fim` — `YYYY-MM-DD`

**Exemplo:**
```
GET /api/ncs.php?status=Aberta&impacto=Alto
```

**Resposta 200:**
```json
{
  "data": [
    {
      "id": 12,
      "pedido": "18363",
      "data_ocorrencia": "2026-04-29",
      "descricao": "Faltaram ripas de afastamento...",
      "causa_raiz": "Vendedor não solicitou no pedido",
      "acao_imediata": "Reagendamento da instalação",
      "acao_corretiva": "",
      "impacto": "Alto",
      "status": "Em andamento",
      "responsavel": "João Silva",
      "prazo": "2026-05-10",
      "setores": ["Comercial", "Fábrica", "Expedição", "Logística", "Instalação"],
      "origens": ["Comercial"],
      "created_by": 1,
      "created_at": "2026-04-30 08:15:42",
      "updated_at": "2026-04-30 08:15:42"
    }
  ]
}
```

---

### `GET /api/ncs.php?id=N`

Retorna uma NC específica.

**Resposta 200:** Objeto único (mesma estrutura acima, sem o wrapper `data`)
**Resposta 404:** `{ "error": "NC não encontrada" }`

---

### `POST /api/ncs.php`

Cria nova NC.

**Autenticação:** obrigatória
**CSRF:** obrigatório (`X-CSRF-Token`)

**Corpo:**
```json
{
  "pedido": "18363",
  "data_ocorrencia": "2026-04-29",
  "descricao": "Texto descritivo (obrigatório, max 5000 caracteres)",
  "causa_raiz": "Causa identificada (opcional)",
  "acao_imediata": "Ação tomada (opcional)",
  "impacto": "Alto",
  "status": "Aberta",
  "responsavel": "João Silva",
  "prazo": "2026-05-10",
  "setores": ["Comercial", "Fábrica"],
  "origens": ["Comercial"]
}
```

**Campos obrigatórios:** `data_ocorrencia` (YYYY-MM-DD) e `descricao`.

**Resposta 201:**
```json
{ "id": 13, "message": "NC criada com sucesso" }
```

**Resposta 422:** `{ "error": "Mensagem específica da validação" }`

**Validações aplicadas:**
- `data_ocorrencia` no formato YYYY-MM-DD
- `prazo` no formato YYYY-MM-DD (se fornecido)
- `impacto` em [Baixo, Médio, Alto]
- `status` em [Aberta, Em andamento, Encerrada]
- `descricao` máx 5000 caracteres

---

### `PUT /api/ncs.php?id=N`

Atualiza NC existente. Aceita atualização parcial — apenas os campos enviados serão alterados.

**Autenticação:** obrigatória
**CSRF:** obrigatório

**Exemplo (apenas atualizar status):**
```http
PUT /api/ncs.php?id=12
Content-Type: application/json
X-CSRF-Token: ...

{ "status": "Encerrada" }
```

**Resposta 200:** `{ "message": "NC atualizada com sucesso" }`
**Resposta 404:** `{ "error": "NC não encontrada" }`

---

### `DELETE /api/ncs.php?id=N`

Remove permanentemente uma NC. **A operação é registrada em audit_log.**

**Autenticação:** obrigatória
**CSRF:** obrigatório

**Resposta 200:** `{ "message": "NC excluída com sucesso" }`
**Resposta 404:** `{ "error": "NC não encontrada" }`

---

## 3. KPIs

### `GET /api/kpis.php`

Retorna indicadores agregados.

**Autenticação:** obrigatória

**Resposta 200:**
```json
{
  "total": 42,
  "abertas": 8,
  "andamento": 5,
  "encerradas": 29,
  "taxa_resolucao": 69.0,
  "impacto": {
    "Alto": 6,
    "Médio": 21,
    "Baixo": 15
  },
  "origens": {
    "Comercial": 18,
    "Fábrica": 9,
    "Instalação": 4,
    "PCP": 3,
    "Logística": 2
  },
  "evolucao": [
    { "data_ocorrencia": "2026-04-22", "c": 3 },
    { "data_ocorrencia": "2026-04-23", "c": 5 },
    { "data_ocorrencia": "2026-04-29", "c": 7 }
  ]
}
```

---

## 4. Exemplos com `curl`

### Login e armazenamento do cookie

```bash
# 1. Login (salva cookie em arquivo)
curl -c cookies.txt -X POST http://localhost/api/auth.php \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"senha123"}'

# 2. Obter token CSRF
TOKEN=$(curl -b cookies.txt http://localhost/api/auth.php | jq -r .csrf_token)

# 3. Listar NCs
curl -b cookies.txt http://localhost/api/ncs.php

# 4. Criar nova NC
curl -b cookies.txt -X POST http://localhost/api/ncs.php \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $TOKEN" \
  -d '{
    "data_ocorrencia": "2026-05-05",
    "descricao": "Teste via API",
    "impacto": "Médio",
    "setores": ["Comercial"],
    "origens": ["Comercial"]
  }'

# 5. KPIs
curl -b cookies.txt http://localhost/api/kpis.php
```

---

## 5. Limites e quotas

- **Tamanho máximo do corpo:** 5 MB (configurável em `.htaccess` via `LimitRequestBody`)
- **Tentativas de login:** 5 falhas → bloqueio de 15 min por usuário
- **Sessão:** 8 horas de inatividade (configurável em `config.php`)
- **Sem rate limit em endpoints autenticados** (controle a cargo da rede/firewall)
