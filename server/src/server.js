/**
 * Backend unificado fabrica (PCP + Qualidade) — Node + Express + PostgreSQL.
 *
 * Serve as duas APIs sob /api/* e, opcionalmente, os dois frontends estáticos
 * (/pcp e /qualidade). Projetado para rodar atrás do Nginx em 127.0.0.1.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';

import { pool, migrate } from './db.js';
import authRoutes from './routes/auth.js';
import pcpRoutes from './routes/pcp.js';
import adminRoutes from './routes/admin.js';
import qualidadeRoutes from './routes/qualidade.js';
import integracaoRoutes from './routes/integracao.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const app = express();
// Porta na faixa de apps novos do servidor compartilhado (>= 3020).
const PORT = Number(process.env.PORT || 3020);
const HOST = process.env.HOST || '127.0.0.1';

if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

// Segurança — CSP compatível com os frontends (estilos inline; scripts externos).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // o PCP usa handlers de evento inline (onclick) — atributos apenas;
        // blocos <script> inline continuam bloqueados (scriptSrc 'self')
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: '1.5mb' }));

const PgStore = connectPgSimple(session);
const cookieSecure =
  process.env.COOKIE_SECURE === 'auto' ? 'auto' : process.env.COOKIE_SECURE === '1';

app.use(
  session({
    name: 'fabrica.sid',
    store: new PgStore({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'troque-este-segredo-em-producao',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      maxAge: Number(process.env.SESSION_MAX_AGE_MS || 8 * 60 * 60 * 1000),
    },
  })
);

// Health check (para o Nginx / monitoração)
app.get('/healthz', (req, res) => res.json({ ok: true }));

// APIs
app.use('/api/auth', authRoutes);
app.use('/api/pcp', pcpRoutes);
app.use('/api/pcp', adminRoutes);
app.use('/api/qualidade', qualidadeRoutes);
// Integração servidor-a-servidor (Logística) — autenticada por X-API-Key, não usa sessão
app.use('/api/integracao', integracaoRoutes);

// Frontends estáticos (opcional — o Nginx também pode servir diretamente)
if (process.env.SERVE_STATIC !== '0') {
  const pcpDir = process.env.PCP_DIR || path.join(root, 'pcp', 'public');
  const qualidadeDir = process.env.QUALIDADE_DIR || path.join(root, 'qualidade', 'public');

  // PCP (estático)
  app.use('/pcp', express.static(pcpDir));
  app.get('/pcp', (req, res) => res.redirect('/pcp/'));

  // Qualidade (estático)
  app.use('/qualidade', express.static(qualidadeDir));
  app.get('/qualidade', (req, res) => res.redirect('/qualidade/'));

  app.get('/', (req, res) => res.redirect('/pcp/'));
}

// 404 para rotas de API desconhecidas
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Tratamento de erros -> JSON
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[erro]', err);
  res.status(status).json({ error: status >= 500 ? 'Erro interno do servidor' : err.message });
});

async function start() {
  await migrate();
  app.listen(PORT, HOST, () => {
    console.log(`fabrica-server ouvindo em http://${HOST}:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Falha ao iniciar:', err);
  process.exit(1);
});

export default app;
