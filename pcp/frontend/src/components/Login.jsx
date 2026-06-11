import React, { useState } from 'react';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import { login } from '../session.js';

export default function Login({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Falha ao autenticar');
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-4"
      style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-stone-900/60 border border-stone-800 rounded-lg p-8"
      >
        <div className="flex flex-col items-center mb-6 text-center">
          <img src="./brand/logos/logo-branco.png" alt="Persianas Paraná" className="h-9 w-auto mb-4" />
          <h1 className="text-lg font-bold tracking-tight">
            PCP <span className="text-amber-500">/</span> Produção
          </h1>
          <p className="text-xs text-stone-400 mt-1">
            Planejamento e Controle da Produção
          </p>
          <p className="text-xs text-stone-500 mt-3">
            Entre com o usuário e a senha fornecidos pelo administrador.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-sm px-3 py-2"
          >
            {error}
          </div>
        )}

        <label
          htmlFor="login-username"
          className="block text-xs font-medium uppercase tracking-wider text-stone-400 mb-1"
        >
          Usuário
        </label>
        <input
          id="login-username"
          type="text"
          autoFocus
          required
          autoComplete="username"
          autoCapitalize="none"
          placeholder="Digite seu usuário"
          value={username}
          disabled={busy}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full mb-4 bg-stone-950 border border-stone-800 rounded-sm px-3 py-2.5 text-base text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/60 disabled:opacity-60"
        />

        <label
          htmlFor="login-password"
          className="block text-xs font-medium uppercase tracking-wider text-stone-400 mb-1"
        >
          Senha
        </label>
        <div className="relative mb-6">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="Digite sua senha"
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-stone-950 border border-stone-800 rounded-sm px-3 py-2.5 pr-11 text-base text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/60 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            tabIndex={-1}
            className="absolute inset-y-0 right-0 px-3 flex items-center text-stone-500 hover:text-stone-300"
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-stone-950 font-semibold rounded-sm text-sm uppercase tracking-wider transition"
        >
          <LogIn size={15} />
          {busy ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="text-xs text-stone-500 text-center mt-5">
          Problemas com o acesso? Fale com o administrador.
        </p>
        <p className="text-[10px] font-mono text-stone-600 text-center mt-3">
          v1.0.0 · © Persianas Paraná
        </p>
      </form>
    </div>
  );
}
