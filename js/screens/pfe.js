// PFE: my steps, how far I am, the next deadline and the hours I put in.

import { h, cx } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, section, bar, tick, empty } from '../ui/parts.js';
import { openSheet, toast, confirmSheet } from '../ui/sheet.js';
import { store } from '../store.js';
import * as clock from '../clock.js';
import { appDate, addDays, fmtDate, mondayOf } from '../core/dates.js';
import { keptMinutes } from '../core/stats.js';
import { PFE_STARTER, pfeProgress } from '../core/pfe.js';

const steps = () => store.kv('pfeSteps', []);
const saveSteps = (list) => store.setKV('pfeSteps', list);
const hours = (min) => `${Math.round((min / 60) * 10) / 10} h`;

function dueText(due, today) {
  if (!due) return 'No date';
  if (due < today) return `Late, was ${fmtDate(due, 'short')}`;
  if (due === today) return 'Due today';
  return `Due ${fmtDate(due, 'short')}`;
}

function openStepSheet(step) {
  const title = h('input', { class: 'input', type: 'text', maxlength: 100, placeholder: 'For example: ground floor plan', value: step?.title ?? '', 'aria-label': 'Step' });
  const due = h('input', { class: 'input', type: 'date', value: step?.due ?? '', 'aria-label': 'Due date' });
  const save = () => {
    const t = title.value.trim();
    if (!t) { title.focus(); return; }
    const list = steps();
    saveSteps(step
      ? list.map((s) => (s.id === step.id ? { ...s, title: t, due: due.value || null } : s))
      : [...list, { id: store.uid('pfe'), title: t, due: due.value || null, done: false }]);
    sheet.close();
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  const sheet = openSheet({
    eyebrow: 'PFE',
    title: step ? 'Edit step' : 'New step',
    body: [
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Step'), title),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Due date (optional)'), due),
    ],
    footer: [
      step ? h('button', {
        class: 'btn btn-quiet btn-icon', type: 'button', 'aria-label': 'Delete this step',
        onclick: () => { saveSteps(steps().filter((s) => s.id !== step.id)); sheet.close(); toast('Step deleted.'); },
      }, icon('trash', 18)) : null,
      h('button', { class: 'btn btn-solid btn-grow', type: 'button', onclick: save }, 'Save'),
    ],
  });
  setTimeout(() => title.focus(), 60);
}

export function pfe(root) {
  const ctx = store.ctx();
  const today = appDate(clock.now(), ctx.program.dayStartHour);
  const deadline = ctx.settings.defenseDate || null;
  const list = steps();
  const p = pfeProgress(list, today, deadline);
  const start = ctx.program.startDate;
  const monday = mondayOf(today);
  const weekMin = today >= start ? keptMinutes(ctx, store.getDay, monday > start ? monday : start, addDays(monday, 6), 'pfe') : 0;
  const totalMin = today >= start ? keptMinutes(ctx, store.getDay, start, today, 'pfe') : 0;

  const hero = h('div', { class: 'money-hero' },
    h('span', { class: 'eyebrow' }, 'PFE progress'),
    h('b', { class: 'money-left' }, p.pct == null ? '–' : `${Math.round(p.pct * 100)}%`),
    bar(p.pct ?? 0, 'var(--accent)'),
    h('div', { class: 'money-sub' },
      h('span', {}, p.total ? `${p.done} of ${p.total} steps done` : 'No steps yet'),
      p.daysToDeadline != null
        ? h('strong', {}, p.daysToDeadline >= 0 ? `${p.daysToDeadline} days to the jury` : 'Jury date passed')
        : null,
    ),
    p.next
      ? h('div', { class: 'pfe-next' }, h('span', { class: 'eyebrow' }, 'Next'), h('p', {}, p.next.title), h('small', {}, dueText(p.next.due, today)))
      : null,
    p.late ? h('p', { class: 'pfe-late' }, `${p.late} ${p.late === 1 ? 'step is' : 'steps are'} late. Move the date or do the minimum today.`) : null,
  );

  const stepsSec = section({ title: 'Steps', meta: p.total ? `${p.done} / ${p.total}` : null },
    list.length
      ? h('div', { class: 'habs' }, list.map((s) => h('div', { class: cx('hab', s.done && 'is-done') },
        h('button', { class: 'hab-main pfe-step', type: 'button', onclick: () => openStepSheet(s) },
          h('span', { class: 'hab-title' }, s.title),
          h('span', { class: cx('blk-meta', !s.done && s.due && s.due < today && 'is-late') }, s.done ? 'Done' : dueText(s.due, today)),
        ),
        h('div', { class: 'hab-act' }, tick(s.done ? 'done' : null, {
          label: `${s.title}: ${s.done ? 'mark not done' : 'mark done'}`,
          onclick: () => {
            saveSteps(steps().map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)));
            if (!s.done) toast('Step done. Well done.');
          },
        })),
      )))
      : h('div', {},
        empty('Break your PFE into steps. Ticking them off shows how far you are.'),
        h('button', {
          class: 'btn btn-block', type: 'button', style: { marginTop: '10px' },
          onclick: () => saveSteps(PFE_STARTER.map((t) => ({ id: store.uid('pfe'), title: t, due: null, done: false }))),
        }, 'Start with a typical list'),
      ),
    h('button', { class: 'btn btn-solid btn-block', type: 'button', style: { marginTop: '12px' }, onclick: () => openStepSheet() }, icon('plus', 18), 'Add a step'),
    list.length ? h('p', { class: 'form-hint' }, 'Tap a step to rename it, give it a date or delete it.') : null,
  );

  const deadlineIn = h('input', {
    class: 'input', type: 'date', value: deadline ?? '', 'aria-label': 'Jury date',
    onchange: (e) => store.setSettings({ defenseDate: e.target.value || '' }),
  });

  const timeSec = section({ title: 'Time on PFE', meta: 'From your ticked PFE blocks' },
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, 'This week'), h('b', {}, hours(weekMin))),
      h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, 'Since the start'), h('b', {}, hours(totalMin))),
    ),
    h('div', { class: 'inline-form' }, h('span', { class: 'field-label' }, 'Jury date'), deadlineIn),
    h('p', { class: 'form-hint' }, 'The same date as "PFE defense" in Settings. It also moves the program into its PFE phase.'),
    list.length ? h('button', {
      class: 'btn-text', type: 'button',
      onclick: async () => {
        if (await confirmSheet({ title: 'Delete all steps?', message: 'Your PFE steps will be removed. The schedule is not touched.', confirm: 'Delete all', cancel: 'Keep', danger: true })) saveSteps([]);
      },
    }, 'Delete all steps') : null,
  );

  root.append(
    pageHead({ eyebrow: 'Mind and Body', title: 'PFE', thin: 'final project' }),
    h('div', { class: 'two-col' }, h('div', { class: 'col' }, hero, stepsSec), h('div', { class: 'col' }, timeSec)),
  );
}
