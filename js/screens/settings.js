// Settings: profile, times, dates, theme, Ramadan mode, reminders, calendar export,
// backup and import, resets.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet, confirmSheet, toast } from '../ui/sheet.js';
import { pageHead, section, seg, chips, field, note, timeInput } from '../ui/parts.js';
import { store } from '../store.js';
import * as clock from '../clock.js';
import { navigate } from '../router.js';
import { applyTheme } from '../theme.js';
import { APP_VERSION } from '../version.js';
import { downloadBackup, shareBackup, canShareFiles, parseBackupFile, importBackup, saveFile } from '../backupFlow.js';
import { describeBackup } from '../core/backup.js';
import { resetPhotoCache } from '../photos.js';
import { askNotificationPermission, notificationPermission, notificationsSupported, show as showNotification } from '../notify.js';
import { appDate, mondayOf, fmtDate, DAY_SHORT } from '../core/dates.js';
import { phaseWindows } from '../core/schedule.js';
import { buildICS, templateEvents } from '../core/ics.js';
import { hasOwnProfile } from './shared.js';

// Categories ticked for the calendar file. Kept while the app is open.
let icsCategories = null;

// 'work.start' + '09:30' -> { work: { start: '09:30' } }
function nest(path, value) {
  const out = {};
  let o = out;
  const keys = path.split('.');
  keys.forEach((k, i) => {
    o[k] = i === keys.length - 1 ? value : {};
    o = o[k];
  });
  return out;
}
const read = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

