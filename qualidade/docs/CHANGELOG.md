# Changelog

Todas as alterações relevantes deste projeto serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [1.3.0] — 2026-06-10

### Alterado

- **Identidade visual oficial** aplicada: cores do brand-guide (preto #1D1D1B,
  branco, vermelho #C1212D, dourado #C6B784), tipografia **Manrope**
  (auto-hospedada, sem CDN) e **logotipo oficial** (versão preta) na topbar e no
  login; favicon com o selo oficial.

---

## [1.2.0] — 2026-06-10

### Alterado

- **Backend migrado para Node + PostgreSQL** (serviço unificado em `server/`),
  alinhado ao servidor de aplicativos da empresa (Node/Postgres/Nginx). O
  frontend passou a consumir `/api/qualidade/*` e `/api/auth/*`.
- Autenticação, CSRF e rate limiting (persistido em banco) agora no backend Node,
  com login compartilhado entre PCP e Qualidade.

### Removido

- Backend PHP (PDO/SQLite/Apache) e artefatos de Docker/Apache — substituídos
  pelo serviço Node. O frontend (HTML/CSS/JS) foi preservado.

---

## [1.1.0] — 2026-06-09

### Adicionado

- **Identidade visual Persianas Paraná**
  - Tokens de marca compartilhados (`assets/brand/tokens.css`) com cores e tipografia oficiais (`--pp-*`), importados pelo CSS do sistema
  - Logotipo da marca na topbar e na tela de login (`assets/brand/logo.svg`) e favicon (`logo-mark.svg`)
  - Botão primário com preenchimento da cor de marca (terracota)
- **Campo de ação corretiva** no formulário de NC (`acao_corretiva`), já suportado pelo banco e pela API; exibido também nos cards do histórico

### Alterado

- **Chart.js servido localmente** (`assets/vendor/chart.umd.min.js`, v4.5.1) em vez do CDN cdnjs — elimina dependência externa e reduz a superfície de ataque
- **UX de atualização de status**: o antigo `prompt()` com opções numéricas (1/2/3) foi substituído por um `<select>` inline no card, com o valor atual pré-selecionado e atualização imediata via API
- Topbar fixa (`sticky`) e áreas de toque maiores nas abas em telas pequenas (acessibilidade mobile)

### Segurança

- **Rate limiting de login agora persistido em banco** (tabela `login_attempts`, por usuário + IP) em vez de em `$_SESSION`. Correção de falha que tornava o bloqueio ineficaz contra brute force, pois um atacante que não reenvia o cookie de sessão recebia uma sessão nova a cada tentativa (OWASP A07)
- Content-Security-Policy mais estrita no `.htaccess` (sem CDN externo; `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`)

---

## [1.0.0] — 2026-05-05

### Adicionado

- **Núcleo da aplicação**
  - Registro completo de Não Conformidades (NC) com data, pedido, descrição, causa raiz, ação imediata, responsável, prazo
  - Multi-seleção de setores envolvidos e origens do erro
  - 9 setores parametrizados: Comercial, Fábrica, Instalação, Produto, Fornecedor, Logística, PCP, Expedição, Compras/Almox
  - 3 níveis de impacto (Baixo / Médio / Alto)
  - 3 estados de status (Aberta / Em andamento / Encerrada)

- **Visualização e análise**
  - Histórico filtrável por status e impacto
  - Aba específica para Planos de Ação pendentes
  - Dashboard de KPIs com 4 indicadores numéricos e 3 gráficos (Chart.js)
  - Geração automática de sugestões de treinamento por setor com base na frequência de erros

- **Backend**
  - API REST em PHP 8 (sem frameworks)
  - Suporte a SQLite (padrão) e MySQL/MariaDB
  - Repository pattern para isolamento de SQL
  - Schema criado automaticamente na primeira execução

- **Segurança**
  - Autenticação por sessão com cookies HttpOnly + SameSite=Lax
  - Senhas com `password_hash` (bcrypt)
  - Tokens CSRF em todas as operações de escrita
  - Rate limiting de tentativas de login (5 falhas → bloqueio de 15 min)
  - Prepared statements em 100% das queries (anti SQL Injection)
  - Escape HTML no frontend (anti XSS)
  - Cabeçalhos HTTP de segurança (CSP, X-Frame-Options, X-Content-Type-Options, etc.)
  - Bloqueio de acesso direto via HTTP a `src/`, `config/`, `data/` por `.htaccess`

- **Operações**
  - Script de instalação interativo (`scripts/install.php`)
  - Script de backup com rotação de 30 dias (`scripts/backup.sh`)
  - Tabela de auditoria (`audit_log`) registrando login, logout e CRUD de NCs

- **Documentação**
  - README com visão geral
  - Guia de implantação (DEPLOYMENT.md)
  - Documentação de arquitetura (ARCHITECTURE.md)
  - Especificação da API REST (API.md)
  - Modelo de segurança e checklist de hardening (SECURITY.md)
  - Manual do usuário final (USER_MANUAL.md)

### Conhecimento de Limitações

- Sem paginação no endpoint `GET /ncs.php` — adequado para volumes até ~5.000 NCs
- Sem busca textual em descrições
- Edição de NC limitada ao status (demais campos exigem reabertura via TI)
- Sem 2FA / MFA (planejado para 1.1)
- Cookies `Secure` exigem HTTPS — o sistema funciona em HTTP apenas em ambiente de teste
