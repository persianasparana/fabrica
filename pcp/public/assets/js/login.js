/**
 * Login do PCP — Persianas Paraná (split-screen, padrão da casa).
 * Submete credenciais para /api/auth/login e redireciona para o sistema.
 */
(function () {
  'use strict';

  const form = document.getElementById('login-form');
  const btn = document.getElementById('btn-entrar');
  const erro = document.getElementById('login-erro');
  const senha = document.getElementById('password');
  const olho = document.getElementById('btn-olho');

  if (olho) {
    olho.addEventListener('click', () => {
      const mostra = senha.type === 'password';
      senha.type = mostra ? 'text' : 'password';
      olho.textContent = mostra ? '🙈' : '👁';
      senha.focus();
    });
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.classList.remove('show');
    btn.disabled = true;
    btn.textContent = 'Entrando...';

    const username = document.getElementById('username').value.trim();
    const password = senha.value;

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
      erro.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
})();
