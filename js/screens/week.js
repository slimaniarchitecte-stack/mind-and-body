// Week: the template week for any week, with locked blocks faded, and the block editor.

import { h, cx } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet, toast } from '../ui/sheet.js';
import { pageHead, note, chips, field, timeInput } from '../ui/parts.js';
import { store } from '../store.js';
import * as clock from '../clock.js';
import { navigate } from '../router.js';
import { updateWeek } from '../actions.js';
import { layerPatch, layerAdd, layerRemove } from '../program.js';
import {
  appDate, addDays, mondayOf, weekDates, programWeek, fmtDate, fmtHM, fmtDur, fmtWeekRange, isISO, dow, parseHM, normalizeTime, DAY_SHORT,
} from '../core/dates.js';
import { blocksForDate, daysOf, phaseFor, clashes } from '../core/schedule.js';
import { itemStatus, trackedItems } from '../core/adherence.js';
import { nextLockedStage } from '../core/unlock.js';

// Categories hidden with the legend. Kept while the app is open.
const hidden = new Set();
let chosenDay = null;

const sameDays = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export function week(root, route) {
  const ctx = store.ctx();
  const dsh = ctx.program.dayStartHour;
  const today = appDate(clock.now(), dsh);
  const monday = mondayOf(isISO(route.params[0]) ? route.params[0] : today);
  const dates = weekDates(monday);
  if (chosenDay !== 'all' && !dates.includes(chosenDay)) chosenDay = dates.includes(today) ? today : monday;
  const n = programWeek(ctx.program.startDate, monday);
  const phase = phaseFor(ctx.program, ctx.settings, dates[6]) ?? phaseFor(ctx.program, ctx.settings, monday);
  const isThisWeek = monday === mondayOf(today);

  root.append(pageHead({
    eyebrow: n >= 1 ? `${phase?.name ?? 'Program'} · Week ${n}` : 'Before the start',
    title: 'My schedule',
    thin: fmtWeekRange(monday),
    below: h('div', { class: 'daynav' },
      h('a', { class: 'nav-link', href: `#/week/${addDays(monday, -7)}`, 'aria-label': 'Previous week' }, icon('left', 16), n - 1 >= 1 ? `Week ${n - 1}` : fmtDate(addDays(monday, -7), 'day')),
      h('a', { class: 'nav-link', href: `#/week/${addDays(monday, 7)}`, 'aria-label': 'Next week' }, n + 1 >= 1 ? `Week ${n + 1}` : fmtDate(addDays(monday, 7), 'day'), icon('right', 16)),
      isThisWeek ? null : h('a', { class: 'btn btn-quiet btn-small', href: '#/week' }, 'This week'),
      h('button', { class: 'btn btn-small', type: 'button', onclick: () => openEditor(ctx, null, chosenDay === 'all' ? (isThisWeek ? today : monday) : chosenDay, monday) }, icon('plus', 16), 'Add activity'),
    ),
  }));

  root.append(h('p', { class: 'form-hint is-tip' }, 'Tap any activity to change its time or delete it. Use Add activity for something new. Choose This week only or Every week when saving.'), h('a', { class: 'btn btn-small', href: '#/settings/reminders' }, 'Set up reminders'));
  root.append(field('Show a day', h('select', { class: 'input', 'aria-label': 'Show a day', onchange: e => { chosenDay = e.target.value; navigate('week/' + monday); } },
    dates.map(d => h('option', { value: d, selected: chosenDay === d }, fmtDate(d, 'long'))),
    h('option', { value: 'all', selected: chosenDay === 'all' }, 'Whole week'))));
  const next = nextLockedStage(ctx.stages);
  if (next) {
    root.append(h('details', { class: 'simple-panel' }, h('summary', {}, 'Upcoming habits'), note({
      title: `Next unlock check: ${fmtDate(next.due, 'long')}`,
      text: `${next.weeks}. ${next.summary}`,
    })));

  }

  // Legend: tap a category to hide or show it.
  root.append(h('details', { class: 'simple-panel' }, h('summary', {}, 'Filter activities'), h('div', { class: 'legend', role: 'group', 'aria-label': 'Show or hide categories' },
    ctx.program.categories.map((c) => h('button', {
      class: cx('legend-item', `cat-${c.id}`), type: 'button', 'aria-pressed': String(!hidden.has(c.id)),
      onclick: () => {
        if (hidden.has(c.id)) hidden.delete(c.id);
        else hidden.add(c.id);
        navigate(`week/${monday}`);
      },
    }, h('i', {}), c.label)),
  )));

  root.append(h('div', { class: chosenDay === 'all' ? 'wk' : 'wk single-day' }, dates.filter(d => chosenDay === 'all' || chosenDay === d).map((date) => {
    const clash = clashes(blocksForDate(ctx, date));
    const blocks = blocksForDate(ctx, date).filter((b) => !hidden.has(b.category));
    const day = store.day(date);
    const items = new Map(trackedItems(ctx, date).map((it) => [it.key, it]));
    return h('section', { class: cx('wk-day', date === today && 'is-today', date < today && 'is-past') },
      h('a', { class: 'wk-day-head', href: `#/today/${date}` },
        h('span', { class: 'wk-day-name' }, DAY_SHORT[dow(date) - 1]),
        h('span', { class: 'wk-day-num' }, String(Number(date.slice(8)))),
        date === today ? h('span', { class: 'tag' }, 'Today') : null,
      ),
      h('div', { class: 'wk-list' }, blocks.map((b) => {
        const status = items.has(b.key) ? itemStatus(ctx, day, items.get(b.key), date) : null;
        return h('button', {
          class: cx('wk-blk', `cat-${b.category}`, b.locked && 'is-locked', status && `is-${status}`, !b.track && 'is-info', clash.has(b.key) && 'is-clash'),
          type: 'button',
          onclick: () => openEditor(ctx, b, date, monday),
        },
        h('span', { class: 'wk-time' }, fmtHM(b.start)),
        h('span', { class: 'wk-title' }, b.title),
        h('span', { class: 'wk-meta' },
          b.locked ? [icon('lock', 12), ` ${fmtDate(b.unlockDate, 'day')}`] : fmtDur(b.end - b.start),
          b.weekOnly || b.moved ? ' · this week' : '',
          clash.has(b.key) ? ' · overlaps' : '',
          status === 'done' ? ' · done' : status === 'min' ? ' · min' : status === 'skip' ? ' · skipped' : '',
        ));
      })),
    );
  })));

  // Opened from Today with "Edit this block": #/week/<date>/edit/<id>
  if (route.params[1] === 'edit' && route.params[2]) {
    const date = isISO(route.params[0]) ? route.params[0] : today;
    const inst = blocksForDate(ctx, date).find((b) => b.id === route.params[2]);
    history.replaceState(null, '', `#/week/${monday}`);
    if (inst) openEditor(ctx, inst, date, monday);
  }
}

