import React, { useState } from 'react';
import { LogIn } from 'lucide-react';
import { login } from '../session.js';

export default function Login({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      style={{ fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-stone-900/60 border border-stone-800 rounded-lg p-8"
      >
        <div className="flex flex-col items-center mb-6">
          <img src="./brand/logo-mark.svg" alt="Persianas Paraná" className="w-12 h-12 mb-3" />
          <h1 className="text-lg font-bold tracking-tight">
            PCP <span className="text-amber-500">/</span> Persianas Paraná
          </h1>
          <p className="text-[11px] font-mono text-stone-500 uppercase tracking-[0.2em] mt-1">
            Planejamento e Controle da Produção
          </p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-sm px-3 py-2">
            {error}
          </div>
        )}

        <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">
          Usuário
        </label>
        <input
          type="text"
          autoFocus
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full mb-4 bg-stone-950 border border-stone-800 rounded-sm px-3 py-2 text-sm font-mono text-stone-100 focus:outline-none focus:border-amber-500/60"
        />

        <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">
          Senha
        </label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 bg-stone-950 border border-stone-800 rounded-sm px-3 py-2 text-sm font-mono text-stone-100 focus:outline-none focus:border-amber-500/60"
        />

        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-stone-950 font-semibold rounded-sm text-sm uppercase tracking-wider transition"
        >
          <LogIn size={15} />
          {busy ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="text-[10px] font-mono text-stone-600 text-center mt-6">
          v1.0.0 · © Persianas Paraná
        </p>
      </form>
    </div>
  );
}
