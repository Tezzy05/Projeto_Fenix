// Service worker: app shell offline. Rede primeiro para mesma origem, com cache de reserva.
const V = 'fenix-v4';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/data.js', 'js/ui.js', 'js/scene.js', 'js/docs.js', 'js/tecnico.js', 'js/painel.js', 'js/demo.js',
  'vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js', 'vendor/motion.js', 'vendor/anime.umd.min.js', 'vendor/three.module.min.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;   // API nunca vem do cache
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
