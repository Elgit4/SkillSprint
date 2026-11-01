/* SkillSprint offline app shell — versioned to allow safe updates. */
const VERSION = 'skillsprint-shell-v5';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_URLS = [
  './',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './brand/skillsprint-wordmark.png',
  './brand/skillsprint-wordmark-light.png',
  './avatars/avatar-06.svg',
  './offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_URLS.map(async (url) => {
      try {
        const response = await fetch(new Request(new URL(url, self.registration.scope), { cache: 'reload' }));
        if (response.ok) await cache.put(new URL(url, self.registration.scope), response);
      } catch (error) {
        // A temporarily unavailable optional asset should not prevent installation.
        console.warn('SkillSprint could not precache:', url, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('skillsprint-') && ![SHELL_CACHE, ASSET_CACHE].includes(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Never cache Supabase or other external API requests.

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put(new URL('./', self.registration.scope), response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(request)) || (await cache.match(new URL('./', self.registration.scope))) || (await cache.match(new URL('./offline.html', self.registration.scope))) || new Response('SkillSprint is offline. Reconnect to the internet and reload this page.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Cache same-origin static resources only; do not cache API data or authentication requests.
  if (!['script', 'style', 'image', 'font', 'document'].includes(request.destination)) return;
  event.respondWith((async () => {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request);
    const update = fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => null);
    return cached || await update || (request.destination === 'document' ? (await cache.match(new URL('./offline.html', self.registration.scope))) : null) || new Response('', { status: 504 });
  })());
});
