// Learn: the current focus, all tracks with their modules and links, the session logger
// with a timer, the AI lab with its prompt notebook, and learning hours per week.

import { h, cx, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet, toast } from '../ui/sheet.js';
import { pageHead, section, seg, bar, note, tick, field, empty } from '../ui/parts.js';
import { chart, barChart } from '../ui/charts.js';
import { recordSheet, recordRow } from '../ui/form.js';
import { store } from '../store.js';
import * as clock from '../clock.js';
import { markKept } from '../actions.js';
import { appDate, mondayOf, fmtDate, diffDays, fmtDur } from '../core/dates.js';
import { blocksForDate } from '../core/schedule.js';
import { lockInfo } from '../core/unlock.js';
import { currentFocus, trackWindow, trackProgress, aiTheme, weeklyMinutes } from '../core/learn.js';

const PROJECT_STATES = [{ value: 'todo', label: 'Not started' }, { value: 'doing', label: 'In progress' }, { value: 'done', label: 'Done' }];
const WEEKLY_GOAL_MIN = 180;

// Which tracks are unfolded. Kept while the app is open.
const openTracks = new Set();
let openInit = false;

const learnState = () => ({ done: {}, links: {}, projects: {}, revitGoals: {}, ...store.kv('learn', {}) });
const saveLearn = (patch, opts) => store.setKV('learn', { ...learnState(), ...patch }, opts);

function windowText(track, settings) {
  const w = trackWindow(track, settings);
  if (track.window) return track.window;
  if (w.start && w.end) return `${fmtDate(w.start, 'dayYear')} to ${fmtDate(w.end, 'dayYear')}`;
  if (w.start) return `From ${fmtDate(w.start, 'dayYear')}`;
  if (track.startsAt === 'defense') return 'After the defense (set the date in Settings)';
  return '';
}

