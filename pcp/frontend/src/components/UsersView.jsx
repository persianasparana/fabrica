import React, { useEffect, useState } from 'react';
import {
  Users, Plus, X, Save, Eye, EyeOff, KeyRound, ShieldCheck,
  UserCheck, UserX, AlertCircle, CheckCircle2, Edit3,
} from 'lucide-react';
import { apiFetch } from '../api.js';
import { getCsrf } from '../session.js';

const ROLE_LABEL = { admin: 'Administrador', user: 'Usuário' };

function fmtData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function CampoSenha({ label, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-stone-400 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete || 'new-password'}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-stone-950 border border-stone-800 rounded-sm px-3 py-2 pr-10 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/60"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute inset-y-0 right-0 px-3 flex items-center text-stone-500 hover:text-stone-300"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

export default function UsersView({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  // formulário de criação
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState({ username: '', full_name: '', password: '', role: 'user' });

  // edição inline (redefinir senha)
  const [senhaDe, setSenhaDe] = useState(null); // id do usuário com painel de senha aberto
  const [novaSenha, setNovaSenha] = useState('');
  const [busy, setBusy] = useState(false);

  const carregar = async () => {
    setErro('');
    try {
      const { data } = await apiFetch('/users');
      setUsers(data);
    } catch (e) {
      setErro(e.message || 'Falha ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const flash = (msg) => {
    setAviso(msg);
    setTimeout(() => setAviso(''), 4000);
  };

  const patch = async (id, body, okMsg) => {
    setErro('');
    setBusy(true);
    try {
      const { data } = await apiFetch(`/users/${id}`, { method: 'PATCH', body, csrf: getCsrf() });
      setUsers((list) => list.map((u) => (u.id === data.id ? data : u)));
      if (okMsg) flash(okMsg);
      return true;
    } catch (e) {
      setErro(e.message || 'Falha ao atualizar usuário');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const criar = async (e) => {
    e.preventDefault();
    setErro('');
    setBusy(true);
    try {
      const { data } = await apiFetch('/users', { method: 'POST', body: novo, csrf: getCsrf() });
      setUsers((list) => [data, ...list]);
      setNovo({ username: '', full_name: '', password: '', role: 'user' });
      setCriando(false);
      flash(`Usuário '${data.username}' criado.`);
    } catch (err) {
      setErro(err.message || 'Falha ao criar usuário');
    } finally {
      setBusy(false);
    }
  };

  const salvarSenha = async (id) => {
    if (await patch(id, { password: novaSenha }, 'Senha redefinida.')) {
      setSenhaDe(null);
      setNovaSenha('');
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between pb-3 border-b border-stone-800">
        <div>
          <h2 className="text-xl font-bold text-stone-100" style={{ fontFamily: "'Galano Grotesque', 'Manrope', sans-serif" }}>
            Usuários
          </h2>
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mt-1">
            Base compartilhada · PCP + Qualidade · somente administradores
          </div>
        </div>
        <button
          onClick={() => setCriando((v) => !v)}
          className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-amber-500 text-stone-950 hover:bg-amber-400 flex items-center gap-1.5"
        >
          {criando ? <X size={11} /> : <Plus size={11} />}
          {criando ? 'Cancelar' : 'Novo usuário'}
        </button>
      </header>

      {erro && (
        <div role="alert" className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-sm px-3 py-2">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{erro}</span>
        </div>
      )}
      {aviso && (
        <div className="flex items-start gap-2 text-sm text-green-300 bg-green-500/10 border border-green-500/30 rounded-sm px-3 py-2">
          <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      {criando && (
        <form onSubmit={criar} className="border border-stone-800 rounded-sm p-4 bg-stone-900/40 space-y-4">
          <div className="text-xs font-mono uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
            <Users size={12} /> Novo usuário
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-stone-400 mb-1">
                Usuário (login)
              </label>
              <input
                type="text"
                required
                autoCapitalize="none"
                placeholder="ex.: joao.silva"
                value={novo.username}
                onChange={(e) => setNovo({ ...novo, username: e.target.value })}
                className="w-full bg-stone-950 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/60"
              />
              <p className="text-[10px] text-stone-500 mt-1">
                Minúsculas, números, ponto, hífen ou underline (3–64).
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-stone-400 mb-1">
                Nome completo
              </label>
              <input
                type="text"
                required
                placeholder="ex.: João da Silva"
                value={novo.full_name}
                onChange={(e) => setNovo({ ...novo, full_name: e.target.value })}
                className="w-full bg-stone-950 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/60"
              />
            </div>
            <CampoSenha
              label="Senha (mínimo 8 caracteres)"
              value={novo.password}
              placeholder="Defina a senha inicial"
              onChange={(v) => setNovo({ ...novo, password: v })}
            />
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-stone-400 mb-1">
                Papel
              </label>
              <select
                value={novo.role}
                onChange={(e) => setNovo({ ...novo, role: e.target.value })}
                className="w-full bg-stone-950 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 focus:outline-none focus:border-amber-500/60"
              >
                <option value="user">Usuário — usa PCP e Qualidade</option>
                <option value="admin">Administrador — também gerencia usuários</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 text-xs font-mono uppercase tracking-wider bg-amber-500 text-stone-950 hover:bg-amber-400 disabled:opacity-60 flex items-center gap-1.5"
          >
            <Save size={11} /> {busy ? 'Criando…' : 'Criar usuário'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-sm font-mono text-stone-500">Carregando…</div>
      ) : (
        <div className="border border-stone-800 rounded-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-stone-900/40">
              <tr className="text-left text-stone-500 font-mono uppercase tracking-wider">
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Papel</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 hidden md:table-cell">Último acesso</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === currentUser?.id;
                return (
                  <React.Fragment key={u.id}>
                    <tr className={`border-t border-stone-800/60 ${u.active ? '' : 'opacity-50'}`}>
                      <td className="px-3 py-2 text-stone-200">
                        {u.username}
                        {self && <span className="ml-1.5 text-amber-500/80">(você)</span>}
                      </td>
                      <td className="px-3 py-2 text-stone-300" style={{ fontFamily: "'Galano Grotesque', 'Manrope', sans-serif" }}>
                        {u.full_name}
                      </td>
                      <td className="px-3 py-2">
                        {u.role === 'admin' ? (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <ShieldCheck size={11} /> {ROLE_LABEL.admin}
                          </span>
                        ) : (
                          <span className="text-stone-400">{ROLE_LABEL.user}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {u.active ? (
                          <span className="text-green-400">ativo</span>
                        ) : (
                          <span className="text-stone-500">inativo</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-stone-500 hidden md:table-cell">{fmtData(u.last_login)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            title="Redefinir senha"
                            disabled={busy}
                            onClick={() => {
                              setSenhaDe(senhaDe === u.id ? null : u.id);
                              setNovaSenha('');
                            }}
                            className="px-2 py-1 border border-stone-800 text-stone-400 hover:text-amber-400 hover:border-amber-500/40"
                          >
                            <KeyRound size={12} />
                          </button>
                          <button
                            title={u.role === 'admin' ? 'Tornar usuário comum' : 'Tornar administrador'}
                            disabled={busy || self}
                            onClick={() =>
                              patch(u.id, { role: u.role === 'admin' ? 'user' : 'admin' },
                                `Papel de '${u.username}' atualizado.`)
                            }
                            className="px-2 py-1 border border-stone-800 text-stone-400 hover:text-amber-400 hover:border-amber-500/40 disabled:opacity-40"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            title={u.active ? 'Desativar (bloqueia o acesso)' : 'Reativar'}
                            disabled={busy || self}
                            onClick={() =>
                              patch(u.id, { active: !u.active },
                                `Usuário '${u.username}' ${u.active ? 'desativado' : 'reativado'}.`)
                            }
                            className="px-2 py-1 border border-stone-800 text-stone-400 hover:text-amber-400 hover:border-amber-500/40 disabled:opacity-40"
                          >
                            {u.active ? <UserX size={12} /> : <UserCheck size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {senhaDe === u.id && (
                      <tr className="border-t border-stone-800/60 bg-stone-900/30">
                        <td colSpan={6} className="px-3 py-3">
                          <div className="flex flex-col sm:flex-row sm:items-end gap-3 max-w-lg">
                            <div className="flex-1">
                              <CampoSenha
                                label={`Nova senha para '${u.username}'`}
                                value={novaSenha}
                                placeholder="Mínimo 8 caracteres"
                                onChange={setNovaSenha}
                              />
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                disabled={busy || novaSenha.length < 8}
                                onClick={() => salvarSenha(u.id)}
                                className="px-3 py-2 text-xs font-mono uppercase tracking-wider bg-amber-500 text-stone-950 hover:bg-amber-400 disabled:opacity-50"
                              >
                                Salvar
                              </button>
                              <button
                                onClick={() => { setSenhaDe(null); setNovaSenha(''); }}
                                className="px-3 py-2 text-xs font-mono uppercase tracking-wider border border-stone-800 text-stone-400 hover:bg-stone-900"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!users.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-stone-500 font-mono">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-stone-500">
        Usuários valem para o PCP e para o Sistema de Qualidade (mesma base).
        Não há exclusão: desative o usuário para bloquear o acesso preservando o
        histórico de auditoria. Você não pode desativar nem rebaixar a si mesmo.
      </p>
    </div>
  );
}
