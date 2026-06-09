# Arquitetura

Documentação técnica da arquitetura do **Sistema de Gestão de Não Conformidades**.

> **Público-alvo:** Desenvolvedores, arquitetos, equipe de TI envolvida em manutenção evolutiva.

---

## 1. Visão Geral

Aplicação **monolítica simples** com separação clara entre frontend (SPA-lite) e backend (API REST). Escolhas deliberadas para minimizar dependências externas e facilitar a operação por equipes sem familiaridade com toolchains modernos de JavaScript.

```
┌─────────────────────────────────────────────────────┐
│                  NAVEGADOR DO USUÁRIO               │
│  ┌──────────────────────────────────────────────┐   │
│  │ HTML + CSS + JS (vanilla) + Chart.js (CDN)   │   │
│  └──────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS (JSON)
                         ▼
┌─────────────────────────────────────────────────────┐
│                  APACHE 2.4                         │
│   ┌──────────────────────────────────────────────┐  │
│   │  /public/                                    │  │
│   │    ├─ index.html, login.html, assets/        │  │
│   │    └─ api/*.php  ──────────┐                 │  │
│   └────────────────────────────┼─────────────────┘  │
│                                ▼                    │
│   ┌──────────────────────────────────────────────┐  │
│   │  /src/  (PHP — não acessível via HTTP)       │  │
│   │    ├─ bootstrap.php                          │  │
│   │    ├─ Database.php (PDO)                     │  │
│   │    ├─ Auth.php                               │  │
│   │    └─ NCRepository.php                       │  │
│   └─────────────┬────────────────────────────────┘  │
│                 │                                   │
│                 ▼                                   │
│   ┌──────────────────────────────────────────────┐  │
│   │  /data/qualidade.db (SQLite)                 │  │
│   └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 2. Camadas

### 2.1. Apresentação (Frontend)

- **Tecnologias:** HTML5 + CSS3 (puro) + JavaScript ES6+ (vanilla, IIFE)
- **Sem build step:** o código fonte é o código de produção
- **Localização:** `public/index.html`, `public/login.html`, `public/assets/`
- **Comunicação com backend:** `fetch()` para `/api/*.php`, sempre com `credentials: 'same-origin'`

**Padrões aplicados:**
- IIFE para isolamento de escopo (evita poluição do `window`)
- Estado centralizado em objeto `state` (sem framework de gerenciamento)
- Escape explícito de HTML (`escapeHtml()`) em todo conteúdo dinâmico
- Tokens CSRF anexados em todos os requests de escrita

### 2.2. API REST (Backend)

- **Endpoints:** PHP simples em `public/api/`
- **Bootstrap compartilhado:** `src/bootstrap.php` carregado por todos os endpoints
- **Formato:** JSON in/out, com Content-Type explícito

| Endpoint | Método | Função |
|---|---|---|
| `/api/auth.php` | GET | Sessão atual + token CSRF |
| `/api/auth.php` | POST | Login |
| `/api/auth.php` | DELETE | Logout |
| `/api/ncs.php` | GET | Listar NCs (com filtros) |
| `/api/ncs.php` | POST | Criar NC |
| `/api/ncs.php?id=N` | PUT | Atualizar NC |
| `/api/ncs.php?id=N` | DELETE | Excluir NC |
| `/api/kpis.php` | GET | Indicadores agregados |

Especificação completa em [API.md](API.md).

### 2.3. Domínio (Business Logic)

Camada implementada como classes PHP em `src/`:

- **`Database`** — Singleton com PDO, suporta SQLite e MySQL. Cria schema automaticamente.
- **`Auth`** — Sessão, login, CSRF, rate limiting de tentativas falhas, auditoria.
- **`NCRepository`** — Repository pattern para operações sobre NCs. Inclui validações.

### 2.4. Persistência

- **SQLite** (padrão): banco em arquivo único `data/qualidade.db`
- **MySQL/MariaDB** (opcional): alternativa para volumes maiores

Schema definido em `Database::createSchema()` (idempotente — pode ser chamado múltiplas vezes sem efeito colateral).

#### Tabelas

```sql
users (id, username, password_hash, full_name, role, active, created_at, last_login)
nao_conformidades (id, pedido, data_ocorrencia, descricao, causa_raiz, acao_imediata,
                   acao_corretiva, impacto, status, responsavel, prazo,
                   setores [JSON], origens [JSON], created_by, created_at, updated_at)
audit_log (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
```

**Decisão:** os campos `setores` e `origens` são armazenados como JSON em vez de tabelas relacionais, porque:
- A lista de setores é pequena e estável
- Permite seleção múltipla sem joins complexos
- Simplifica drasticamente o código de leitura/escrita

---

## 3. Fluxos Principais

### 3.1. Login

```
1. Usuário envia POST /api/auth.php com {username, password}
2. Auth::attempt() verifica rate limiting (anti brute force)
3. Busca usuário com prepared statement
4. password_verify() compara hash bcrypt
5. Sucesso:
   - session_regenerate_id(true)  — anti session fixation
   - Grava user_id na sessão
   - Registra em audit_log
   - Retorna {user, csrf_token}
6. Falha:
   - Incrementa contador de tentativas falhas
   - Após 5 tentativas: bloqueio de 15 min
   - Retorna 401 sempre com mesma mensagem (não revela se usuário existe)
```

### 3.2. Criação de NC

```
1. Frontend valida campos obrigatórios localmente
2. POST /api/ncs.php com header X-CSRF-Token e corpo JSON
3. Backend:
   - bootstrap.php inicializa sessão e DB
   - auth.requireAuth() verifica sessão
   - requireCsrf() valida token
   - NCRepository::create():
     a. validate() — regras de negócio
     b. INSERT com prepared statement
     c. logAudit() — registra ação
4. Retorna {id, message} com status 201
```

### 3.3. Geração de KPIs

```
1. GET /api/kpis.php
2. NCRepository::getKpis() executa múltiplas queries agregadas:
   - COUNT por status, impacto
   - Distribuição por origem (com decode JSON em loop)
   - Evolução temporal (GROUP BY data)
3. Frontend recebe e renderiza com Chart.js
```

---

## 4. Decisões de Design

### 4.1. Por que sem framework PHP (Laravel/Symfony)?

- Equipe de TI da empresa pode não ter familiaridade
- Composer/dependências adicionam complexidade de deploy
- Volume de funcionalidades não justifica
- Desempenho excelente sem overhead

### 4.2. Por que sem framework JS (React/Vue)?

- Sem build step = sem ferramentas adicionais no servidor
- Aplicação tem ~5 telas e estado simples
- Desempenho de carregamento muito superior

### 4.3. Por que SQLite por padrão?

- Zero configuração para o cliente
- Backup trivial (copiar 1 arquivo)
- Performance suficiente para dezenas de usuários simultâneos
- Migração para MySQL é simples se necessário

### 4.4. Por que Repository Pattern?

- Encapsula SQL em um único lugar
- Facilita testes e manutenção
- Permite trocar a implementação (ex: cache) sem alterar callers

### 4.5. Por que tokens CSRF em vez de SameSite=Strict?

- SameSite=Strict ainda tem variações entre navegadores
- CSRF tokens são defesa em profundidade
- Trabalham em conjunto

---

## 5. Pontos de Extensão

Para evoluções futuras, considere os seguintes pontos:

### 5.1. Adicionar novos campos à NC

1. Adicionar coluna em `Database::createSchema()` (criar nova migration manualmente)
2. Atualizar validação em `NCRepository::validate()`
3. Adicionar campo no formulário (`public/index.html`)
4. Atualizar `app.js` para enviar/exibir o campo

### 5.2. Adicionar novo endpoint

1. Criar `public/api/novo.php` seguindo padrão dos existentes
2. Sempre começar com `require '../../src/bootstrap.php';`
3. Sempre incluir `$auth->requireAuth();` se for endpoint protegido
4. Usar `requireCsrf()` em operações de escrita

### 5.3. Notificações por email

A camada de logging em `audit_log` já permite hooks. Sugestão:
- Novo arquivo `src/Notifier.php` que envia email via PHPMailer ou `mail()`
- Disparar de `NCRepository::create()` quando `impacto === 'Alto'`

### 5.4. Exportação de relatórios (PDF/Excel)

- Criar endpoint `/api/export.php?format=pdf|xlsx`
- Para PDF: TCPDF ou DomPDF (composer)
- Para Excel: PhpSpreadsheet (composer)
- Adicionar botão no frontend

### 5.5. Múltiplos usuários simultâneos com perfis

A coluna `role` na tabela `users` já existe. Para implementar:
- Adicionar verificação `if ($user['role'] !== 'admin')` em endpoints sensíveis
- Criar tela de gerenciamento de usuários

---

## 6. Limites Conhecidos

- **SQLite + alta concorrência:** Para >50 usuários simultâneos com escritas frequentes, migrar para MySQL
- **Sem soft delete:** Exclusão é permanente (mas registrada em audit_log)
- **Sem paginação:** O endpoint `GET /ncs.php` retorna todas as NCs. Para grandes volumes, adicionar paginação.
- **Sem busca textual:** Não há índice full-text em descrições. Para busca avançada, considerar SQLite FTS5 ou ElasticSearch.

---

## 7. Convenções de Código

### PHP
- `declare(strict_types=1)` em todos os arquivos
- Type hints em parâmetros e retornos
- PSR-12 para estilo (4 espaços, chaves em nova linha para classes)
- Comentários em português (público-alvo da empresa)

### JavaScript
- `'use strict'` no topo dos IIFEs
- `const` por padrão, `let` quando precisar reassinalar
- `async/await` em vez de `.then()` quando possível

### CSS
- Variáveis CSS em `:root` para temas
- BEM-like nas classes (sem complicar demais)
- Mobile-first com `@media (max-width: ...)`

---

**Para detalhes de segurança, consulte:** [SECURITY.md](SECURITY.md).
