# Acesso e uso — Fábrica (PCP + Qualidade)

Guia rápido de **como acessar** os sistemas de fábrica, **como funciona o login**
e **como gerenciar usuários**. Complementa `docs/DEPLOYMENT.md` (instalação) e
`docs/ARCHITECTURE.md` (arquitetura).

---

## 1. Endereços de acesso

Os dois sistemas rodam no servidor `aplicativos` (`192.168.0.207`), atrás do
Nginx, no subpath `/fabrica/`:

| Sistema | URL | Público-alvo |
|---|---|---|
| **PCP — Produção** | `https://192.168.0.207/fabrica/pcp/` | Chão de fábrica / planejamento (tema claro, acento dourado) |
| **Qualidade** | `https://192.168.0.207/fabrica/qualidade/` | Gestão de não conformidades (tema claro, acento vermelho) |
| API (interna) | `https://192.168.0.207/fabrica/api/...` | Consumida pelos dois frontends |

- O acesso é **somente pela rede local ou VPN** (OpenVPN/Tailscale — ver
  `ACESSO-TAILSCALE.md` no repo da Logística). Não há porta exposta na internet.
- O certificado é da CA interna (mkcert); no primeiro acesso o navegador pode
  pedir confirmação.
- Em desenvolvimento local: `http://localhost:3020/pcp/` e
  `http://localhost:3020/qualidade/`.

## 2. Forma de login

Os dois sistemas compartilham **o mesmo backend e a mesma base de usuários**
(banco `fabrica`, tabela `users`): quem tem acesso a um, tem ao outro, com o
mesmo usuário e senha.

- **Credencial:** `usuário + senha` (não é e-mail — diferente da Agenda e da
  Logística, que usam e-mail; operadores de fábrica nem sempre têm e-mail
  corporativo).
- **Sessão:** cookie `fabrica.sid` (express-session), com regeneração de sessão
  no login (anti session fixation). Sair = botão **Sair** no topo do sistema.
- **Proteções:** senhas com bcrypt, CSRF por token de sessão nas escritas e
  bloqueio automático após **5 tentativas falhas** (por usuário ou IP) durante
  **15 minutos** — configurável via `MAX_LOGIN_ATTEMPTS` e `LOCKOUT_SECONDS`
  no `.env` do servidor.
- **Auditoria:** login/logout e ações relevantes ficam em `audit_log`.

### Comparativo com os demais apps do servidor

| App | Credencial | Mecanismo |
|---|---|---|
| Agenda de Consultores | e-mail + senha | JWT + refresh token |
| Logística | e-mail + senha (+ 2FA) | JWT + cookie refresh |
| **Fábrica (PCP/Qualidade)** | **usuário + senha** | **Sessão por cookie + CSRF** |

## 3. Usuários e papéis

- Papéis: `admin` (gerencia usuários) e `user` (coluna `role`). Usuários
  inativos (`active = FALSE`) não conseguem entrar.
- **Primeiro admin:** criado na instalação com `npm run install-app` (no
  diretório `server/`), interativo ou via variáveis `FABRICA_ADMIN_USER`,
  `FABRICA_ADMIN_PASSWORD` e `FABRICA_ADMIN_NAME`.
- **Demais usuários:** pela tela **Usuários** do PCP (visível só para admins):
  criar usuário, redefinir senha, promover/rebaixar papel e ativar/desativar.
  Senha mínima: **8 caracteres**. Não há exclusão — desativar bloqueia o acesso
  preservando o histórico de auditoria. Um admin não consegue desativar nem
  rebaixar a si mesmo (proteção contra perda de acesso).
- API correspondente: `GET/POST /api/users` e `PATCH /api/users/:id`
  (admin + CSRF).

## 4. Telas de login (padrão visual)

As telas de login dos dois sistemas seguem o **mesmo esqueleto** dos demais
apps da empresa (Agenda e Logística):

1. Logotipo oficial Persianas Paraná;
2. Nome do sistema + subtítulo;
3. Instrução curta ("Entre com o usuário e a senha fornecidos pelo administrador");
4. Campos com rótulo e placeholder, senha com botão **mostrar/ocultar** (👁);
5. Erro em destaque acessível (`role="alert"`), mensagens em PT-BR;
6. Botão único **Entrar** com estado "Entrando…";
7. Rodapé de ajuda ("Problemas com o acesso? Fale com o administrador") + versão.

Identidade visual: tokens oficiais em `shared/brand/` (preto `#1D1D1B`,
vermelho `#C1212D`, dourado `#C6B784`). Tipografia oficial **Galano Grotesque**
(OTFs licenciados instalados no servidor via `shared/brand/install-galano.sh`)
com fallback **Manrope** auto-hospedado — referência completa da marca em
`shared/brand/IDENTIDADE-VISUAL.md`. Inputs de login com fonte **16px** para
evitar zoom automático no iOS.

## 5. Uso no dia a dia (resumo)

- **PCP:** pedidos, produção, apontamento, estoque, suprimentos, plano-mestre,
  indicadores e catálogo — dados compartilhados entre todos os usuários.
- **Qualidade:** registro de não conformidades, planos de ação, KPIs e
  treinamentos. Manual completo em `qualidade/docs/USER_MANUAL.md`.
- Sessão expirada → o sistema volta para a tela de login; basta entrar de novo.
- Esqueceu a senha → não há autoatendimento; um admin redefine no servidor.
