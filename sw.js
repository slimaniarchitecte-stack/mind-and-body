// Service worker: keeps a copy of the whole app on the device, so it opens without a connection.
//
// How it works:
// 1. On the first visit every file in FILES is saved in the cache.
// 2. After that the app is always served from the cache (instant, offline).
// 3. When the app opens with a connection it asks this worker to look for changes.
//    If any file changed on the site, all files are refreshed and the app offers to reload.
//    So after you push to GitHub you do not have to change anything here.
//
// IMPORTANT: when you add a new file to the app (a script, a style, a data file, an icon),
// add it to FILES below. The test page (tests/index.html) tells you if one is missing.

const CACHE = 'mind-and-body-v1';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/screens.css',
  'fonts/InterVariable.woff2',
  'icons/favicon.svg',
  'icons/favicon-48.png',
  'icons/logo.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'data/program.json',
  'data/schedule.json',
  'data/habits.json',
  'data/training.json',
  'data/nutrition.json',
  'data/tracks.json',
  'data/create.json',
  'data/mind.json',
  'js/main.js',
  'js/pwa.js',
  'js/version.js',
  'js/clock.js',
  'js/db.js',
  'js/program.js',
  'js/store.js',
  'js/router.js',
  'js/nav.js',
  'js/actions.js',
  'js/theme.js',
  'js/photos.js',
  'js/notify.js',
  'js/unlockFlow.js',
  'js/backupFlow.js',
  'js/core/dates.js',
  'js/core/schedule.js',
  'js/core/unlock.js',
  'js/core/adherence.js',
  'js/core/nutrition.js',
  'js/core/strength.js',
  'js/core/learn.js',
  'js/core/food.js',
  'js/core/stats.js',
  'js/core/backup.js',
  'js/core/ics.js',
  'js/ui/dom.js',
  'js/ui/icons.js',
  'js/ui/sheet.js',
  'js/ui/parts.js',
  'js/ui/charts.js',
  'js/ui/form.js',
  'js/screens/today.js',
  'js/screens/week.js',
  'js/screens/more.js',
  'js/screens/body.js',
  'js/screens/food.js',
  'js/screens/shared.js',
  'js/screens/learn.js',
  'js/screens/create.js',
  'js/screens/mind.js',
  'js/screens/habits.js',
  'js/screens/review.js',
  'js/screens/settings.js',
  'js/screens/guide.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE && key.startsWith('mind-and-body-')) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // ignoreSearch: the page may be opened with ?now=... or other parameters.
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch (err) {
      // Offline and not in the cache: for a page, fall back to the app itself.
      if (request.mode === 'navigate') {
        const shell = await cache.match('./');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});

function sameBytes(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return false;
  return true;
}

// Download every file again (the browser only transfers what changed) and compare with the cache.
// Nothing is replaced unless every file arrived, so the app can never end up half updated.
async function lookForUpdate() {
  const cache = await caches.open(CACHE);
  const fresh = [];
  let changed = false;
  for (let i = 0; i < FILES.length; i += 6) {
    const batch = await Promise.all(FILES.slice(i, i + 6).map(async (url) => {
      const response = await fetch(new Request(url, { cache: 'no-cache' }));
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      const old = await cache.match(url);
      const same = old ? sameBytes(await old.arrayBuffer(), await response.clone().arrayBuffer()) : false;
      return { url, response, same };
    }));
    for (const item of batch) {
      if (!item.same) changed = true;
      fresh.push(item);
    }
  }
  if (!changed) return false;
  for (const item of fresh) await cache.put(item.url, item.response);
  return true;
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'check') return;
  event.waitUntil((async () => {
    try {
      const updated = await lookForUpdate();
      if (updated) {
        for (const client of await self.clients.matchAll()) client.postMessage({ type: 'updated' });
      }
    } catch {
      // Offline or a file is missing on the site: keep the version that works.
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL('./#/today', self.registration.scope).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find(c => c.url.startsWith(self.registration.scope));
    if (client) { await client.navigate(url); await client.focus(); }
    else await self.clients.openWindow(url);
  })());
});
