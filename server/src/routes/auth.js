/** Rotas de autenticação compartilhadas: /api/auth/* */
import { Router } from 'express';
import { attemptLogin, ensureCsrf, clientIp, audit } from '../auth.js';
import { ah } from '../util.js';

const r = Router();

// POST /api/auth/login
r.post(
  '/login',
  ah(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }
    try {
      const user = await attemptLogin(req, username, password, clientIp(req));
      if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
      res.json({ user, csrf_token: req.session.csrf });
    } catch (e) {
      if (e.code === 'LOCKED') return res.status(429).json({ error: e.message });
      throw e;
    }
  })
);

// GET /api/auth/session — usuário atual + token CSRF
r.get('/session', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Não autenticado' });
  res.json({ user: req.session.user, csrf_token: ensureCsrf(req) });
});

// Logout (POST e DELETE)
function logout(req, res) {
  const user = req.session?.user;
  const done = () => {
    res.clearCookie('fabrica.sid');
    res.json({ ok: true });
  };
  if (user) audit(user.id, 'auth', 'logout').catch(() => {});
  req.session.destroy(done);
}
r.post('/logout', logout);
r.delete('/logout', logout);

export default r;
