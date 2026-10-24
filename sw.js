// Офлайн-кэш полевой платформы. Первый запуск с интернетом сохраняет код приложения и библиотеки (CDN) в кэш браузера; дальше всё открывается
// без сети. Стратегия — «кэш сначала, обновление в фоне»: новая версия кода подхватывается при следующем запуске с интернетом.
// Данные полевой работы лежат не здесь, а в IndexedDB (src/store.js) и в кэш не попадают.
const VERSION = 'field-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './public/icon.svg',
  './src/main.js', './src/App.js', './src/store.js',
  './src/styles/tokens.css', './src/styles/ui.css', './src/styles/field.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !/^https?:/.test(req.url)) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: false });
    const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => null); return res; }).catch(() => null);
    if (hit) { net.catch(() => null); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') { const idx = await cache.match('./index.html'); if (idx) return idx; }
    return new Response('Нет сети, и этого файла нет в офлайн-кэше. Откройте приложение один раз с интернетом.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