export function settings(root, route = { params: [] }) {
  const ctx = store.ctx();
  const s = ctx.settings;
  const today = appDate(clock.now(), ctx.program.dayStartHour);
  const formula = store.state.data.nutrition.formula;

  // Typed values are saved quietly (no redraw, so the keyboard stays open).
  // Choices (buttons) redraw the screen.
  const save = (path, value, quiet = true) => store.setSettings(nest(path, value), { silent: quiet });

  const input = (path, type, attrs = {}) => (type === 'time'
    ? timeInput(read(s, path), { onchange: (v) => save(path, v) })
    : h('input', {
      class: 'input', type, value: read(s, path) ?? '', ...attrs,
      onchange: (e) => {
        const el = e.target;
        let v = el.value;
        if (type === 'number') {
          v = Number(String(v).replace(',', '.'));
          if (!Number.isFinite(v) || (attrs.min != null && v < attrs.min) || (attrs.max != null && v > attrs.max)) {
            toast(`Enter a number between ${attrs.min} and ${attrs.max}.`);
            el.value = read(store.settings, path) ?? '';
            return;
          }
        }
        save(path, v);
      },
    }));
  const days = (path) => chips(DAY_SHORT.map((d, i) => ({ value: i + 1, label: d })), read(s, path), (v) => {
    const cur = read(store.settings, path);
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort();
    if (next.length) save(path, next, false);
  }, { multi: true });
  const row = (...kids) => h('div', { class: 'field-row' }, kids);
  const toggle = (path, label, hint, onchange) => h('label', { class: 'check-row' },
    h('input', {
      type: 'checkbox', checked: Boolean(read(s, path)),
      onchange: (e) => (onchange ? onchange(e.target.checked, e.target) : save(path, e.target.checked, false)),
    }),
    h('span', {}, label, hint ? h('small', { class: 'check-hint' }, hint) : null),
  );

  root.append(pageHead({ eyebrow: 'Mind and Body', title: route.params[0] === 'reminders' ? 'Reminders' : 'Settings', thin: `version ${APP_VERSION}` }));

  // ---- profile ----------------------------------------------------------------

  const profileSec = section({ no: '01', title: 'Profile', meta: 'Used for the targets' },
    hasOwnProfile()
      ? null
      : note({ tone: 'mind', text: 'These are the rough starting values of the program file, which is public on GitHub. Type your real birth date, height and weight here. What you type stays on this device.' }),
    row(field('Birth date', input('profile.birthDate', 'date', { max: today })), field('Height, cm', input('profile.heightCm', 'number', { min: 120, max: 230, step: 1, inputmode: 'numeric' }))),
    row(field('Weight, kg', input('profile.weightKg', 'number', { min: 30, max: 250, step: 0.1, inputmode: 'decimal' })), field('Activity factor', input('profile.activityFactor', 'number', { min: 1.2, max: 2.2, step: 0.05, inputmode: 'decimal' }))),
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Goal'),
      h('div', { class: 'seg-wrap' }, seg(Object.entries(formula.goals).map(([id, g]) => ({ value: id, label: id === 'recomp' ? 'Recomp' : g.label })), s.profile.goal, (v) => v && save('profile.goal', v, false), { label: 'Goal' })),
      h('span', { class: 'field-hint' }, Object.values(formula.goals).map((g) => `${g.label}: ${g.delta > 0 ? '+' : g.delta < 0 ? '−' : ''}${Math.abs(g.delta)} kcal`).join('. ')),
    ),
    toggle('pullUpBar', 'I have a pull up bar', 'Without it, Strength B uses table rows.'),
  );

  // ---- times ------------------------------------------------------------------

  const timesSec = section({ no: '02', title: 'My times', meta: '24 hour clock' },
    row(field('Wake, workdays', input('wake', 'time')), field('Wake, Saturday', input('wakeSaturday', 'time'))),
    row(field('Wake, Sunday', input('wakeWeekend', 'time')), field('Lights out', input('sleep', 'time'))),
    field('Lights out, Saturday', input('sleepSaturday', 'time')),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Work days'), days('work.days')),
    row(field('Work starts', input('work.start', 'time')), field('Work ends', input('work.end', 'time'))),
    field('Commute, minutes each way', input('commuteMin', 'number', { min: 0, max: 180, step: 5, inputmode: 'numeric' })),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Muay Thai days'), days('muayThai.days')),
    row(field('Muay Thai starts', input('muayThai.start', 'time')), field('Muay Thai ends', input('muayThai.end', 'time'))),
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Football day'),
      chips(DAY_SHORT.map((d, i) => ({ value: i + 1, label: d })), s.football.day, (v) => save('football.day', v, false)),
    ),
    row(field('Football starts', input('football.start', 'time')), field('Football, minutes', input('football.durationMin', 'number', { min: 15, max: 300, step: 15, inputmode: 'numeric' }))),
    h('p', { class: 'form-hint' }, 'The Week screen follows these times at once. Blocks that were given their own time in the Week editor keep it.'),
  );

  // ---- dates ------------------------------------------------------------------

  const phases = phaseWindows(ctx.program, s);
  const phaseDate = (p, key) => h('input', {
    class: 'input', type: 'date', value: p[key] ?? '',
    onchange: (e) => save(`phaseDates.${p.id}.${key}`, e.target.value),
  });
  const datesSec = section({ no: '03', title: 'Dates', meta: `Start: ${fmtDate(ctx.program.startDate, 'dayYear')}` },
    row(field('PFE defense', input('defenseDate', 'date')), field('CESI starts', input('cesiStart', 'date'))),
    h('p', { class: 'form-hint' }, 'Both are empty until you know them. The defense date ends phase 3 and starts Rhino + Grasshopper.'),
    phases.map((p) => h('div', { class: 'phase-row' },
      h('span', { class: 'field-label' }, `Phase ${p.n}: ${p.name}`),
      row(
        p.startsAt ? h('span', { class: 'phase-auto' }, p.start ? fmtDate(p.start, 'dayYear') : 'After the defense') : phaseDate(p, 'start'),
        p.endsAt ? h('span', { class: 'phase-auto' }, p.end ? fmtDate(p.end, 'dayYear') : p.endsAt === 'defense' ? 'Until the defense' : 'Until CESI starts') : phaseDate(p, 'end'),
      ),
    )),
    h('p', { class: 'form-hint' }, 'The program start date and the unlock dates live in data/program.json.'),
    h('div', { class: 'trow' },
      h('div', { class: 'trow-main' }, h('span', { class: 'trow-title' }, 'Unlock stages'), h('span', { class: 'trow-meta' }, 'See the gate, or force a stage')),
      h('a', { class: 'btn btn-small', href: '#/habits' }, 'Open'),
    ),
  );

  // ---- look, Ramadan --------------------------------------------------------------

  const lookSec = section({ no: '04', title: 'Look and modes' },
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Theme'),
      h('div', { class: 'seg-wrap' }, seg([{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Auto' }], s.theme, async (v) => {
        if (!v) return;
        applyTheme(v);
        await save('theme', v, false);
      }, { label: 'Theme' })),
    ),
    toggle('ramadan.on', 'Ramadan mode', 'Meals move to iftar and suhoor, the times below replace the usual ones, and every block shows its minimum version first.'),
    s.ramadan.on
      ? [
        row(field('Iftar', input('ramadan.iftar', 'time')), field('Suhoor', input('ramadan.suhoor', 'time'))),
        row(field('Work starts', input('ramadan.work.start', 'time')), field('Work ends', input('ramadan.work.end', 'time'))),
        row(field('Muay Thai starts', input('ramadan.muayThai.start', 'time')), field('Muay Thai ends', input('ramadan.muayThai.end', 'time'))),
        h('p', { class: 'form-hint' }, 'These times are placeholders. Set your real ones, and update iftar and suhoor as the month moves.'),
      ]
      : null,
  );

  // ---- reminders and calendar ---------------------------------------------------------

  const cats = ctx.program.categories;
  icsCategories ??= cats.map((c) => c.id).filter((id) => id !== 'work' && id !== 'free');
  const icsMonday = mondayOf(today < ctx.program.startDate ? ctx.program.startDate : today);
  const eventCount = templateEvents(ctx, icsMonday, { categories: icsCategories }).length;
  const permission = notificationPermission();

  const remindSec = section({ no: '05', title: 'Reminders' },
    note({
      text: 'For reminders when your phone is locked or this app is closed, add the schedule to your phone calendar. You can also turn on notifications below while this app is running.',
    }),
    h('div', { class: 'sub-head' }, h('h3', {}, 'When the app is closed: phone calendar'), h('span', { class: 'trow-meta' }, `${eventCount} weekly events`)),
    h('p', { class: 'form-hint' }, 'Your unlocked template week, as weekly events with a 10 minute alarm. Import it into a separate calendar called "Mind and Body". When the template changes, delete that calendar and import the new file.'),
    h('details', { class: 'simple-panel' }, h('summary', {}, 'Choose which activities to export'),
      h('span', { class: 'field-label' }, 'Include'),
      chips(cats.map((c) => ({ value: c.id, label: c.label })), icsCategories, (v) => {
        icsCategories = icsCategories.includes(v) ? icsCategories.filter((x) => x !== v) : [...icsCategories, v];
        navigate(route.params[0] === 'reminders' ? 'settings/reminders' : 'settings');
      }, { multi: true }),
    ),
    h('div', { class: 'focus-actions' }, h('button', {
      class: 'btn btn-solid', type: 'button', disabled: !eventCount,
      onclick: () => {
        saveFile('mind-and-body.ics', buildICS(store.ctx(), icsMonday, clock.now(), { categories: icsCategories }), 'text/calendar');
        toast('Calendar file downloaded.');
      },
    }, icon('download', 18), 'Download schedule for my calendar')),
    h('div', { class: 'sub-head' }, h('h3', {}, 'While this app is open')),
    toggle('notifications', 'Turn on schedule notifications', notificationsSupported()
      ? (permission === 'denied' ? 'Notifications are blocked for this site in the browser settings.' : 'Only while the app is open.')
      : 'This browser does not support notifications here. On an iPhone, install the app on the home screen first.',
    async (on, el) => {
      if (on) {
        const result = await askNotificationPermission();
        if (result !== 'granted') {
          el.checked = false;
          toast(result === 'unsupported' ? 'Notifications are not available in this browser.' : 'The browser did not allow notifications.');
          return;
        }
      }
      await save('notifications', on, false);
    }),
    field('Remind me before an activity', h('select', { class: 'input', 'aria-label': 'Reminder timing', onchange: (e) => store.setSettings({ reminderMinutes: Number(e.target.value) }) }, [5, 10, 15, 30].map(n => h('option', { value: n, selected: (s.reminderMinutes ?? 10) === n }, n + ' minutes before')))),
    h('button', { class: 'btn', type: 'button', onclick: async () => {
      const result = await askNotificationPermission();
      if (result !== 'granted') { toast('Please allow notifications in your browser settings first.'); return; }
      const ok = await showNotification('Mind and Body', 'Your test reminder. Schedule reminders appear here while the app is running.');
      toast(ok ? 'Test notification sent.' : 'Your browser could not display the notification. Check its notification settings.');
    } }, 'Send a test notification'),
    h('details', { class: 'simple-panel' }, h('summary', {}, 'How to get reminders on my phone'),
      h('ol', {}, h('li', {}, 'Download your schedule using the button above.'), h('li', {}, 'Import it into a separate calendar named Mind and Body. In Google Calendar, use its website: Settings, then Import & export.'), h('li', {}, 'Set that calendar to notify you 10 minutes before events, and allow calendar notifications on your phone.'), h('li', {}, 'This is a copy, not a live connection. After changing your schedule or unlocking activities, replace the imported calendar to avoid old reminders. One-week changes are not included.'))),
  );
  if (route.params[0] === 'reminders') {
    root.append(h('a', { class: 'btn btn-quiet', href: '#/today' }, 'Back to Today'), remindSec);
    return;
  }

  // ---- backup -----------------------------------------------------------------------

  const last = store.kv('lastBackup');
  const storageLine = h('p', { class: 'form-hint' }, 'Checking the storage...');
  (async () => {
    try {
      const [persisted, estimate] = await Promise.all([navigator.storage?.persisted?.(), navigator.storage?.estimate?.()]);
      const used = estimate?.usage != null ? `${(estimate.usage / 1048576).toFixed(1)} MB used on this device. ` : '';
      storageLine.textContent = `${used}${persisted ? 'The browser has promised to keep the data.' : 'The browser may delete the data if the device runs out of space, or if the site is not opened for a long time. Install the app and keep backups.'}`;
    } catch {
      storageLine.textContent = 'The data lives only in this browser, on this device.';
    }
  })();
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileIn.addEventListener('change', async () => {
    const file = fileIn.files[0];
    fileIn.value = '';
    if (!file) return;
    try {
      openImport(await parseBackupFile(file));
    } catch (err) {
      toast(err.message);
    }
  });
  const backupSec = section({ no: '06', title: 'Backup', meta: last ? `Last: ${fmtDate(last.at.slice(0, 10), 'short')}` : 'No backup yet' },
    h('p', { class: 'form-hint' }, 'One JSON file with everything: days, logs, settings, photos. It stays on your device until you move it.'),
    h('div', { class: 'btn-stack' },
      h('button', { class: 'btn btn-solid', type: 'button', onclick: async () => { await downloadBackup(); toast('Backup downloaded.'); } }, icon('download', 18), 'Download a backup'),
      canShareFiles()
        ? h('button', { class: 'btn', type: 'button', onclick: async () => { try { await shareBackup(); toast('Backup shared.'); } catch { /* closed the share sheet */ } } }, icon('upload', 18), 'Share the backup')
        : null,
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: async () => { await downloadBackup({ withPhotos: false }); toast('Backup without photos downloaded.'); } }, 'Download without photos'),
      h('button', { class: 'btn', type: 'button', onclick: () => fileIn.click() }, icon('upload', 18), 'Import a backup'),
    ),
    fileIn,
    storageLine,
  );

  // ---- reset --------------------------------------------------------------------------

  const ask = async (title, message, confirm, run, done) => {
    if (await confirmSheet({ title, message, confirm, danger: true })) {
      await run();
      toast(done);
    }
  };
  const resetSec = section({ no: '07', title: 'Reset' },
    h('div', { class: 'btn-stack' },
      h('button', {
        class: 'btn', type: 'button',
        onclick: () => ask('Reset to program defaults?', 'Every edit you made to blocks, habits, don’ts and the reading list is removed, and so are the "this week only" changes. Your logs, journal and weigh-ins stay.', 'Reset the program', async () => {
          await store.setKV('weekOverrides', {}, { silent: true });
          await store.setKV('overrides', {});
        }, 'The program is back to its defaults.'),
      }, 'Reset to program defaults'),
      h('button', {
        class: 'btn btn-quiet', type: 'button',
        onclick: () => ask('Reset the settings?', 'Profile, times, dates and theme go back to the values of the program. Your logs stay.', 'Reset the settings', async () => {
          await store.setKV('settings', {});
          applyTheme(store.settings.theme);
        }, 'Settings are back to the defaults.'),
      }, 'Reset the settings'),
      h('button', {
        class: 'btn btn-danger', type: 'button',
        onclick: () => ask('Delete all my data?', 'Everything is deleted from this device: days, logs, journal, weigh-ins, photos, settings and your program edits. This cannot be undone. Download a backup first.', 'Delete everything', async () => {
          await store.clearAll();
          resetPhotoCache();
          applyTheme(store.settings.theme);
        }, 'All data is deleted.'),
      }, 'Delete all my data'),
    ),
  );

  // ---- about ------------------------------------------------------------------------

  const preview = h('input', { class: 'input', type: 'datetime-local', 'aria-label': 'Date and time to preview' });
  const aboutSec = section({ no: '08', title: 'About', meta: `Version ${APP_VERSION}` },
    h('p', { class: 'form-hint' }, navigator.serviceWorker?.controller
      ? 'Offline ready: the app is stored on this device and works without a connection.'
      : 'Offline mode starts after the first full load from the published site.'),
    h('p', { class: 'form-hint' }, store.persistent ? 'No account, no server, no tracking. Nothing leaves this device.' : 'This browser does not allow saving here (private mode?). Nothing will be kept.'),
    h('div', { class: 'sub-head' }, h('h3', {}, 'Preview another day')),
    h('p', { class: 'form-hint' }, 'See the app as it will look on another date. It changes nothing in your data by itself, but what you tick during a preview is saved.'),
    h('div', { class: 'inline-form' }, preview, h('button', {
      class: 'btn', type: 'button',
      onclick: () => {
        if (preview.value) location.href = `${location.pathname}?now=${preview.value}#/today`;
      },
    }, 'Preview')),
    clock.isSimulated() ? h('div', { class: 'focus-actions' }, h('a', { class: 'btn btn-quiet', href: `${location.pathname}?now=off` }, 'Back to the real time')) : null,
  );

  root.append(h('div', { class: 'two-col' },
    h('div', { class: 'col' }, profileSec, timesSec, datesSec, lookSec),
    h('div', { class: 'col' }, remindSec, backupSec, resetSec, aboutSec),
  ));
}