export function learn(root) {
  const ctx = store.ctx();
  const today = appDate(clock.now(), ctx.program.dayStartHour);
  const data = store.state.data.tracks;
  const tracks = store.list('tracks', 'tracks');
  const st = learnState();
  const { current, next } = currentFocus(tracks, ctx.settings, today);
  const sessions = store.records('learn');
  const lock = lockInfo(ctx.stages, 's3', today);
  if (!openInit) {
    openInit = true;
    if (current) openTracks.add(current.id);
  }

  root.append(pageHead({ eyebrow: 'Mind and Body', title: 'Learn', thin: 'one track at a time' }));

  // ---- current focus ----------------------------------------------------------

  const timer = store.kv('learnTimer');
  const timerSlot = h('div');
  const drawTimer = () => {
    if (!timer) return;
    const minutes = Math.max(0, Math.round((clock.now().getTime() - new Date(timer.startedAt).getTime()) / 60000));
    timerSlot.replaceChildren(note({
      tone: 'mind',
      title: `Session running: ${fmtDur(minutes)}`,
      text: `Started at ${new Date(timer.startedAt).toTimeString().slice(0, 5)}. The timer keeps going if you leave this screen.`,
      actions: [
        h('button', {
          class: 'btn btn-small btn-solid', type: 'button',
          onclick: async () => {
            await store.setKV('learnTimer', null, { silent: true });
            openSessionLog(ctx, today, current, { minutes: Math.max(1, minutes) });
          },
        }, 'Stop and log'),
        h('button', { class: 'btn btn-small btn-quiet', type: 'button', onclick: () => store.setKV('learnTimer', null) }, 'Cancel'),
      ],
    }));
  };
  drawTimer();

  let focusBody;
  if (current) {
    const p = trackProgress(current, st.done);
    const weekNo = Math.floor(diffDays(mondayOf(current.start), mondayOf(today)) / 7) + 1;
    const weeks = current.end ? Math.floor(diffDays(mondayOf(current.start), mondayOf(current.end)) / 7) + 1 : null;
    focusBody = [
      h('h2', { class: 'focus-title' }, current.title),
      h('p', { class: 'focus-meta' }, `${windowText(current, ctx.settings)} · week ${weekNo}${weeks ? ` of ${weeks}` : ''}`),
      p.total
        ? [bar(p.pct, 'var(--c-learn)'), h('p', { class: 'focus-meta' }, `${p.done} of ${p.total} modules`, p.nextModule ? ` · next: ${p.nextModule.title}` : ' · all done')]
        : h('p', { class: 'focus-meta' }, current.about),
    ];
  } else {
    focusBody = [
      h('h2', { class: 'focus-title is-quiet' }, 'Not started yet'),
      next ? h('p', { class: 'focus-meta' }, `Next: ${next.title}, from ${fmtDate(next.start, 'full')}.`) : null,
    ];
  }
  const focus = h('div', { class: 'focus' },
    h('span', { class: 'eyebrow' }, 'Current focus'),
    focusBody,
    h('div', { class: 'focus-actions' },
      h('button', { class: 'btn btn-solid btn-grow', type: 'button', onclick: () => openSessionLog(ctx, today, current) }, 'Log a session'),
      timer ? null : h('button', {
        class: 'btn btn-grow', type: 'button',
        onclick: () => {
          store.setKV('learnTimer', { startedAt: clock.now().toISOString() });
          toast('Timer started.');
        },
      }, icon('timer', 18), 'Start timer'),
    ),
  );

  const top = h('div', { class: 'col' }, focus, timerSlot,
    lock.locked ? note({ text: `The Learn blocks are still locked. They unlock on ${fmtDate(lock.unlockDate, 'long')} if the active items hold at 80%.` }) : null,
  );

  // ---- hours per week ---------------------------------------------------------

  const weeks = weeklyMinutes(sessions, today, 8);
  const thisWeek = weeks[weeks.length - 1].minutes;
  const hoursSec = section({ no: '02', title: 'Hours per week', meta: `This week: ${fmtDur(thisWeek)}` },
    chart((w, hgt) => barChart(w, hgt, {
      bars: weeks.map((wk, i) => ({ label: fmtDate(wk.monday, 'day').split(' ')[0], v: wk.minutes / 60, strong: i === weeks.length - 1 })),
      goal: WEEKLY_GOAL_MIN / 60, color: 'var(--c-learn)', unit: ' h',
    }), { height: 170 }),
    h('p', { class: 'form-hint' }, 'Bars: the last 8 weeks, by Monday. Dashed line: about 3 h a week in the full template.'),
  );

  // ---- tracks -----------------------------------------------------------------

  const month = today.slice(0, 7);
  const saveGoal = debounce((text) => saveLearn({ revitGoals: { ...learnState().revitGoals, [month]: text } }, { silent: true }), 500);
  const saveProjectNote = debounce((id, text) => {
    const cur = learnState();
    saveLearn({ projects: { ...cur.projects, [id]: { ...(cur.projects[id] ?? {}), note: text } } }, { silent: true });
  }, 500);

  const trackCard = (t) => {
    const p = trackProgress(t, st.done);
    const isCurrent = current?.id === t.id;
    const project = st.projects[t.id] ?? {};
    return h('details', {
      class: cx('track', isCurrent && 'is-current'), open: openTracks.has(t.id),
      ontoggle: (e) => { if (e.target.open) openTracks.add(t.id); else openTracks.delete(t.id); },
    },
    h('summary', {},
      h('span', { class: 'track-head' },
        h('b', {}, t.title, isCurrent ? h('span', { class: 'tag' }, 'Focus') : null),
        h('small', {}, windowText(t, ctx.settings)),
      ),
      h('span', { class: 'track-count' }, p.total ? `${p.done}/${p.total}` : ''),
    ),
    h('div', { class: 'track-body' },
      t.about ? h('p', { class: 'form-hint' }, t.about) : null,
      t.monthlyGoal
        ? field(`Micro goal for ${fmtDate(`${month}-01`, 'dayMonth').split(' ')[1]}`, h('input', {
          class: 'input', type: 'text', maxlength: 160, placeholder: 'One small thing to learn through work this month',
          value: st.revitGoals[month] ?? '', oninput: (e) => saveGoal(e.target.value), onblur: () => saveGoal.flush(),
        }))
        : null,
      t.modules.length
        ? h('div', { class: 'mods' }, t.modules.map((m) => {
          const links = st.links[m.id] ?? [];
          const done = Boolean(st.done[m.id]);
          return h('div', { class: cx('mod', done && 'is-done') },
            h('div', { class: 'mod-main' },
              h('span', { class: 'mod-title' }, m.title),
              links.length ? h('span', { class: 'mod-links' }, links.map((l) => h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.label || l.url))) : null,
            ),
            h('button', { class: 'icon-btn is-quiet', type: 'button', 'aria-label': `Links for ${m.title}`, onclick: () => openLinks(m) }, icon('link', 18)),
            tick(done ? 'done' : null, {
              label: `${m.title}: ${done ? 'mark as not done' : 'mark as done'}`,
              onclick: () => {
                const d = { ...learnState().done };
                if (done) delete d[m.id];
                else d[m.id] = true;
                saveLearn({ done: d });
              },
            }),
          );
        }))
        : null,
      t.project
        ? h('div', { class: 'project' },
          h('span', { class: 'eyebrow' }, 'Mini project'),
          h('p', {}, t.project),
          seg(PROJECT_STATES, project.status ?? 'todo', (v) => {
            if (!v) return;
            const cur = learnState();
            saveLearn({ projects: { ...cur.projects, [t.id]: { ...(cur.projects[t.id] ?? {}), status: v } } });
          }, { label: 'Mini project status' }),
          h('textarea', {
            class: 'input', rows: 2, maxlength: 600, placeholder: 'Notes on the mini project', value: project.note ?? '', 'aria-label': 'Notes on the mini project',
            oninput: (e) => saveProjectNote(t.id, e.target.value), onblur: () => saveProjectNote.flush(),
          }),
        )
        : null,
    ));
  };
  const ordered = [...tracks.filter((t) => t.kind === 'focus'), ...tracks.filter((t) => t.kind !== 'focus')];
  const tracksSec = section({ no: '01', title: 'Tracks', meta: 'Tap to open' }, ordered.map(trackCard));

  // ---- AI lab -----------------------------------------------------------------

  const theme = aiTheme(data.aiLab, today);
  const aiStarted = today >= data.aiLab.start;
  const prompts = store.records('prompt');
  const aiSec = section({ no: '03', title: 'AI lab', meta: 'Friday, 30 min' },
    h('div', { class: 'focus is-small' },
      h('span', { class: 'eyebrow' }, aiStarted ? "This week's theme" : `Starts ${fmtDate(data.aiLab.start, 'long')}. First theme`),
      h('h3', { class: 'ai-theme' }, theme.title),
    ),
    h('ol', { class: 'themes' }, data.aiLab.themes.map((t) => h('li', { class: cx(t.id === theme.id && 'is-on') }, t.title))),
    h('div', { class: 'sub-head' },
      h('h3', {}, 'Prompt notebook'),
      h('button', { class: 'btn btn-small', type: 'button', onclick: () => openPrompt(today) }, icon('plus', 16), 'Prompt'),
    ),
    prompts.length
      ? h('div', { class: 'loglist' }, prompts.map((p) => recordRow({
        date: fmtDate(p.date, 'day'), title: p.purpose, detail: p.prompt,
        onclick: () => openPrompt(today, p),
      })))
      : empty('Save the prompts that worked, and what they were for.'),
  );

  // ---- sessions ---------------------------------------------------------------

  const kinds = Object.fromEntries(data.sessionKinds.map((k) => [k.id, k.title]));
  const trackTitle = (id) => (id === 'ai' ? data.aiLab.title : tracks.find((t) => t.id === id)?.title ?? 'Learning');
  const sessionsSec = section({ no: '04', title: 'Sessions', meta: sessions.length ? `${sessions.length} logged` : null },
    sessions.length
      ? h('div', { class: 'loglist' }, sessions.slice(0, 12).map((s) => recordRow({
        date: fmtDate(s.date, 'short'),
        title: `${trackTitle(s.track)} · ${fmtDur(s.minutes ?? 0)}`,
        detail: [kinds[s.kind], s.did].filter(Boolean).join(' · '),
        onclick: () => openSessionLog(ctx, today, current, {}, s),
      })))
      : empty('No session yet. Log one, or start the timer when you sit down.'),
  );

  root.append(h('div', { class: 'two-col' },
    h('div', { class: 'col' }, top, tracksSec),
    h('div', { class: 'col' }, hoursSec, aiSec, sessionsSec),
  ));

  const tickTimer = timer ? setInterval(drawTimer, 15000) : null;
  return () => {
    clearInterval(tickTimer);
    saveGoal.flush();
    saveProjectNote.flush();
  };
}

