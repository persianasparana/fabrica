/**
 * Service worker do Fotos E-commerce — cache do SHELL apenas (o app precisa
 * de rede pra salvar; offline mostra o shell e avisa no login/salvar).
 * Suba a versão ao mudar index.html/app.js.
 */
const CACHE = 'fotos-pp-v1';
const SHELL = ['./', 'index.html', 'app.js', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API sempre na rede; shell: rede primeiro com fallback ao cache (offline)
  if (url.pathname.includes('/api/')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && SHELL.some((s) => url.pathname.endsWith(s.replace('./', '/')))) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
