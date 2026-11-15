// Registers the service worker (sw.js) that makes the app work offline,
// and tells the app when a new version has been downloaded.
//
// On your own computer (localhost) the offline cache is OFF, so you always see your latest edits.
// To test offline mode locally, open the app once with ?sw=1 (and ?sw=0 to switch it off again).

const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;

function localSwitch() {
  try {
    const param = new URLSearchParams(location.search).get('sw');
    if (param === '1') localStorage.setItem('mb-sw', '1');
    if (param === '0') localStorage.removeItem('mb-sw');
    return localStorage.getItem('mb-sw') === '1';
  } catch {
    return false;
  }
}

async function switchOff() {
  try {
    for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
    for (const key of await caches.keys()) if (key.startsWith('mind-and-body-')) await caches.delete(key);
  } catch { /* nothing to clean */ }
}

// onUpdate() is called when new files are ready and a reload would show them.
export async function initPWA({ onUpdate }) {
  if (!('serviceWorker' in navigator)) return;
  if (LOCAL && !localSwitch()) {
    await switchOff();
    return;
  }
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'updated') onUpdate();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) onUpdate();
  });
  try {
    await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url));
    const reg = await navigator.serviceWorker.ready;
    let last = 0;
    try { last = Number(localStorage.getItem('mb-update-check')) || 0; } catch { /* private mode */ }
    if (hadController && navigator.onLine && Date.now() - last > CHECK_EVERY_MS) {
      try { localStorage.setItem('mb-update-check', String(Date.now())); } catch { /* private mode */ }
      reg.active?.postMessage({ type: 'check' });
    }
  } catch (err) {
    console.warn('Offline mode could not start.', err);
  }
}
