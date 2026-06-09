import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import App from './App.jsx';
import Login from './components/Login.jsx';
import { refreshSession, logout } from './session.js';
import { setUnauthorizedHandler } from './api.js';
import { installStorage } from './storage.js';

// Instala window.storage (backed pela API) uma única vez.
installStorage();

export default function AppRoot() {
  const [status, setStatus] = useState('loading'); // loading | auth | anon
  const [user, setUser] = useState(null);

  const check = async () => {
    try {
      const u = await refreshSession();
      setUser(u);
      setStatus('auth');
    } catch {
      setStatus('anon');
    }
  };

  useEffect(() => {
    // Sessão expirada durante o uso -> volta ao login.
    setUnauthorizedHandler(() => setStatus('anon'));
    check();
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setStatus('anon');
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-500 flex items-center justify-center font-mono text-sm">
        <Clock size={14} className="animate-pulse mr-2" /> Carregando…
      </div>
    );
  }

  if (status === 'anon') {
    return <Login onSuccess={check} />;
  }

  return <App currentUser={user} onLogout={handleLogout} />;
}
