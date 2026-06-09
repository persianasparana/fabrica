# Modelo de Segurança e Hardening

Documento técnico de segurança do sistema, alinhado às recomendações **OWASP Top 10:2021** e às boas práticas internacionais para aplicações web corporativas.

---

## 1. Modelo de Ameaças

### 1.1. Ativos

| Ativo | Sensibilidade | Impacto se comprometido |
|---|---|---|
| Banco de não conformidades | Médio | Perda de histórico operacional |
| Credenciais de usuários | Alto | Acesso indevido ao sistema |
| Logs de auditoria | Médio | Perda de rastreabilidade |
| Configuração (`secret_key`) | Alto | Quebra de tokens CSRF e sessões |

### 1.2. Atores de ameaça considerados

- **Externo não autenticado** — atacantes da internet (mitigado por restrição de rede + autenticação)
- **Interno autenticado mal-intencionado** — colaboradores com credenciais válidas (mitigado por auditoria + perfis de acesso)
- **Erro humano** — exclusões acidentais, configuração equivocada (mitigado por backup + logs)

---

## 2. Controles Implementados (OWASP Top 10:2021)

### A01 — Broken Access Control

✅ Autenticação obrigatória em todos os endpoints exceto `POST /api/auth.php` (login) e arquivos estáticos
✅ `Auth::requireAuth()` invocado no início de cada endpoint protegido
✅ Sessões com regeneração de ID a cada 30 minutos (anti session fixation)
✅ Cookies HttpOnly + SameSite=Lax + Secure (em HTTPS)
✅ Diretórios `src/`, `config/`, `data/` bloqueados via `.htaccess` independente

### A02 — Cryptographic Failures

✅ Senhas armazenadas com `password_hash()` usando algoritmo padrão do PHP (atualmente bcrypt)
✅ `password_verify()` para comparação resistente a timing attacks
✅ `secret_key` aleatório de 256 bits gerado na instalação
✅ HTTPS obrigatório em produção (configurável via `.htaccess`)
✅ Cookie de sessão com flag `Secure` em produção
⚠️ Recomendação: utilizar HSTS após HTTPS estabilizado (`Strict-Transport-Security: max-age=63072000`)

### A03 — Injection

✅ **100% das queries usam prepared statements** (PDO com `ATTR_EMULATE_PREPARES = false`)
✅ Validação de tipo nas entradas (`InvalidArgumentException` em `NCRepository::validate()`)
✅ Charset UTF-8 forçado em todas as conexões
✅ Escape HTML explícito (`escapeHtml()`) em todo conteúdo dinâmico no frontend (anti XSS)
✅ Cabeçalho `X-Content-Type-Options: nosniff`

### A04 — Insecure Design

✅ Rate limiting de tentativas de login (5 falhas → 15 min de bloqueio)
✅ Logs de auditoria para operações sensíveis
✅ Mensagens de erro genéricas em login (não revelam se usuário existe)
✅ Princípio do menor privilégio: apenas `data/` é gravável pelo Apache

### A05 — Security Misconfiguration

