/**
 * Cliente HTTP de baixo nível para a API do PCP.
 * - Envia cookies de sessão (credentials).
 * - Anexa o token CSRF em operações de escrita.
 * - Em 401, dispara o handler de "não autenticado" (volta ao login).
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'api/';

export class AuthError extends Error {}

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function apiFetch(path, { method = 'GET', body, csrf } = {}) {
  const headers = {};
  const opts = { method, credentials: 'same-origin', headers };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (method !== 'GET' && csrf) {
    headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(API_BASE + path, opts);

  if (res.status === 401) {
    if (onUnauthorized) onUnauthorized();
    throw new AuthError('Não autenticado');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return data;
}