// ---- import sheet -------------------------------------------------------------------

function openImport(backup) {
  const info = describeBackup(backup);
  const run = async (mode) => {
    await importBackup(backup, mode);
    sheet.close();
    toast(mode === 'replace' ? 'Backup restored.' : 'Backup merged.');
    navigate('today');
  };
  const sheet = openSheet({
    eyebrow: info.exportedAt ? `Saved on ${fmtDate(info.exportedAt.slice(0, 10), 'full')}` : 'Backup file',
    title: 'Import this backup?',
    body: [
      h('div', { class: 'facts' },
        h('div', {}, h('span', { class: 'eyebrow' }, 'Days'), h('b', {}, String(info.days))),
        h('div', {}, h('span', { class: 'eyebrow' }, 'Log entries'), h('b', {}, String(info.records))),
        h('div', {}, h('span', { class: 'eyebrow' }, 'Photos'), h('b', {}, String(info.photos))),
        h('div', {}, h('span', { class: 'eyebrow' }, 'Period'), h('b', {}, info.from ? `${fmtDate(info.from, 'day')} to ${fmtDate(info.to, 'day')}` : '–')),
      ),
      h('p', { class: 'sheet-text' }, h('b', {}, 'Merge'), ' adds the backup to what is on this device. If a day or an entry is on both sides, the one changed last is kept. Your settings here stay.'),
      h('p', { class: 'sheet-text' }, h('b', {}, 'Replace'), ' deletes everything on this device first, then loads the backup.'),
    ],
    footer: [
      h('button', { class: 'btn btn-grow', type: 'button', onclick: () => run('merge') }, 'Merge'),
      h('button', {
        class: 'btn btn-danger btn-grow', type: 'button',
        onclick: async () => {
          if (await confirmSheet({ title: 'Replace everything?', message: 'All the data on this device is deleted and replaced by the backup.', confirm: 'Replace', danger: true })) run('replace');
        },
      }, 'Replace'),
    ],
  });
}
