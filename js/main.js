// Start of the app: load the data, build the navigation, open the right screen.

import { store } from './store.js';
import * as clock from './clock.js';
import { register, start, refresh } from './router.js';
import { buildNav, markNav } from './nav.js';
import { today } from './screens/today.js';
import { week } from './screens/week.js';
import { more } from './screens/more.js';
import { body } from './screens/body.js';
import { food } from './screens/food.js';
import { learn } from './screens/learn.js';
import { create } from './screens/create.js';
import { mind } from './screens/mind.js';
import { habits } from './screens/habits.js';
import { review } from './screens/review.js';
import { applyTheme } from './theme.js';
import { settings } from './screens/settings.js';
import { guide } from './screens/guide.js';
import { pfe } from './screens/pfe.js';
import { money } from './screens/money.js';
import { runUnlockCheck } from './unlockFlow.js';
import { cleanUnusedPhotos } from './backupFlow.js';
import { initPWA } from './pwa.js';
import { startNotifier } from './notify.js';
import { toast } from './ui/sheet.js';

async function boot() {
  clock.initClock();
  const main = document.getElementById('main');
  try {
    await store.init();
  } catch (err) {
    console.error(err);
    main.textContent = `The app could not start: ${err.message}`;
    return;
  }
  applyTheme(store.settings.theme);

  register('today', today);
  register('week', week);
  register('more', more);
  register('body', body);
  register('food', food);
  register('learn', learn);
  register('create', create);
  register('mind', mind);
  register('habits', habits);
  register('review', review);
  register('settings', settings);
  register('guide', guide);
  register('pfe', pfe);
  register('money', money);

  // Is a new stage due today? Decide before the first screen is drawn.
  await runUnlockCheck().catch((err) => console.warn('Unlock check failed', err));

  buildNav(document.getElementById('side'), document.getElementById('tabs'));
  start(main, { onChange: (route) => markNav(route.name) });

  // Any saved change redraws the open screen.
  store.on(() => refresh());

  // Coming back to the app after a while: the day may have changed, so check again and redraw.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const changed = await runUnlockCheck().catch(() => false);
    if (!changed) refresh();
  });
  setInterval(() => runUnlockCheck().catch(() => {}), 10 * 60 * 1000);

  // Photos that no entry uses any more are removed quietly.
  cleanUnusedPhotos().catch(() => {});

  // Offline copy of the app, and the message when a new version has arrived.
  initPWA({
    onUpdate: () => toast('A new version is ready.', { ms: 20000, action: { label: 'Reload', run: () => location.reload() } }),
  });

  // Reminder 10 minutes before the next block, while the app is open (if switched on in Settings).
  startNotifier();

  // Ask the browser not to delete the data when storage runs low.
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}

boot();
