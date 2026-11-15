// Body: this week's training, the weight chart, the targets, the training log,
// and the strength session screen (#/body/strength/a).

import { h, cx } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet, toast } from '../ui/sheet.js';
import { pageHead, section, seg, note, field, chips, empty } from '../ui/parts.js';
import { chart, timeChart } from '../ui/charts.js';
import { store } from '../store.js';
import * as clock from '../clock.js';
import { navigate } from '../router.js';
import { markKept, setStatus } from '../actions.js';
import { appDate, addDays, weekDates, fmtDate, isISO, diffDays } from '../core/dates.js';
import { blocksForDate } from '../core/schedule.js';
import { isKept } from '../core/adherence.js';
import { lockInfo } from '../core/unlock.js';
import { averageSeries } from '../core/nutrition.js';
import { lastPerformance, currentVariation, availableVariations, progression, targetText } from '../core/strength.js';
import { targetsCard, adjustmentCard, trendSummary } from './shared.js';

const LOG_TITLES = { muaythai: 'Muay Thai', strength: 'Strength', run: 'Easy run', football: 'Football', drill: 'Ball mastery drill' };
const FEELS = ['Heavy legs', 'OK', 'Good', 'Great'];

// Kept while the app is open.
let weightRange = 'w12';
let showAllLogs = false;

const todayISO = (ctx) => appDate(clock.now(), ctx.program.dayStartHour);

// The key of an unlocked block on a date (null when the block is not there that day).
function blockKeyOn(ctx, date, blockId) {
  return blocksForDate(ctx, date).find((b) => b.id === blockId && !b.locked)?.key ?? null;
}

// How a block did this week: { due, kept, locked: unlockDate | null }.
function blockWeek(ctx, dates, blockId) {
  const out = { due: 0, kept: 0, locked: null, present: false };
  for (const d of dates) {
    const b = blocksForDate(ctx, d).find((x) => x.id === blockId);
    if (!b) continue;
    out.present = true;
    if (b.locked) {
      out.locked = b.unlockDate;
      continue;
    }
    out.due += 1;
    if (isKept(store.day(d).items[b.key]?.s)) out.kept += 1;
  }
  return out;
}

