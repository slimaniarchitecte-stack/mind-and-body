// Reminders while the app is open: a notification 10 minutes before the next block.
//
// A web app without a server cannot wake itself up when it is closed, so this only works
// while Mind and Body is open (or still running in the background). For real reminders,
// use the calendar export in Settings.

import { store } from './store.js';
import * as clock from './clock.js';
import { appDate, appMinutes, fmtHM } from './core/dates.js';
import { blocksForDate } from './core/schedule.js';



const sent = new Set();

export const notificationsSupported = () => typeof Notification !== 'undefined';

export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

// Ask the browser for permission. Returns 'granted', 'denied', 'default' or 'unsupported'.
export async function askNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export async function show(title, body) {
  const options = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'mind-and-body-next' };
  try {
    // Phones only allow notifications through the service worker.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch { /* fall through */ }
  try {
    // eslint-disable-next-line no-new
    const notification = new Notification(title, options);
    notification.onclick = () => { window.focus(); location.hash = '#/today'; notification.close(); };
    return true;
  } catch {
    return false;
  }
}

function tick() {
  if (!store.settings.notifications || notificationPermission() !== 'granted') return;
  const ctx = store.ctx();
  const dsh = ctx.program.dayStartHour;
  const now = clock.now();
  const today = appDate(now, dsh);
  if (today < ctx.program.startDate) return;
  const minutes = appMinutes(now, dsh);
  const day = store.day(today);
  for (const b of blocksForDate(ctx, today)) {
    if (b.locked || (b.category === 'free' && !b.track)) continue;
    const lead = b.start - minutes;
    const key = `${today}|${b.key}|${b.start}`;
    if (lead > (Number(store.settings.reminderMinutes) || 10) || lead < 0 || sent.has(key) || ['done', 'min', 'skip'].includes(day.items[b.key]?.s)) continue;
    sent.add(key);
    const minimum = day.badDay && b.min ? ` Minimum: ${b.min}` : '';
    show(`${fmtHM(b.start)} ${b.title}`, lead > 0 ? `In ${lead} min.${minimum}` : `Now.${minimum}`);
  }
}

export function startNotifier() {
  setInterval(tick, 30000);
  setTimeout(tick, 2000);
}