// ---- links of one module (I fill them myself) --------------------------------------

function openLinks(module) {
  const label = h('input', { class: 'input', type: 'text', maxlength: 80, placeholder: 'Name of the resource' });
  const url = h('input', { class: 'input', type: 'url', inputmode: 'url', maxlength: 400, placeholder: 'https://' });
  const list = h('div', { class: 'loglist' });
  const draw = () => {
    const links = learnState().links[module.id] ?? [];
    list.replaceChildren(...(links.length
      ? links.map((l) => h('div', { class: 'logrow is-static is-link' },
        h('span', { class: 'logrow-main' },
          h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, h('b', {}, l.label || l.url)),
          h('small', {}, l.url),
        ),
        h('button', {
          class: 'icon-btn', type: 'button', 'aria-label': `Remove ${l.label || l.url}`,
          onclick: async () => {
            const cur = learnState();
            await saveLearn({ links: { ...cur.links, [module.id]: (cur.links[module.id] ?? []).filter((x) => x.id !== l.id) } });
            draw();
          },
        }, icon('trash', 18)),
      ))
      : [empty('No link yet. Add the tutorials and pages you really use.')]));
  };
  draw();
  openSheet({
    eyebrow: 'Resource links',
    title: module.title,
    body: [
      list,
      field('Name', label),
      field('Address', url),
      h('button', {
        class: 'btn btn-block', type: 'button', style: { marginTop: '14px' },
        onclick: async () => {
          const address = url.value.trim();
          if (!/^https?:\/\/\S+$/i.test(address)) {
            toast('Paste a full address that starts with https://');
            return;
          }
          const cur = learnState();
          await saveLearn({ links: { ...cur.links, [module.id]: [...(cur.links[module.id] ?? []), { id: store.uid('l'), label: label.value.trim(), url: address }] } });
          label.value = '';
          url.value = '';
          draw();
        },
      }, 'Add link'),
    ],
  });
}