export function body(root, route) {
  const [sub, a, b] = route.params;
  if (sub === 'strength' && a) return strengthSession(root, a, isISO(b) ? b : null);

  const ctx = store.ctx();
  const today = todayISO(ctx);
  const dates = weekDates(today);
  const training = store.state.data.training;
  const logTypes = store.list('training', 'logs');

  root.append(pageHead({ eyebrow: 'Mind and Body', title: 'Body', thin: 'training and weight' }));

  // ---- this week ------------------------------------------------------------

  const rows = [];
  const row = ({ title, meta, locked, action }) => h('div', { class: cx('trow', locked && 'is-locked') },
    h('div', { class: 'trow-main' },
      h('span', { class: 'trow-title' }, title),
      h('span', { class: 'trow-meta' }, locked ? [icon('lock', 13), ` Unlocks ${fmtDate(locked, 'day')}`] : meta),
    ),
    action,
  );

  const mt = blockWeek(ctx, dates, 'muaythai');
  rows.push(row({
    title: 'Muay Thai',
    meta: `${mt.kept} of ${mt.due} sessions`,
    locked: mt.due ? null : mt.locked,
    action: h('button', { class: 'btn btn-small', type: 'button', onclick: () => openLog(ctx, 'muaythai') }, 'Log'),
  }));
  for (const sess of store.list('training', 'sessions')) {
    const w = blockWeek(ctx, dates, sess.block);
    rows.push(row({
      title: sess.title,
      meta: w.kept ? 'Done this week' : 'Not done yet',
      locked: w.due ? null : w.locked,
      action: h('a', { class: cx('btn btn-small', !w.due && 'btn-quiet'), href: `#/body/strength/${sess.id}` }, w.due ? 'Start' : 'Preview'),
    }));
  }
  const run = blockWeek(ctx, dates, 'run');
  rows.push(row({
    title: 'Easy run',
    meta: run.kept ? 'Done this week' : 'Not done yet',
    locked: run.due ? null : run.locked,
    action: h('button', { class: cx('btn btn-small', !run.due && 'btn-quiet'), type: 'button', onclick: () => openLog(ctx, 'run') }, 'Log'),
  }));
  const inWeek = (type) => store.records(type).filter((r) => r.date >= dates[0] && r.date <= dates[6]).length;
  const games = inWeek('football');
  rows.push(row({
    title: 'Football',
    meta: games ? `${games} ${games === 1 ? 'game' : 'games'} this week` : 'Whenever friends play',
    action: h('button', { class: 'btn btn-small', type: 'button', onclick: () => openLog(ctx, 'football') }, 'Log'),
  }));
  const drill = logTypes.find((l) => l.id === 'drill');
  if (drill) {
    const lock = lockInfo(ctx.stages, drill.stage, today);
    rows.push(row({
      title: drill.title,
      meta: `${inWeek('drill')} of 2 this week, optional`,
      locked: lock.locked ? lock.unlockDate : null,
      action: h('button', { class: cx('btn btn-small', lock.locked && 'btn-quiet'), type: 'button', onclick: () => openLog(ctx, 'drill') }, 'Log'),
    }));
  }

  // ---- weight ---------------------------------------------------------------

  const weights = store.weights();
  const span = weightRange === 'w4' ? 27 : weightRange === 'w12' ? 83 : Math.max(27, weights.length ? diffDays(weights[0].date, today) : 27);
  // Do not leave the chart half empty: start at the first weigh-in when the history is shorter than the range.
  const first = weights[0]?.date;
  const earliest = addDays(today, -span);
  const from = first && first > earliest ? (first < addDays(today, -13) ? first : addDays(today, -13)) : earliest;
  const dots = weights.filter((w) => w.date >= from && w.date <= today).map((w) => ({ date: w.date, v: w.kg }));
  const avg = averageSeries(weights, from, today).map((p) => ({ date: p.date, v: p.avg }));
  const formula = store.state.data.nutrition.formula;
  const pace = ctx.settings.profile.goal === 'leanBulk' && avg.length
    ? [avg[0], { date: today, v: avg[0].v + (formula.adjust.targetPerWeek * diffDays(avg[0].date, today)) / 7 }]
    : [];
  const trend = trendSummary(today);
  const todayWeight = store.day(today).weight;
  const weightIn = h('input', { class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'kg', value: todayWeight ?? '', 'aria-label': "Today's weight in kg" });
  const saveToday = () => {
    const v = Number(weightIn.value.replace(',', '.'));
    if (!(v >= 30 && v <= 250)) {
      toast('Enter a weight in kg, for example 70.5');
      return;
    }
    store.updateDay(today, (d) => { d.weight = Math.round(v * 10) / 10; });
    toast('Weigh-in saved.');
  };

  const weightSec = section({ no: '03', title: 'Weight', meta: 'Decisions use the average only' },
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, '7 day average'), h('b', {}, trend.avgText)),
      h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, 'Last two weeks'), h('b', {}, trend.rateText)),
    ),
    chart((w, hgt) => timeChart(w, hgt, {
      from, to: today, dots,
      lines: [
        { data: pace, dashed: true, color: 'var(--ink-3)', width: 1.3 },
        { data: avg, color: 'var(--body)', width: 2.4 },
      ],
      emptyText: 'Weigh in to start the chart',
    }), { height: 220 }),
    h('div', { class: 'chart-foot' },
      h('div', { class: 'chart-legend' },
        h('span', {}, h('i', { class: 'lg-dot' }), 'Daily'),
        h('span', {}, h('i', { class: 'lg-line' }), '7 day average'),
        pace.length ? h('span', {}, h('i', { class: 'lg-dash' }), `+${formula.adjust.targetPerWeek} kg per week`) : null,
      ),
      seg([{ value: 'w4', label: '4 w' }, { value: 'w12', label: '12 w' }, { value: 'all', label: 'All' }], weightRange, (v) => {
        if (v) weightRange = v;
        navigate('body');
      }, { label: 'Chart range' }),
    ),
    h('div', { class: 'inline-form' },
      h('label', { class: 'field-label', for: 'body-weight' }, 'This morning'),
      Object.assign(weightIn, { id: 'body-weight' }),
      h('button', { class: 'btn', type: 'button', onclick: saveToday }, 'Save'),
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => openWeighIns(today) }, 'All'),
    ),
    h('p', { class: 'form-hint' }, 'In the morning, after the toilet, before eating. At least 4 days a week.'),
  );

  // ---- targets --------------------------------------------------------------

  const targetsSec = section({ no: '04', title: 'Targets' }, targetsCard(ctx, today), adjustmentCard(ctx, today));

  // ---- log ------------------------------------------------------------------

  const logs = Object.keys(LOG_TITLES).flatMap((t) => store.records(t))
    .sort((x, y) => y.date.localeCompare(x.date) || (y.createdAt ?? '').localeCompare(x.createdAt ?? ''));
  const shown = showAllLogs ? logs : logs.slice(0, 8);
  const sessions = Object.fromEntries(training.sessions.map((s) => [s.id, s]));
  const detail = (r) => {
    if (r.type === 'muaythai') return [`Intensity ${r.intensity ?? '–'}/10`, r.note].filter(Boolean).join(' · ');
    if (r.type === 'strength') {
      if (r.minimum) return 'Minimum version';
      const first = r.exercises?.find((e) => e.sets?.some((v) => v > 0));
      return first ? `${first.variation}: ${first.sets.filter((v) => v > 0).join(', ')}` : '';
    }
    return [r.minutes ? `${r.minutes} min` : null, r.km ? `${r.km} km` : null, r.feel, r.note].filter(Boolean).join(' · ');
  };
  const logSec = section({ no: '02', title: 'Training log', meta: logs.length ? `${logs.length} entries` : null },
    logs.length
      ? h('div', { class: 'loglist' }, shown.map((r) => h('button', {
        class: 'logrow', type: 'button',
        onclick: () => (r.type === 'strength' ? navigate(`body/strength/${r.session}/${r.date}`) : openLog(ctx, r.type, r)),
      },
      h('span', { class: 'logrow-date' }, fmtDate(r.date, 'short')),
      h('span', { class: 'logrow-main' },
        h('b', {}, r.type === 'strength' ? sessions[r.session]?.title ?? 'Strength' : LOG_TITLES[r.type]),
        h('small', {}, detail(r)),
      ),
      icon('right', 16),
      )))
      : empty('Nothing logged yet. Log a session above, or tick a training block on Today.'),
    logs.length > 8
      ? h('button', { class: 'btn-text', type: 'button', onclick: () => { showAllLogs = !showAllLogs; navigate('body'); } }, showAllLogs ? 'Show fewer' : `Show all ${logs.length}`)
      : null,
  );

  root.append(h('div', { class: 'two-col' },
    h('div', { class: 'col' }, section({ no: '01', title: 'This week', meta: fmtDate(dates[0], 'day') + ' to ' + fmtDate(dates[6], 'day') }, h('div', { class: 'trows' }, rows)), logSec),
    h('div', { class: 'col' }, weightSec, targetsSec),
  ));

  // Opened from Today: #/body/log/muaythai
  if (sub === 'log' && LOG_TITLES[a]) {
    history.replaceState(null, '', '#/body');
    openLog(ctx, a);
  }
  return undefined;
}

