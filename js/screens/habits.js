// Habits: adherence (7 and 30 days), the unlock stages, never miss twice,
// and every do and don't with its minimum version. All of them can be edited.

import { h, cx } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { confirmSheet, toast } from '../ui/sheet.js';
import { pageHead, section, note, bar, empty, pct } from '../ui/parts.js';
import { recordSheet } from '../ui/form.js';
import { store } from '../store.js';
import * as clock from '../clock.js';
import { layerPatch, layerAdd, layerRemove } from '../program.js';
import { appDate, addDays, fmtDate } from '../core/dates.js';
import { lockInfo, nextLockedStage } from '../core/unlock.js';
import { adherenceLast, missedTwice, streak, dontStats } from '../core/adherence.js';
import { gateAdherence, forceStage, relockStage, FORCE_WARNING } from '../unlockFlow.js';

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

// The tracked items that prove a habit: its own tick, or the timeline blocks it points to.
const filterFor = (hb) => (hb.daily ? (it) => it.id === `h:${hb.id}` : (it) => (hb.blocks ?? []).includes(it.id));

export function habits(root) {
  const ctx = store.ctx();
  const today = appDate(clock.now(), ctx.program.dayStartHour);
  const getDay = store.getDay;
  const cfg = ctx.program.unlock;
  const started = today >= ctx.program.startDate;
  const a7 = adherenceLast(ctx, getDay, today, 7);
  const a30 = adherenceLast(ctx, getDay, today, 30);
  const gate = gateAdherence(ctx, today);
  const stageOptions = ctx.program.stages.map((st) => ({ value: st.id, label: `Stage ${st.n}` }));
  const stageHint = 'New habits belong in the unlock system: pick the stage where this one starts.';
  const nextStage = nextLockedStage(ctx.stages);

  root.append(pageHead({ eyebrow: 'Mind and Body', title: 'Habits', thin: 'do and don’t' }));

  const big = (label, value, sub) => h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, label), h('b', { class: 'stat-big' }, pct(value)), h('small', {}, sub));
  root.append(h('div', { class: 'stat-row is-three' },
    big('Last 7 days', a7.pct, a7.due ? `${a7.kept} of ${a7.due} kept` : 'Nothing due yet'),
    big('Last 30 days', a30.pct, a30.due ? `${a30.kept} of ${a30.due} kept` : 'Nothing due yet'),
    big(`Last ${cfg.windowDays} days`, gate.pct, `Unlock gate: ${pct(cfg.threshold)}`),
  ));
  if (!started) root.append(note({ tone: 'mind', text: `Nothing counts before ${fmtDate(ctx.program.startDate, 'long')}. Missing once is neutral. Doing the minimum counts as kept.` }));

  // ---- unlock stages ----------------------------------------------------------

  const stageRow = (st) => {
    const info = ctx.stages[st.id];
    const isNext = nextStage?.id === st.id;
    const state = info.active
      ? (today >= info.activatedOn ? `Active since ${fmtDate(info.activatedOn, 'day')}${info.forced ? ', forced' : ''}` : `Starts ${fmtDate(info.activatedOn, 'day')}`)
      : isNext ? `Next check: ${fmtDate(info.due, 'long')}` : `Not before ${fmtDate(info.due, 'day')}`;
    const lastCheck = info.checks?.[info.checks.length - 1];
    return h('div', { class: cx('stage', info.active && 'is-active', isNext && 'is-next') },
      h('div', { class: 'stage-no' }, String(st.n)),
      h('div', { class: 'stage-main' },
        h('b', {}, st.weeks),
        h('span', { class: 'stage-state' }, info.active ? null : icon('lock', 13), state),
        h('p', {}, st.summary),
        isNext
          ? [
            bar(Math.min(1, (gate.pct ?? 0) / cfg.threshold), (gate.pct ?? 0) >= cfg.threshold ? 'var(--c-food)' : 'var(--body)'),
            h('p', { class: 'stage-gate' }, `Adherence on the active items, last ${cfg.windowDays} days: ${pct(gate.pct)}. It unlocks at ${pct(cfg.threshold)}.`,
              lastCheck && !lastCheck.pass ? ` Last check, ${fmtDate(lastCheck.date, 'day')}: ${pct(lastCheck.pct)}. Not yet, consolidate first.` : ''),
            h('button', {
              class: 'btn-text', type: 'button',
              onclick: async () => {
                const yes = await confirmSheet({
                  title: `Force stage ${st.n}?`,
                  message: `${FORCE_WARNING} Your adherence is ${pct(gate.pct)}, the rule asks for ${pct(cfg.threshold)}.`,
                  confirm: 'Unlock anyway', cancel: 'Wait', danger: true,
                });
                if (yes) {
                  await forceStage(st.id);
                  toast(`Stage ${st.n} is unlocked.`);
                }
              },
            }, 'Unlock now, against the rule'),
          ]
          : null,
        info.active && info.forced
          ? h('button', { class: 'btn-text', type: 'button', onclick: () => relockStage(st.id) }, 'Lock it again')
          : null,
      ),
    );
  };
  const unlockSec = section({ no: '01', title: 'Unlock stages', meta: nextStage ? `Next: stage ${nextStage.n}` : 'Everything is unlocked' },
    h('div', { class: 'stages' }, ctx.program.stages.map(stageRow)),
  );

  // ---- never miss twice -------------------------------------------------------

  const twice = started ? missedTwice(ctx, getDay, today) : [];
  const twiceSec = section({ no: '02', title: 'Never miss twice', meta: twice.length ? `${twice.length} to watch` : null },
    twice.length
      ? h('div', { class: 'habs' }, twice.map((m) => h('div', { class: 'hab' },
        h('div', { class: 'hab-main' },
          h('span', { class: 'hab-title' }, m.title),
          h('span', { class: 'blk-min' }, m.min ? `Minimum: ${m.min}` : 'Do a small version next time.'),
        ),
        h('a', { class: 'btn btn-small', href: '#/today' }, 'Today'),
      )))
      : empty('Nothing was missed two times in a row. Missing once is neutral.'),
  );

  // ---- do ---------------------------------------------------------------------

  const editDo = (hb) => recordSheet({
    type: 'do', persist: false, eyebrow: 'Do', title: hb ? 'Edit habit' : 'New habit', existing: hb,
    defaults: { stage: nextStage?.id ?? 's1', every: 'day' },
    fields: [
      { key: 'title', label: 'Habit', kind: 'text', required: true },
      { key: 'detail', label: 'Detail', kind: 'text', placeholder: 'Optional' },
      { key: 'min', label: 'Minimum version', kind: 'text', required: true, placeholder: 'The tiny version for a bad day' },
      { key: 'stage', label: 'Starts with', kind: 'chips', options: stageOptions, required: true, hint: stageHint },
      ...(hb ? [] : [{ key: 'every', label: 'When', kind: 'chips', required: true, options: [{ value: 'day', label: 'Every day' }, { value: 'work', label: 'Workdays' }] }]),
    ],
    savedText: hb ? 'Habit changed.' : 'Habit added.',
    onSave: (v) => (hb
      ? store.setLayer('dos', layerPatch(store.layer('dos'), hb.id, { title: v.title, detail: v.detail, min: v.min, stage: v.stage }))
      : store.setLayer('dos', layerAdd(store.layer('dos'), {
        id: store.uid('do'), title: v.title, detail: v.detail, min: v.min, stage: v.stage, daily: true, days: v.every === 'work' ? 'work' : EVERY_DAY,
      }))),
    onDelete: hb && !hb.optional ? () => store.setLayer('dos', layerRemove(store.layer('dos'), hb.id)) : null,
  });

  const doRow = (hb) => {
    const lock = lockInfo(ctx.stages, hb.stage, today);
    const f = filterFor(hb);
    const d7 = adherenceLast(ctx, getDay, today, 7, f);
    const d30 = adherenceLast(ctx, getDay, today, 30, f);
    const run = lock.locked ? 0 : streak(ctx, getDay, today, f);
    return h('button', { class: cx('hrow', lock.locked && 'is-locked'), type: 'button', onclick: () => (hb.optional ? null : editDo(hb)) },
      h('span', { class: 'hrow-main' },
        h('b', {}, hb.title),
        hb.detail ? h('small', {}, hb.detail) : null,
        h('small', { class: 'hrow-min' }, `Minimum: ${hb.min ?? 'not set'}`),
      ),
      lock.locked
        ? h('span', { class: 'hrow-lock' }, icon('lock', 13), fmtDate(lock.unlockDate, 'day'))
        : h('span', { class: 'hrow-nums' },
          h('span', {}, h('b', {}, pct(d7.pct)), h('small', {}, '7 d')),
          h('span', {}, h('b', {}, pct(d30.pct)), h('small', {}, '30 d')),
          h('span', {}, h('b', {}, String(run)), h('small', {}, 'streak')),
        ),
    );
  };
  const doSec = section({ no: '03', title: 'Do', meta: `${ctx.habits.dos.length} rules` },
    h('div', { class: 'hrows' }, ctx.habits.dos.map(doRow)),
    h('div', { class: 'focus-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => editDo(null) }, icon('plus', 16), 'Habit'),
      h('span', { class: 'form-hint' }, 'Streaks forgive one miss a week.'),
    ),
  );

  // ---- don't ------------------------------------------------------------------

  const editDont = (dn) => recordSheet({
    type: 'dont', persist: false, eyebrow: "Don't", title: dn ? "Edit don't" : "New don't", existing: dn,
    defaults: { stage: nextStage?.id ?? 's1', weeklyAllowance: 0 },
    fields: [
      { key: 'title', label: 'What to avoid', kind: 'text', required: true },
      { key: 'detail', label: 'Detail', kind: 'text', placeholder: 'Optional' },
      { key: 'weeklyAllowance', label: 'Slips per week that are still fine', kind: 'number', min: 0, max: 7, step: 1 },
      { key: 'stage', label: 'Starts with', kind: 'chips', options: stageOptions, required: true, hint: stageHint },
    ],
    savedText: dn ? "Don't changed." : "Don't added.",
    onSave: (v) => {
      const patch = { title: v.title, detail: v.detail, stage: v.stage, weeklyAllowance: Number(v.weeklyAllowance) || 0 };
      return dn
        ? store.setLayer('donts', layerPatch(store.layer('donts'), dn.id, patch))
        : store.setLayer('donts', layerAdd(store.layer('donts'), { id: store.uid('dont'), days: EVERY_DAY, ...patch }));
    },
    onDelete: dn ? () => store.setLayer('donts', layerRemove(store.layer('donts'), dn.id)) : null,
  });

  const dontRow = (dn) => {
    const lock = lockInfo(ctx.stages, dn.stage, today);
    const s7 = dontStats(getDay, dn.id, addDays(today, -7), addDays(today, -1), dn.weeklyAllowance ?? 0);
    const s30 = dontStats(getDay, dn.id, addDays(today, -30), addDays(today, -1), dn.weeklyAllowance ?? 0);
    return h('button', { class: cx('hrow', lock.locked && 'is-locked'), type: 'button', onclick: () => editDont(dn) },
      h('span', { class: 'hrow-main' },
        h('b', {}, dn.title),
        dn.detail ? h('small', {}, dn.detail) : null,
        dn.system ? h('small', { class: 'hrow-min' }, 'The app watches this one itself.') : null,
      ),
      lock.locked
        ? h('span', { class: 'hrow-lock' }, icon('lock', 13), fmtDate(lock.unlockDate, 'day'))
        : dn.system
          ? h('span', { class: 'hrow-lock' }, 'Rule')
          : h('span', { class: 'hrow-nums' },
            h('span', {}, h('b', {}, pct(s7.pct)), h('small', {}, '7 d')),
            h('span', {}, h('b', {}, pct(s30.pct)), h('small', {}, '30 d')),
            h('span', {}, h('b', {}, String(s30.asked)), h('small', {}, 'asked')),
          ),
    );
  };
  const dontSec = section({ no: '04', title: "Don't", meta: `${ctx.habits.donts.length} rules` },
    h('div', { class: 'hrows' }, ctx.habits.donts.map(dontRow)),
    h('div', { class: 'focus-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => editDont(null) }, icon('plus', 16), "Don't"),
      h('span', { class: 'form-hint' }, 'Percent avoided, on the evenings it was asked.'),
    ),
  );

  root.append(h('div', { class: 'two-col' },
    h('div', { class: 'col' }, unlockSec, twiceSec),
    h('div', { class: 'col' }, doSec, dontSec),
  ));
}