// ---- block editor -------------------------------------------------------------

function openEditor(ctx, inst, date, monday) {
  const isNew = !inst;
  const dsh = ctx.program.dayStartHour;
  const weekLayer = ctx.weekOverrides[monday] ?? {};
  const weekAdded = !isNew && (weekLayer.added ?? []).some((x) => x.id === inst.id);
  const def = isNew ? null : (ctx.blocks.find((x) => x.id === inst.id) ?? (weekLayer.added ?? []).find((x) => x.id === inst.id) ?? {});
  const eff = isNew ? null : { ...def, ...(weekLayer.patches?.[inst.id] ?? {}) };
  const oldDays = isNew ? [] : daysOf(eff, ctx.settings);
  const followsSettings = !isNew && typeof def.start === 'string' && def.start.startsWith('@');

  const form = {
    title: inst?.title ?? '',
    note: inst?.note ?? '',
    category: inst?.category ?? 'free',
    days: isNew ? [dow(date)] : [...oldDays],
    start: fmtHM(inst?.start ?? 18 * 60),
    duration: inst ? inst.end - inst.start : 30,
    min: inst?.min ?? '',
    track: inst?.track ?? true,
    stage: inst?.stage ?? 's1',
  };

  const title = h('input', { class: 'input', type: 'text', value: form.title, maxlength: 60, placeholder: 'For example: Rotaract meeting' });
  const noteIn = h('input', { class: 'input', type: 'text', value: form.note, maxlength: 140, placeholder: 'Optional' });
  const start = timeInput(form.start, { label: 'Start time' });
  const duration = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 5, max: 600, step: 5, value: form.duration });
  const min = h('input', { class: 'input', type: 'text', value: form.min, maxlength: 140, placeholder: 'The tiny version for a bad day' });
  const stage = h('select', { class: 'input' }, ctx.program.stages.map((st) => {
    const info = ctx.stages[st.id];
    const label = info.active ? `Stage ${st.n}: active` : `Stage ${st.n}: unlocks ${fmtDate(info.due, 'day')}`;
    return h('option', { value: st.id, selected: st.id === form.stage }, label);
  }));
  const track = h('input', { type: 'checkbox', checked: form.track });
  const error = h('p', { class: 'form-error', hidden: true });

  const catSlot = h('div');
  const drawCats = () => catSlot.replaceChildren(chips(
    ctx.program.categories.map((c) => ({ value: c.id, label: c.label })), form.category,
    (v) => { form.category = v; drawCats(); },
  ));
  const daySlot = h('div');
  const drawDays = () => daySlot.replaceChildren(chips(
    DAY_SHORT.map((d, i) => ({ value: i + 1, label: d })), form.days,
    (v) => {
      form.days = form.days.includes(v) ? form.days.filter((x) => x !== v) : [...form.days, v].sort();
      drawDays();
    },
    { multi: true },
  ));
  drawCats();
  drawDays();

  const trackOnly = h('div', { class: 'track-only' },
    field('Minimum version', min),
    field('Unlock stage', stage, 'New habits belong in the unlock system. Pick the stage where this one starts.'),
  );
  const syncTrack = () => { trackOnly.hidden = !track.checked; };
  track.addEventListener('change', syncTrack);
  syncTrack();

  function read() {
    const startText = normalizeTime(start.value);
    const startMin = startText ? parseHM(startText) : null;
    const dur = Math.round(Number(duration.value));
    if (!title.value.trim()) return fail('Give the block a name.');
    if (!form.days.length) return fail('Pick at least one day.');
    if (startMin == null) return fail('Type a start time, for example 18:15.');
    if (!(dur >= 5 && dur <= 600)) return fail('Duration must be between 5 and 600 minutes.');
    return {
      title: title.value.trim(), note: noteIn.value.trim(), category: form.category, days: [...form.days],
      start: startText, startMin: startMin < dsh * 60 ? startMin + 1440 : startMin, duration: dur,
      min: min.value.trim(), track: track.checked, stage: stage.value,
    };
  }
  function fail(message) {
    error.textContent = message;
    error.hidden = false;
    return null;
  }

  // Only the fields that really changed go into the patch, so the rest keeps following the program.
  function patchFrom(v) {
    const p = {};
    if (v.title !== inst.title) p.title = v.title;
    if (v.note !== inst.note) p.note = v.note;
    if (v.category !== inst.category) p.category = v.category;
    if (v.min !== inst.min) p.min = v.min;
    if (v.track !== inst.track) p.track = v.track;
    if (v.track && v.stage !== (inst.stage ?? 's1')) p.stage = v.stage;
    if (!sameDays(v.days, oldDays)) {
      p.days = v.days;
      p.daysFrom = null;
    }
    if (v.startMin !== inst.start || v.duration !== inst.end - inst.start) {
      p.start = v.start;
      p.end = null;
      p.duration = v.duration;
    }
    return p;
  }

  const fresh = (v) => ({
    id: store.uid('c'), title: v.title, note: v.note, category: v.category, days: v.days,
    start: v.start, duration: v.duration, min: v.min, track: v.track, stage: v.track ? v.stage : null,
  });

  async function save(scope) {
    const v = read();
    if (!v) return;
    if (isNew) {
      if (scope === 'week') await updateWeek(monday, (w) => { w.added.push(fresh(v)); });
      else await store.setLayer('blocks', layerAdd(store.layer('blocks'), fresh(v)));
    } else {
      const p = patchFrom(v);
      if (Object.keys(p).length) {
        if (scope === 'week') {
          await updateWeek(monday, (w) => {
            const i = w.added.findIndex((x) => x.id === inst.id);
            if (i >= 0) w.added[i] = { ...w.added[i], ...p };
            else w.patches[inst.id] = { ...(w.patches[inst.id] ?? {}), ...p };
          });
        } else if (weekAdded) {
          // A "this week only" block becomes part of the template.
          const block = { ...def, ...p };
          await updateWeek(monday, (w) => { w.added = w.added.filter((x) => x.id !== inst.id); }, { silent: true });
          await store.setLayer('blocks', layerAdd(store.layer('blocks'), block));
        } else {
          await store.setLayer('blocks', layerPatch(store.layer('blocks'), inst.id, p));
        }
      }
    }
    sheet.close();
    toast(scope === 'week' ? 'Saved for this week only.' : 'Weekly schedule saved. Update your phone calendar if you use calendar reminders.');
  }

  async function remove(scope) {
    if (scope === 'week') {
      await updateWeek(monday, (w) => {
        if (w.added.some((x) => x.id === inst.id)) w.added = w.added.filter((x) => x.id !== inst.id);
        else w.removed = [...new Set([...w.removed, inst.id])];
      });
    } else {
      await store.setLayer('blocks', layerRemove(store.layer('blocks'), inst.id));
    }
    sheet.close();
    toast(scope === 'week' ? 'Removed for this week.' : 'Removed from the template.', scope === 'week' ? {} : {
      action: {
        label: 'Undo',
        run: () => {
          const layer = store.layer('blocks') ?? {};
          store.setLayer('blocks', { ...layer, removed: (layer.removed ?? []).filter((x) => x !== inst.id), added: def.custom ? [...(layer.added ?? []), def] : layer.added ?? [] });
        },
      },
    });
  }

  const saveFooter = () => [
    isNew ? null : h('button', { class: 'btn btn-quiet', type: 'button', 'aria-label': 'Delete this activity', onclick: () => sheet.setFooter(deleteFooter()) }, icon('trash', 18), 'Delete'),
    h('button', { class: 'btn btn-quiet btn-grow', type: 'button', onclick: () => save('week') }, 'This week only'),
    h('button', { class: 'btn btn-solid btn-grow', type: 'button', onclick: () => save('template') }, 'Every week'),
  ];
  const deleteFooter = () => [
    h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => sheet.setFooter(saveFooter()) }, 'Cancel'),
    h('button', { class: 'btn btn-danger btn-grow', type: 'button', onclick: () => remove('week') }, 'Delete this week'),
    weekAdded ? null : h('button', { class: 'btn btn-danger btn-grow', type: 'button', onclick: () => remove('template') }, 'Delete every week'),
  ];

  const sheet = openSheet({
    eyebrow: isNew ? `Week of ${fmtDate(monday, 'day')}` : `${fmtDate(date, 'short')} · ${fmtHM(inst.start)} to ${fmtHM(inst.end)}`,
    title: isNew ? 'Add activity' : 'Edit activity',
    body: [
      !isNew && inst.locked
        ? h('p', { class: 'form-hint' }, `Locked. It unlocks on ${fmtDate(inst.unlockDate, 'long')} if the active items hold at 80%.`)
        : null,
      field('Name', title),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Category'), catSlot),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Days'), daySlot),
      h('div', { class: 'field-row' }, field('Start', start), field('Minutes', duration)),
      followsSettings ? h('p', { class: 'form-hint' }, 'This time follows Settings. If you change it here, it stops following Settings.') : null,
      field('Note', noteIn),
      h('details', { class: 'simple-panel' }, h('summary', {}, 'Optional habit settings'), h('label', { class: 'check-row' }, track, h('span', {}, 'Include this activity in my daily progress')),
      trackOnly),
      error,
    ],
    footer: saveFooter(),
  });
}