// ---- weigh-ins sheet -----------------------------------------------------------

function openWeighIns(today) {
  const date = h('input', { class: 'input', type: 'date', value: today, max: today });
  const kg = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'kg', 'aria-label': 'Weight in kg' });
  const list = h('div', { class: 'loglist' });
  const draw = () => {
    const all = store.weights().reverse();
    list.replaceChildren(...(all.length
      ? all.map((w) => h('div', { class: 'logrow is-static' },
        h('span', { class: 'logrow-date' }, fmtDate(w.date, 'short')),
        h('span', { class: 'logrow-main' }, h('b', {}, `${w.kg.toFixed(1)} kg`)),
        h('button', {
          class: 'icon-btn', type: 'button', 'aria-label': `Delete the weigh-in of ${fmtDate(w.date, 'long')}`,
          onclick: async () => {
            await store.updateDay(w.date, (d) => { delete d.weight; });
            draw();
          },
        }, icon('trash', 18)),
      ))
      : [empty('No weigh-in yet.')]));
  };
  draw();
  openSheet({
    eyebrow: 'Body',
    title: 'Weigh-ins',
    body: [
      h('div', { class: 'field-row' }, field('Date', date), field('Weight', kg)),
      h('button', {
        class: 'btn btn-block', type: 'button', style: { marginTop: '14px' },
        onclick: async () => {
          const v = Number(kg.value.replace(',', '.'));
          if (!date.value || !(v >= 30 && v <= 250)) {
            toast('Enter a date and a weight in kg.');
            return;
          }
          await store.updateDay(date.value, (d) => { d.weight = Math.round(v * 10) / 10; });
          kg.value = '';
          draw();
        },
      }, 'Add or replace'),
      h('div', { class: 'sheet-gap' }),
      list,
    ],
  });
}

