/**
 * Login do PCP — Persianas Paraná.
 * Submete credenciais para /api/auth/login e redireciona para o sistema.
 */
(function () {
  'use strict';

  const form = document.getElementById('login-form');
  const btn = document.getElementById('btn-entrar');
  const erro = document.getElementById('login-erro');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Entrando...';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      const res = await fetch('../api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Falha no login. Tente novamente.');
      }
      window.location.href = 'index.html';
    } catch (e) {
      erro.textContent = e.message;
      erro.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
})();
