# Sistema de Gestão de Não Conformidades

**Persianas Paraná** — Aplicação web para registro, acompanhamento e análise de não conformidades operacionais, com geração automática de KPIs, planos de ação e indicadores de treinamento por setor.

> Versão **1.0.0** · PHP 8.0+ · Apache 2.4+ · SQLite/MySQL

---

## Sumário

1. [Visão Geral](#visão-geral)
2. [Funcionalidades](#funcionalidades)
3. [Stack Tecnológica](#stack-tecnológica)
4. [Instalação Rápida](#instalação-rápida)
5. [Estrutura do Projeto](#estrutura-do-projeto)
6. [Documentação Completa](#documentação-completa)
7. [Segurança](#segurança)
8. [Licença](#licença)

---

## Visão Geral

Sistema desenvolvido para o processo de **acerto operacional diário**, no qual o setor de logística reporta as ocorrências de instalação do dia anterior. O sistema permite:

- Registrar não conformidades classificadas por setor de origem do erro
- Acompanhar planos de ação até o encerramento
- Visualizar KPIs em tempo real
- Identificar automaticamente necessidades de treinamento por setor

A finalidade é mapear de onde se originam os erros e atuar na causa raiz, não no sintoma.

---

## Funcionalidades

| Módulo | Descrição |
|---|---|
| **Registrar NC** | Formulário completo: data, pedido, setores envolvidos, origem do erro (multi-seleção), impacto, descrição, causa raiz, ação imediata, responsável, prazo, status |
| **Histórico** | Listagem filtrada por status, impacto e período |
| **Planos de Ação** | NCs abertas com botão para gerar plano 5W2H |
| **KPIs** | Total de NCs, taxa de resolução, gráficos por origem, evolução temporal e distribuição por impacto |
| **Treinamentos** | Sugestão automática de temas de treinamento priorizada por frequência de ocorrências |
| **Auditoria** | Log de todas as operações (login, criação, alteração, exclusão) |

---

## Stack Tecnológica

- **Backend:** PHP 8.0+ (sem frameworks pesados, vanilla com PDO)
- **Banco de Dados:** SQLite (padrão) ou MySQL/MariaDB (opcional)
- **Frontend:** HTML5, CSS3 (puro, sem build), JavaScript ES6+ (vanilla)
- **Gráficos:** Chart.js 4.x (via CDN)
- **Servidor:** Apache 2.4+ com `mod_rewrite`, `mod_headers`

**Por que essa stack?**
- Sem dependências do Composer ou npm — deploy direto, sem build step
- SQLite por padrão = zero configuração de banco
- Funciona em qualquer hospedagem PHP padrão

---

## Instalação Rápida

### Pré-requisitos

- Linux (Ubuntu/Debian/CentOS) ou Windows Server
- Apache 2.4+
- PHP 8.0+ com extensões: `pdo`, `pdo_sqlite` (ou `pdo_mysql`), `json`, `mbstring`, `session`

### Passo a passo

```bash
# 1. Extrair o ZIP no servidor
unzip persianas-parana-qualidade.zip -d /var/www/
cd /var/www/persianas-parana-qualidade

# 2. Executar o instalador (interativo)
php scripts/install.php

# 3. Ajustar permissões para o Apache
sudo chown -R www-data:www-data data/
sudo chmod -R 750 data/

# 4. Configurar o VirtualHost do Apache (ver docs/DEPLOYMENT.md)
sudo nano /etc/apache2/sites-available/qualidade.conf
sudo a2ensite qualidade
sudo systemctl reload apache2
```

Para o passo a passo completo, consulte **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Estrutura do Projeto

```
persianas-parana-qualidade/
├── public/                      # Document root do Apache
│   ├── index.html               # Aplicação principal (SPA)
│   ├── login.html               # Tela de login
│   ├── api/                     # Endpoints REST
│   │   ├── auth.php
│   │   ├── ncs.php
│   │   └── kpis.php
│   ├── assets/
│   │   ├── css/style.css
│   │   └── js/{app.js, login.js}
│   └── .htaccess                # Configuração Apache + segurança
│
├── src/                         # Código PHP server-side (NÃO acessível via web)
│   ├── bootstrap.php            # Inicialização compartilhada
│   ├── Database.php             # Camada de banco (PDO)
│   ├── Auth.php                 # Autenticação e sessão
│   ├── NCRepository.php         # Repositório de NCs
│   └── .htaccess                # Bloqueia acesso HTTP
│
├── config/
│   ├── config.example.php       # Modelo de configuração
│   └── config.php               # Configuração ativa (gerada na instalação)
│
├── data/                        # Banco SQLite + logs (NÃO versionar)
├── docs/                        # Documentação técnica
├── scripts/                     # Scripts CLI (instalação, backup)
└── README.md                    # Este arquivo
```

---

## Documentação Completa

Toda a documentação técnica está em **`docs/`**:

| Documento | Descrição |
|---|---|
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Guia completo de instalação e configuração de produção |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura, camadas, fluxos de dados |
| [API.md](docs/API.md) | Especificação dos endpoints REST |
| [SECURITY.md](docs/SECURITY.md) | Modelo de segurança e checklist de hardening |
| [USER_MANUAL.md](docs/USER_MANUAL.md) | Manual do usuário final |
| [CHANGELOG.md](docs/CHANGELOG.md) | Histórico de versões |

---

## Segurança

Implementações de segurança em conformidade com **OWASP Top 10**:

- ✅ **A01 (Broken Access Control)** — Sessões com regeneração de ID, autenticação obrigatória em todos os endpoints exceto login
- ✅ **A02 (Cryptographic Failures)** — Senhas com `password_hash` (bcrypt), cookies HttpOnly + Secure + SameSite=Lax
- ✅ **A03 (Injection)** — Prepared statements PDO em 100% das queries
- ✅ **A04 (Insecure Design)** — Rate limiting de tentativas de login com bloqueio temporário
- ✅ **A05 (Security Misconfiguration)** — Cabeçalhos HTTP de segurança via Apache, modo debug desativado em produção
- ✅ **A07 (Auth Failures)** — Tokens CSRF para operações de escrita, sessões com expiração
- ✅ **A09 (Logging)** — Auditoria completa de operações sensíveis em `audit_log`

Consulte **[docs/SECURITY.md](docs/SECURITY.md)** para o checklist completo de hardening.

---

## Suporte

- **TI Persianas Paraná** — para questões de infraestrutura e manutenção
- **Setor de Qualidade** — para questões de uso e processos

---

## Licença

Software proprietário da **Persianas Paraná**. Uso interno restrito. Distribuição ou modificação fora da empresa requer autorização expressa.

© 2026 Persianas Paraná. Todos os direitos reservados.