// ---- log sheets (Muay Thai, run, football, drill) --------------------------------

function openLog(ctx, type, existing) {
  const today = todayISO(ctx);
  const def = store.list('training', 'logs').find((l) => l.id === type) ?? { id: type };
  const date = h('input', { class: 'input', type: 'date', value: existing?.date ?? today, max: today });
  const noteIn = h('textarea', { class: 'input', rows: 3, maxlength: 600, value: existing?.note ?? '' });
  const state = { intensity: existing?.intensity ?? null, feel: existing?.feel ?? null };
  const minutes = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, max: 600, value: existing?.minutes ?? (type === 'run' ? 30 : type === 'football' ? 90 : 10) });
  const km = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'Optional', value: existing?.km ?? '' });

  const slot = h('div');
  const drawChoice = () => {
    if (type === 'muaythai') {
      slot.replaceChildren(h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'Intensity, 1 to 10'),
        h('div', { class: 'chips-tight' }, chips(
          Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) })), state.intensity,
          (v) => { state.intensity = v; drawChoice(); },
        )),
      ));
    } else if (type === 'football') {
      slot.replaceChildren(h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'How I felt'),
        chips(FEELS.map((f) => ({ value: f, label: f })), state.feel, (v) => { state.feel = v; drawChoice(); }),
      ));
    }
  };
  drawChoice();

  const fields = [field('Date', date)];
  if (type === 'muaythai') fields.push(slot, field('Technique note: what I learned', noteIn));
  if (type === 'run') fields.push(h('div', { class: 'field-row' }, field('Minutes', minutes), field('Distance, km', km)), field('How it felt', noteIn));
  if (type === 'football') fields.push(field('Minutes', minutes), slot, field('Note', noteIn));
  if (type === 'drill') fields.push(field('Minutes', minutes), field('What I worked on', noteIn));

  async function save() {
    if (!date.value) return;
    const rec = { ...(existing ?? {}), type, date: date.value, note: noteIn.value.trim() };
    if (type === 'muaythai') rec.intensity = state.intensity;
    else rec.minutes = Math.max(1, Math.round(Number(minutes.value) || 0));
    if (type === 'run') rec.km = Number(String(km.value).replace(',', '.')) || null;
    if (type === 'football') rec.feel = state.feel;
    await store.putRecord(rec);
    const key = def.block ? blockKeyOn(ctx, rec.date, def.block) : null;
    if (key) await markKept(rec.date, key);
    sheet.close();
    toast(`${LOG_TITLES[type]} saved.`);
  }

  const sheet = openSheet({
    eyebrow: def.about ?? 'Training log',
    title: LOG_TITLES[type],
    body: fields,
    footer: [
      existing
        ? h('button', {
          class: 'btn btn-quiet btn-icon', type: 'button', 'aria-label': 'Delete this entry',
          onclick: async () => {
            await store.deleteRecord(existing.id);
            sheet.close();
            toast('Entry deleted.');
          },
        }, icon('trash', 18))
        : null,
      h('button', { class: 'btn btn-solid btn-grow', type: 'button', onclick: save }, 'Save'),
    ],
  });
}

// ---- strength session screen -----------------------------------------------------