✅ Modo debug desativado em produção (configurável)
✅ Cabeçalhos HTTP de segurança via Apache:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: geolocation=(), microphone=(), camera=()`
  - `Content-Security-Policy: default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; ...`
✅ `Options -Indexes` impede listagem de diretórios
✅ Bloqueio explícito a arquivos `.env`, `.log`, `.db`, `.sqlite*`
✅ `LimitRequestBody 5242880` mitiga DoS por upload

### A06 — Vulnerable Components

✅ Sem dependências de Composer ou npm — superfície de ataque mínima
⚠️ Chart.js carregado via CDN (cdnjs.cloudflare.com) — verificar SRI em versões futuras
✅ Manter PHP atualizado (responsabilidade do administrador do servidor)

### A07 — Identification and Authentication Failures

✅ Senhas mínimas de 8 caracteres (configurável em `Auth::createUser()`)
✅ Hash bcrypt com custo padrão (10) — ajustar para 12 em servidores potentes
✅ Sessão expira em 8 horas (configurável)
✅ Logout destrói cookie e sessão server-side
✅ Tokens CSRF em todos os endpoints de escrita

### A08 — Software and Data Integrity Failures

✅ Tokens CSRF impedem requisições forjadas de outros domínios
✅ Auditoria de operações de escrita em `audit_log` com `created_at`, `user_id`, `ip_address`
⚠️ Recomendação: assinar/verificar backups antes de restauração

### A09 — Security Logging and Monitoring

✅ Tabela `audit_log` registra: login, logout, criação/atualização/exclusão de NCs
✅ Logs do Apache em `/var/log/apache2/qualidade-*.log`
✅ Erros PHP gravados em log do servidor (não exibidos ao usuário)
⚠️ Recomendação: integrar com SIEM (rsyslog, fail2ban) para correlação

### A10 — Server-Side Request Forgery (SSRF)

✅ A aplicação não realiza requests HTTP a partir do servidor — risco zero para SSRF

---

## 3. Checklist de Hardening Operacional

### Antes de ir para produção

- [ ] HTTPS configurado com certificado válido
- [ ] `session_secure_cookie => true` em `config/config.php`
- [ ] HSTS habilitado no Apache
- [ ] `app.environment => 'production'` e `debug => false`
- [ ] Permissões de arquivos: `config.php` em 640, `data/` em 750, demais 644/755
- [ ] Apache rodando como `www-data`, não como `root`
- [ ] Acesso à porta 80/443 apenas pela rede interna ou via VPN/firewall
- [ ] `.htaccess` ativos (`AllowOverride All` no VirtualHost)
- [ ] Senha do usuário admin com pelo menos 12 caracteres, mistura de tipos
- [ ] Backups automáticos via cron (`scripts/backup.sh`)
- [ ] Backup off-site configurado
- [ ] Atualizações automáticas do SO habilitadas (ou processo manual mensal)

### Manutenção contínua

- [ ] Atualizar PHP e Apache mensalmente
- [ ] Revisar `audit_log` semanalmente em busca de anomalias
- [ ] Revisar tentativas de login falhas (`/var/log/apache2/qualidade-access.log`)
- [ ] Testar restauração de backup trimestralmente
- [ ] Revisar lista de usuários ativos trimestralmente
- [ ] Trocar senhas de admin a cada 90 dias

---

## 4. Procedimento de Resposta a Incidentes

### Em caso de suspeita de comprometimento

1. **Isolar:**
   ```bash
   sudo systemctl stop apache2
   ```

2. **Preservar evidências:**
   ```bash
   sudo cp -r /var/www/persianas-parana-qualidade /var/backups/forensic-$(date +%Y%m%d)
   sudo cp /var/log/apache2/qualidade-*.log /var/backups/forensic-$(date +%Y%m%d)/
   ```

3. **Investigar audit_log:**
   ```sql
   SELECT * FROM audit_log
   WHERE created_at > datetime('now', '-7 days')
   ORDER BY id DESC;
   ```

4. **Reset completo de credenciais:**
   ```bash
   # Forçar troca de senha de todos os usuários
   sqlite3 data/qualidade.db "UPDATE users SET active=0;"
   ```

5. **Restaurar de backup confirmadamente íntegro**

6. **Aplicar patches** (PHP, Apache, SO) antes de retomar

7. **Comunicar** — gestão e usuários afetados

---

## 5. Reporte de Vulnerabilidades

Vulnerabilidades identificadas no código devem ser reportadas internamente para a equipe de TI **sem divulgação pública**, com:

- Descrição do problema
- Passos para reproduzir
- Impacto estimado
- Sugestão de correção (se houver)

---

## 6. Conformidade com normas

Este sistema segue boas práticas alinhadas a:

- **OWASP Top 10:2021** — controles aplicação web
- **OWASP ASVS Level 1** — verificação de segurança aplicacional
- **ISO/IEC 27002** — controles de segurança da informação
- **LGPD** — Lei Geral de Proteção de Dados (auditoria + retenção configurável)

---

**Próximas evoluções de segurança recomendadas:**

1. 2FA / MFA via TOTP (ex: Google Authenticator)
2. Rotação automática de `secret_key` a cada 6 meses
3. Integração com Active Directory / LDAP corporativo
4. Logs estruturados (JSON) para ingestão em SIEM
5. Pentest anual por equipe externa