// ---- session logger ------------------------------------------------------------------

function openSessionLog(ctx, today, current, defaults = {}, existing) {
  const data = store.state.data.tracks;
  const tracks = store.list('tracks', 'tracks');
  recordSheet({
    type: 'learn',
    eyebrow: 'Learn',
    title: existing ? 'Edit session' : 'Log a session',
    existing,
    defaults: { date: today, kind: 'hands-on', track: current?.id ?? 'revit', minutes: 60, ...defaults },
    fields: [
      { key: 'date', label: 'Date', kind: 'date', max: today, required: true },
      { key: 'kind', label: 'Kind', kind: 'chips', required: true, options: data.sessionKinds.map((k) => ({ value: k.id, label: k.title })) },
      { key: 'track', label: 'Track', kind: 'chips', required: true, options: [...tracks.map((t) => ({ value: t.id, label: t.title })), { value: 'ai', label: data.aiLab.title }] },
      { key: 'minutes', label: 'Minutes', kind: 'number', min: 1, max: 600, step: 1, required: true },
      { key: 'did', label: 'What I did', kind: 'textarea' },
      { key: 'blocked', label: 'What blocked me', kind: 'textarea' },
    ],
    savedText: 'Session saved.',
    onSave: async (rec) => {
      // Tick the matching Learn block of that day, if there is one and it is still open.
      const ids = data.sessionKinds.find((k) => k.id === rec.kind)?.blocks ?? [];
      const block = blocksForDate(store.ctx(), rec.date).find((b) => ids.includes(b.id) && !b.locked);
      if (block) await markKept(rec.date, block.key);
    },
  });
}

// ---- prompt notebook -------------------------------------------------------------------

function openPrompt(today, existing) {
  recordSheet({
    type: 'prompt',
    eyebrow: 'Prompt notebook',
    title: existing ? 'Edit prompt' : 'New prompt',
    existing,
    defaults: { date: today },
    fields: [
      { key: 'purpose', label: 'What it was for', kind: 'text', required: true, placeholder: 'For example: moodboard for the PFE entrance hall' },
      { key: 'prompt', label: 'The prompt', kind: 'textarea', rows: 6, max: 6000, required: true },
      { key: 'tool', label: 'Tool', kind: 'text', placeholder: 'Optional' },
      { key: 'note', label: 'What worked', kind: 'textarea' },
      { key: 'date', label: 'Date', kind: 'date', max: today },
    ],
    savedText: 'Prompt saved.',
  });
}
