/**
 * Login - Persianas Paraná Qualidade
 * Submete credenciais para /api/auth.php e redireciona para o sistema.
 */
(function () {
  'use strict';

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function hideError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();
    btn.disabled = true;
    btn.textContent = 'Entrando...';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      const res = await fetch('api/auth.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'same-origin',
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Erro ao autenticar');
        btn.disabled = false;
        btn.textContent = 'Entrar';
        return;
      }

      // Sucesso
      window.location.href = 'index.html';
    } catch (err) {
      showError('Erro de conexão. Tente novamente.');
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
})();