function strengthSession(root, sessionId, dateParam) {
  const ctx = store.ctx();
  const today = todayISO(ctx);
  const date = dateParam ?? today;
  const training = store.state.data.training;
  const session = store.list('training', 'sessions').find((s) => s.id === sessionId);
  if (!session) {
    root.append(pageHead({ title: 'Strength' }), empty('This session does not exist.'));
    return undefined;
  }
  const records = store.records('strength');
  const existing = records.find((r) => r.session === sessionId && r.date === date) ?? null;
  const blockKey = blockKeyOn(ctx, date, session.block);

  const state = session.exercises.map((ex) => {
    const last = lastPerformance(records, sessionId, ex.id, date);
    const prev = existing?.exercises?.find((e) => e.id === ex.id);
    return {
      ex,
      last,
      variation: prev?.variation ?? currentVariation(ex, last, ctx.settings),
      sets: Array.from({ length: ex.sets }, (_, i) => prev?.sets?.[i] || null),
    };
  });

  root.append(pageHead({
    eyebrow: `${fmtDate(date, 'short')} · ${session.about}`,
    title: session.title,
    below: h('div', { class: 'daynav' }, h('a', { class: 'nav-link', href: '#/body' }, icon('left', 16), 'Body')),
  }));

  if (!blockKey) {
    root.append(note({ text: date === today ? 'This session is not on today’s unlocked plan. You can still log it; it will not change your adherence.' : `No unlocked ${session.title} block on ${fmtDate(date, 'long')}.` }));
  }

  const cards = h('div', { class: 'exs' });
  const drawCard = (st, index) => {
    const { ex, last } = st;
    const usable = availableVariations(ex, ctx.settings);
    const tip = last ? progression(ex, last.variation, last.sets, ctx.settings) : null;
    const unit = ex.unit === 's' ? ' s' : '';
    const inputs = st.sets.map((v, i) => h('input', {
      class: 'set-input', type: 'number', inputmode: 'numeric', min: 0, max: 999,
      placeholder: last?.sets?.[i] ? String(last.sets[i]) : '–',
      value: v ?? '', 'aria-label': `${ex.name}, set ${i + 1}`,
      oninput: (e) => { st.sets[i] = Number(e.target.value) > 0 ? Math.round(Number(e.target.value)) : null; },
    }));
    return h('section', { class: 'ex' },
      h('div', { class: 'ex-head' },
        h('span', { class: 'sec-no' }, String(index + 1).padStart(2, '0')),
        h('h2', { class: 'ex-name' }, st.variation ?? ex.name),
        h('span', { class: 'ex-target' }, targetText(ex)),
      ),
      usable.length > 1
        ? chips(usable.map((v) => ({ value: v, label: v })), st.variation, (v) => { st.variation = v; redraw(); })
        : null,
      ex.needsBar && !ctx.settings.pullUpBar ? h('p', { class: 'form-hint' }, 'Pull ups need a bar. Turn it on in Settings when you have one.') : null,
      tip
        ? h('div', { class: 'ex-tip' },
          h('p', {}, tip.kind === 'variation'
            ? `Last time you hit ${ex.range[1]}${unit} on every set. Time for the harder version: ${tip.next}.`
            : training.harderHint),
          tip.kind === 'variation' && st.variation !== tip.next
            ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => { st.variation = tip.next; redraw(); } }, `Switch to ${tip.next}`)
            : null,
        )
        : null,
      h('div', { class: 'ex-last' },
        last
          ? [h('span', {}, `Last time, ${fmtDate(last.date, 'day')}: `, h('b', {}, last.sets.filter((v) => v > 0).join(' · ') + unit), last.variation !== st.variation ? ` (${last.variation})` : ''),
            h('button', { class: 'btn-text', type: 'button', onclick: () => { st.sets = Array.from({ length: ex.sets }, (_, i) => last.sets[i] || null); redraw(); } }, 'Same again')]
          : h('span', {}, 'First time: nothing to compare with yet.'),
      ),
      h('div', { class: 'sets' }, inputs.map((input, i) => h('label', { class: 'set' }, h('span', {}, `Set ${i + 1}`), input))),
    );
  };
  const redraw = () => cards.replaceChildren(...state.map(drawCard));
  redraw();

  async function save(minimum) {
    const exercises = state.map((st) => ({ id: st.ex.id, variation: st.variation, sets: st.sets.map((v) => v ?? 0) }));
    if (!minimum && !exercises.some((e) => e.sets.some((v) => v > 0))) {
      toast('Enter at least one set, or use the minimum version.');
      return;
    }
    await store.putRecord({ ...(existing ?? {}), type: 'strength', date, session: sessionId, minimum, exercises: minimum ? [] : exercises });
    if (blockKey) await setStatus(date, blockKey, minimum ? 'min' : 'done', { auto: true });
    toast(minimum ? 'Minimum logged. It counts.' : 'Session saved.');
    navigate('body');
  }

  root.append(
    cards,
    h('div', { class: 'ex-actions' },
      h('button', { class: 'btn btn-solid btn-block', type: 'button', onclick: () => save(false) }, existing ? 'Save changes' : 'Save session'),
      h('button', { class: 'btn btn-quiet btn-block', type: 'button', onclick: () => save(true) }, `Minimum done: ${session.min}`),
      existing
        ? h('button', {
          class: 'btn-text', type: 'button',
          onclick: async () => {
            await store.deleteRecord(existing.id);
            toast('Session deleted.');
            navigate('body');
          },
        }, 'Delete this session')
        : null,
    ),
  );
  return undefined;
}
