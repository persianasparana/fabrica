/**
 * Fotos E-commerce — mini-PWA (mesma sessão do PCP).
 *
 * Fluxo: login (se preciso) → tira fotos (comprimidas no aparelho via canvas,
 * lado maior 2048px, JPEG ~0.85 — mantém o upload leve) → preenche a spec →
 * salvar cria o registro e sobe as fotos uma a uma. Galeria lista/edita/
 * exclui e exporta CSV com os links das fotos pro e-commerce.
 */
(function () {
  'use strict';

  const API = '../../api/';
  let csrf = '';
  let fotosPendentes = [];   // [{ blob, urlPreview }]
  let editandoId = null;     // registro em edição (null = novo)
  const $ = (id) => document.getElementById(id);

  // ─── HTTP ──────────────────────────────────────────────────────────────
  async function api(path, opts = {}) {
    opts.credentials = 'same-origin';
    opts.headers = opts.headers || {};
    if (opts.method && opts.method !== 'GET') opts.headers['X-CSRF-Token'] = csrf;
    if (opts.json !== undefined) {
      opts.body = JSON.stringify(opts.json);
      opts.headers['Content-Type'] = 'application/json';
      delete opts.json;
    }
    const res = await fetch(API + path, opts);
    if (res.status === 401) { mostrar('login'); throw new Error('Faça login para continuar.'); }
    const ct = res.headers.get('Content-Type') || '';
    const data = ct.includes('json') ? await res.json().catch(() => ({})) : {};
    if (!res.ok) throw new Error(data.error || 'Erro na requisição (' + res.status + ')');
    return data;
  }

  // ─── Views ─────────────────────────────────────────────────────────────
  function mostrar(view) {
    ['login', 'nova', 'galeria'].forEach((v) => $('view-' + v).classList.toggle('hidden', v !== view));
    document.querySelectorAll('#tabs button').forEach((b) =>
      b.classList.toggle('ativo', b.dataset.view === view));
    $('tabs').style.display = view === 'login' ? 'none' : '';
    if (view === 'galeria') carregarGaleria();
  }
  document.querySelectorAll('#tabs button').forEach((b) =>
    b.addEventListener('click', () => mostrar(b.dataset.view)));

  function msg(el, texto, ok) {
    el.className = 'msg ' + (ok ? 'ok' : 'erro');
    el.textContent = texto;
    if (ok) setTimeout(() => { el.className = 'msg'; }, 3500);
  }

  // ─── Sessão / login ────────────────────────────────────────────────────
  async function bootstrap() {
    try {
      const s = await fetch(API + 'auth/session', { credentials: 'same-origin' });
      if (!s.ok) throw new Error();
      const data = await s.json();
      csrf = data.csrf_token;
      $('quem').textContent = data.user.full_name || data.user.username;
      mostrar('nova');
    } catch (e) { mostrar('login'); }
  }

  $('lg-entrar').addEventListener('click', async () => {
    const btn = $('lg-entrar');
    btn.disabled = true;
    try {
      const res = await fetch(API + 'auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username: $('lg-user').value.trim(), password: $('lg-pass').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha no login');
      await bootstrap();
    } catch (e) { msg($('lg-msg'), e.message, false); }
    btn.disabled = false;
  });
  $('lg-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('lg-entrar').click(); });

  // ─── Fotos: captura + compressão no aparelho ───────────────────────────
  $('btn-cam').addEventListener('click', () => $('input-fotos').click());
  $('input-fotos').addEventListener('change', async (ev) => {
    for (const file of ev.target.files || []) {
      try {
        const blob = await comprimir(file);
        fotosPendentes.push({ blob, urlPreview: URL.createObjectURL(blob) });
      } catch (e) { msg($('form-msg'), 'Não consegui ler uma das fotos: ' + e.message, false); }
    }
    ev.target.value = '';
    renderThumbs();
  });

  async function comprimir(file, maxLado = 2048, qualidade = 0.85) {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * escala);
    const h = Math.round(bmp.height * escala);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return new Promise((ok, erro) =>
      cv.toBlob((b) => (b ? ok(b) : erro(new Error('falha na compressão'))), 'image/jpeg', qualidade));
  }

  function renderThumbs() {
    $('thumbs').innerHTML = fotosPendentes.map((f, ix) =>
      `<div class="thumb"><img src="${f.urlPreview}" alt=""><button data-rm="${ix}">✕</button></div>`).join('');
    $('thumbs').querySelectorAll('[data-rm]').forEach((b) =>
      b.addEventListener('click', () => {
        URL.revokeObjectURL(fotosPendentes[Number(b.dataset.rm)].urlPreview);
        fotosPendentes.splice(Number(b.dataset.rm), 1);
        renderThumbs();
      }));
  }

  // ─── Salvar ────────────────────────────────────────────────────────────
  const CAMPOS = ['titulo', 'familia', 'produto', 'acabamento', 'acionamento', 'colecao',
    'cor_tecido', 'cor_perfil', 'largura_cm', 'altura_cm', 'comando', 'observacoes'];
  const INPUT = {
    titulo: 'f-titulo', familia: 'f-familia', produto: 'f-produto', acabamento: 'f-acabamento',
    acionamento: 'f-acionamento', colecao: 'f-colecao', cor_tecido: 'f-cor', cor_perfil: 'f-corperfil',
    largura_cm: 'f-largura', altura_cm: 'f-altura', comando: 'f-comando', observacoes: 'f-obs',
  };
  const simNao = (v) => (v === 'sim' ? true : v === 'nao' ? false : null);

  function lerForm() {
    const d = {};
    for (const c of CAMPOS) d[c] = $(INPUT[c]).value.trim();
    d.trilho_plus = simNao($('f-trilho').value);
    d.bando = simNao($('f-bando').value);
    return d;
  }

  function limparForm() {
    for (const c of CAMPOS) $(INPUT[c]).value = '';
    $('f-trilho').value = ''; $('f-bando').value = '';
    fotosPendentes.forEach((f) => URL.revokeObjectURL(f.urlPreview));
    fotosPendentes = [];
    renderThumbs();
    editandoId = null;
    $('form-titulo').textContent = '📷 Nova peça';
    $('btn-cancelar').classList.add('hidden');
  }
  $('btn-cancelar').addEventListener('click', limparForm);

  $('btn-salvar').addEventListener('click', async () => {
    const d = lerForm();
    if (!d.titulo && !d.produto) { msg($('form-msg'), 'Dê um nome/título ou informe o produto.', false); return; }
    if (!editandoId && !fotosPendentes.length) { msg($('form-msg'), 'Tire ao menos uma foto.', false); return; }
    const btn = $('btn-salvar');
    btn.disabled = true;
    try {
      let id = editandoId;
      if (id) await api('pcp/fotos-ecommerce?id=' + id, { method: 'PUT', json: d });
      else id = (await api('pcp/fotos-ecommerce', { method: 'POST', json: d })).id;

      for (let i = 0; i < fotosPendentes.length; i++) {
        $('progresso').textContent = `Enviando foto ${i + 1} de ${fotosPendentes.length}…`;
        const res = await fetch(`${API}pcp/fotos-ecommerce/${id}/foto`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'image/jpeg' },
          body: fotosPendentes[i].blob,
        });
        if (!res.ok) throw new Error(`Foto ${i + 1} falhou (HTTP ${res.status}) — as anteriores foram salvas.`);
      }
      $('progresso').textContent = '';
      msg($('form-msg'), editandoId ? 'Peça atualizada!' : 'Peça salva com as fotos! ✔', true);
      limparForm();
    } catch (e) {
      $('progresso').textContent = '';
      msg($('form-msg'), e.message, false);
    }
    btn.disabled = false;
  });

  // ─── Galeria ───────────────────────────────────────────────────────────
  let buscaTimer = null;
  $('g-busca').addEventListener('input', () => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(carregarGaleria, 300);
  });
  $('btn-csv').addEventListener('click', () => { location.href = API + 'pcp/fotos-ecommerce/export.csv'; });

  async function carregarGaleria() {
    const el = $('g-lista');
    try {
      const r = await api('pcp/fotos-ecommerce?busca=' + encodeURIComponent($('g-busca').value.trim()));
      const regs = r.data || [];
      if (!regs.length) { el.innerHTML = '<div class="vazio">Nenhuma peça fotografada ainda.</div>'; return; }
      el.innerHTML = regs.map((x) => {
        const foto = (x.fotos || [])[0];
        const specs = [x.familia, x.produto, x.colecao, x.cor_tecido,
          x.largura_cm && x.altura_cm ? `${x.largura_cm}×${x.altura_cm} cm` : null]
          .filter(Boolean).join(' · ');
        return `<div class="reg" data-id="${x.id}">
          ${foto ? `<img src="${API}pcp/fotos-ecommerce/foto/${foto.id}" alt="" loading="lazy">` : '<img alt="">'}
          <div class="info">
            <b>${esc(x.titulo || x.produto || 'Peça ' + x.id)}</b>
            <div class="meta">${esc(specs) || '—'}</div>
            <div class="meta">${(x.fotos || []).length} foto(s) · ${esc(x.criado_em)} · ${esc(x.criado_por_nome || '')}</div>
            <div class="acoes">
              <button data-editar="${x.id}">✏️ Editar</button>
              <button data-maisfotos="${x.id}">📷 + fotos</button>
              <button data-excluir="${x.id}" style="color:var(--red);border-color:var(--red)">Excluir</button>
            </div>
          </div>
        </div>`;
      }).join('');
      el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editar(regs, b.dataset.editar)));
      el.querySelectorAll('[data-maisfotos]').forEach((b) => b.addEventListener('click', () => maisFotos(regs, b.dataset.maisfotos)));
      el.querySelectorAll('[data-excluir]').forEach((b) => b.addEventListener('click', () => excluir(b.dataset.excluir)));
    } catch (e) {
      el.innerHTML = `<div class="vazio">${esc(e.message)}</div>`;
    }
  }

  function preencherForm(x) {
    $('f-titulo').value = x.titulo || ''; $('f-familia').value = x.familia || '';
    $('f-produto').value = x.produto || ''; $('f-acabamento').value = x.acabamento || '';
    $('f-acionamento').value = x.acionamento || ''; $('f-colecao').value = x.colecao || '';
    $('f-cor').value = x.cor_tecido || ''; $('f-corperfil').value = x.cor_perfil || '';
    $('f-largura').value = x.largura_cm ?? ''; $('f-altura').value = x.altura_cm ?? '';
    $('f-comando').value = x.comando || ''; $('f-obs').value = x.observacoes || '';
    $('f-trilho').value = x.trilho_plus === true ? 'sim' : x.trilho_plus === false ? 'nao' : '';
    $('f-bando').value = x.bando === true ? 'sim' : x.bando === false ? 'nao' : '';
  }

  function editar(regs, id) {
    const x = regs.find((r) => String(r.id) === String(id));
    if (!x) return;
    preencherForm(x);
    editandoId = Number(id);
    $('form-titulo').textContent = `✏️ Editando: ${x.titulo || 'peça ' + id} (fotos novas serão ADICIONADAS)`;
    $('btn-cancelar').classList.remove('hidden');
    mostrar('nova');
    window.scrollTo(0, 0);
  }

  function maisFotos(regs, id) {
    editar(regs, id);
    $('input-fotos').click();
  }

  async function excluir(id) {
    if (!confirm('Excluir esta peça e TODAS as fotos dela?')) return;
    try {
      await api('pcp/fotos-ecommerce?id=' + id, { method: 'DELETE' });
      carregarGaleria();
    } catch (e) { alert(e.message); }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ─── PWA ───────────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  bootstrap();
})();
