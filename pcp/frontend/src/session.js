/**
 * Estado de sessão do usuário (em memória) e operações de autenticação.
 * O token CSRF é mantido aqui e lido pela camada de storage nas escritas.
 */
import { apiFetch } from './api.js';

const session = { user: null, csrf: '' };

export function getUser() {
  return session.user;
}
export function getCsrf() {
  return session.csrf;
}

/** Recupera a sessão atual; lança AuthError (401) se não autenticado. */
export async function refreshSession() {
  const data = await apiFetch('auth.php');
  session.user = data.user;
  session.csrf = data.csrf_token;
  return session.user;
}

export async function login(username, password) {
  const data = await apiFetch('auth.php', {
    method: 'POST',
    body: { username, password },
  });
  session.user = data.user;
  session.csrf = data.csrf_token;
  return session.user;
}

export async function logout() {
  try {
    await apiFetch('auth.php', { method: 'DELETE', csrf: session.csrf });
  } catch {
    /* ignora erros de rede no logout */
  }
  session.user = null;
  session.csrf = '';
}
