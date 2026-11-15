// Review: the Sunday weekly review as a short guided flow, the monthly review with
// trend charts, and the phase review.

import { h, cx } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/sheet.js';
import { pageHead, section, note, bar, empty, pct, field } from '../ui/parts.js';
import { chart, barChart, timeChart } from '../ui/charts.js';
import { recordRow } from '../ui/form.js';
import { store } from '../store.js';
import * as clock from '../clock.js';
import { navigate } from '../router.js';
import { markKept } from '../actions.js';
import { downloadBackup } from '../backupFlow.js';
import { gateAdherence } from '../unlockFlow.js';
import {
  appDate, addDays, dow, mondayOf, weekDates, programWeek, fmtDate, fmtWeekRange, isISO, diffDays,
} from '../core/dates.js';
import { blocksForDate, phaseFor, phaseWindows } from '../core/schedule.js';
import { adherence } from '../core/adherence.js';
import { nextLockedStage } from '../core/unlock.js';
import { weeklyMinutes, minutesBetween, trackProgress } from '../core/learn.js';
import { average7 } from '../core/nutrition.js';
import { weekStats, weeklyAdherence, weeklyWeight, reviewWeek, keptMinutes, sessionCount } from '../core/stats.js';

const STEPS = ['The numbers', 'Three questions', 'Next week', 'Close the week'];

// The review being written. Kept while the app is open, so a redraw never loses what I typed.
let draft = null;

const hours = (minutes) => (minutes ? `${(minutes / 60).toFixed(1)} h` : '0 h');
const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
const catLabel = (ctx, id) => ctx.program.categories.find((c) => c.id === id)?.label ?? id;

export function review(root, route) {
  const [mode, arg] = route.params;
  const ctx = store.ctx();
  const today = appDate(clock.now(), ctx.program.dayStartHour);
  if (mode === 'weekly') return weekly(root, ctx, today, isISO(arg) ? mondayOf(arg) : reviewWeek(today, dow(today)));
  if (mode === 'monthly') return monthly(root, ctx, today);
  if (mode === 'phase') return phaseReview(root, ctx, today, arg);
  return home(root, ctx, today);
}

const weeklyRecord = (monday) => store.records('review').find((r) => r.kind === 'weekly' && r.week === monday) ?? null;

// ---- home -----------------------------------------------------------------------

function home(root, ctx, today) {
  const monday = reviewWeek(today, dow(today));
  const start = ctx.program.startDate;
  const done = weeklyRecord(monday);
  const n = programWeek(start, monday);
  const phase = phaseFor(ctx.program, ctx.settings, today);
  const past = store.records('review').filter((r) => r.kind === 'weekly').sort((a, b) => b.week.localeCompare(a.week));
  const lastBackup = store.kv('lastBackup');

  root.append(pageHead({ eyebrow: 'Mind and Body', title: 'Review', thin: 'look back, change one thing' }));

  const weeklyCard = h('div', { class: 'focus' },
    h('span', { class: 'eyebrow' }, n >= 1 ? `Weekly review · week ${n}` : 'Weekly review'),
    h('h2', { class: 'focus-title' }, fmtWeekRange(monday)),
    monday < mondayOf(start)
      ? h('p', { class: 'focus-meta' }, `The first review is on Sunday ${fmtDate(addDays(mondayOf(start), 6), 'dayMonth')}.`)
      : h('p', { class: 'focus-meta' }, done ? `Done on ${fmtDate(done.date, 'long')}. One change: ${done.change || 'none written'}` : 'About 20 minutes: the numbers, three questions, one change.'),
    h('div', { class: 'focus-actions' },
      h('a', { class: cx('btn btn-grow', !done && 'btn-solid'), href: `#/review/weekly/${monday}` }, done ? 'Open it again' : 'Start the review'),
    ),
  );

  const others = section({ no: '01', title: 'Bigger pictures' },
    h('div', { class: 'trows' },
      h('div', { class: 'trow' },
        h('div', { class: 'trow-main' }, h('span', { class: 'trow-title' }, 'Monthly review'), h('span', { class: 'trow-meta' }, 'Trend charts over the last 12 weeks')),
        h('a', { class: 'btn btn-small', href: '#/review/monthly' }, 'Open'),
      ),
      h('div', { class: 'trow' },
        h('div', { class: 'trow-main' },
          h('span', { class: 'trow-title' }, 'Phase review'),
          h('span', { class: 'trow-meta' }, phase ? `Phase ${phase.n}: ${phase.name}${phase.end ? `, until ${fmtDate(phase.end, 'day')}` : ''}` : 'Starts with the program'),
        ),
        h('a', { class: 'btn btn-small', href: `#/review/phase/${phase?.id ?? 'p1'}` }, 'Open'),
      ),
    ),
  );

  const backupSec = section({ no: '02', title: 'Backup', meta: lastBackup ? `Last: ${fmtDate(lastBackup.at.slice(0, 10), 'short')}` : 'Never' },
    h('p', { class: 'form-hint' }, 'Everything lives only on this device. Download a backup every Sunday and keep the file somewhere else.'),
    h('div', { class: 'focus-actions' }, h('button', {
      class: 'btn', type: 'button',
      onclick: async () => {
        await downloadBackup();
        toast('Backup downloaded.');
      },
    }, icon('download', 18), 'Download a backup')),
  );

  const pastSec = section({ no: '03', title: 'Past reviews', meta: past.length ? `${past.length}` : null },
    past.length
      ? h('div', { class: 'loglist' }, past.map((r) => recordRow({
        date: `Week ${programWeek(start, r.week)}`,
        title: r.change || 'No change written',
        detail: `${fmtWeekRange(r.week)} · ${pct(r.stats?.pct)}`,
        onclick: () => navigate(`review/weekly/${r.week}`),
      })))
      : empty('Your weekly reviews will be listed here, with the one change you chose each week.'),
  );

  root.append(h('div', { class: 'two-col' }, h('div', { class: 'col' }, weeklyCard, others), h('div', { class: 'col' }, backupSec, pastSec)));
}

// ---- weekly review: 4 steps ---------------------------------------------------------

function weekly(root, ctx, today, monday) {
  const existing = weeklyRecord(monday);
  if (!draft || draft.week !== monday) {
    draft = { week: monday, step: 0, worked: existing?.worked ?? '', didnt: existing?.didnt ?? '', change: existing?.change ?? '' };
  }
  const start = ctx.program.startDate;
  const sunday = addDays(monday, 6);
  const stats = weekStats(ctx, store.getDay, monday, {
    learnSessions: store.records('learn'), weights: store.weights(), footballGames: store.records('football'),
  });
  const go = (step) => {
    draft.step = Math.max(0, Math.min(STEPS.length - 1, step));
    navigate(`review/weekly/${monday}`);
    window.scrollTo(0, 0);
  };

  root.append(pageHead({
    eyebrow: `Weekly review · ${programWeek(start, monday) >= 1 ? `week ${programWeek(start, monday)}` : 'before the start'}`,
    title: STEPS[draft.step],
    thin: fmtWeekRange(monday),
    below: h('div', { class: 'daynav' },
      h('a', { class: 'nav-link', href: '#/review' }, icon('left', 16), 'Review'),
      h('span', { class: 'steps', 'aria-label': `Step ${draft.step + 1} of ${STEPS.length}` },
        STEPS.map((_, i) => h('i', { class: cx(i === draft.step && 'is-on', i < draft.step && 'is-done') }))),
    ),
  }));

  const body = h('div', { class: 'review-body' });
  root.append(body);

  if (draft.step === 0) {
    const a = stats.adherence;
    const cats = Object.entries(a.byCategory).sort((x, y) => y[1].due - x[1].due);
    const t = stats.training;
    const sess = (s) => (s.due ? `${s.kept} of ${s.due}` : 'not unlocked');
    body.append(
      h('div', { class: 'stat-row' },
        h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, 'Adherence'), h('b', { class: 'stat-big' }, pct(a.pct)), h('small', {}, a.due ? `${a.kept} of ${a.due} kept. Minimums count.` : 'Nothing was due')),
        h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, 'Weight average'),
          h('b', { class: 'stat-big' }, stats.weight.avg == null ? '–' : `${stats.weight.avg.toFixed(1)}`),
          h('small', {}, stats.weight.change == null ? `${stats.weight.weighIns} weigh-ins this week` : `${signed(stats.weight.change)} kg against last week`)),
      ),
      section({ no: '01', title: 'By category' },
        cats.length
          ? h('div', { class: 'catbars' }, cats.map(([id, c]) => h('div', { class: cx('catbar', `cat-${id}`) },
            h('span', { class: 'catbar-name' }, catLabel(ctx, id)),
            bar(c.pct ?? 0, 'var(--c)'),
            h('span', { class: 'catbar-num' }, `${c.kept}/${c.due}`),
          )))
          : empty('Nothing was due this week.'),
      ),
      section({ no: '02', title: 'Training, learning, PFE' },
        h('div', { class: 'facts' },
          h('div', {}, h('span', { class: 'eyebrow' }, 'Muay Thai'), h('b', {}, sess(t.muayThai))),
          h('div', {}, h('span', { class: 'eyebrow' }, 'Strength'), h('b', {}, sess(t.strength))),
          h('div', {}, h('span', { class: 'eyebrow' }, 'Run'), h('b', {}, sess(t.run))),
          h('div', {}, h('span', { class: 'eyebrow' }, 'Football'), h('b', {}, `${t.football} ${t.football === 1 ? 'game' : 'games'}`)),
          h('div', {}, h('span', { class: 'eyebrow' }, 'Learning'), h('b', {}, hours(stats.learnMinutes))),
          h('div', {}, h('span', { class: 'eyebrow' }, 'PFE'), h('b', {}, hours(stats.pfeMinutes))),
        ),
        h('p', { class: 'form-hint' }, 'Learning hours come from the sessions you logged. PFE hours come from the PFE blocks you ticked (a minimum counts 15 minutes).'),
      ),
      section({ no: '03', title: 'Why things were skipped' },
        stats.skipReasons.length
          ? h('div', { class: 'facts is-list' }, stats.skipReasons.slice(0, 5).map(([reason, count]) => h('div', {}, h('span', {}, reason), h('b', {}, `${count}`))))
          : empty('Nothing was skipped with a reason.'),
      ),
    );
  }

  if (draft.step === 1) {
    const area = (key, label, placeholder, rows = 3) => field(label, h('textarea', {
      class: 'input', rows, maxlength: 800, placeholder, value: draft[key], oninput: (e) => { draft[key] = e.target.value; },
    }));
    body.append(
      area('worked', 'What worked?', 'Keep doing this'),
      area('didnt', 'What did not work?', 'Without guilt: what got in the way'),
      field('The ONE change for next week', h('input', {
        class: 'input input-strong', type: 'text', maxlength: 140, placeholder: 'One thing. Not five.', value: draft.change,
        oninput: (e) => { draft.change = e.target.value; },
      }), 'Only one. It will be shown on Today all next week.'),
    );
  }

  if (draft.step === 2) {
    const nextMonday = addDays(monday, 7);
    const dates = weekDates(nextMonday);
    const phase = phaseFor(ctx.program, ctx.settings, nextMonday);
    const stage = nextLockedStage(ctx.stages);
    const counts = {};
    for (const d of dates) for (const b of blocksForDate(ctx, d)) if (b.track && !b.locked && b.counts) counts[b.category] = (counts[b.category] ?? 0) + 1;
    const gate = gateAdherence(ctx, today);
    body.append(
      h('div', { class: 'focus is-small' },
        h('span', { class: 'eyebrow' }, programWeek(start, nextMonday) >= 1 ? `Week ${programWeek(start, nextMonday)}${phase ? ` · ${phase.name}` : ''}` : 'Next week'),
        h('h3', { class: 'ai-theme' }, fmtWeekRange(nextMonday)),
        draft.change.trim() ? h('p', { class: 'focus-meta' }, 'The one change: ', h('b', {}, draft.change.trim())) : h('p', { class: 'focus-meta' }, 'No change written yet. Go back one step if you want one.'),
      ),
      stage && stage.due >= nextMonday && stage.due <= dates[6]
        ? note({
          tone: (gate.pct ?? 0) >= ctx.program.unlock.threshold ? 'mind' : 'warn',
          title: `Unlock check on ${fmtDate(stage.due, 'long')}`,
          text: `Stage ${stage.n}: ${stage.summary} Your adherence over the last 14 days is ${pct(gate.pct)}. It unlocks at ${pct(ctx.program.unlock.threshold)}.`,
        })
        : note({ text: stage ? `Nothing new unlocks next week. Next unlock check: ${fmtDate(stage.due, 'long')}.` : 'Everything is unlocked. Keep the template steady.' }),
      section({ no: '01', title: 'What is planned', meta: 'Tracked blocks' },
        Object.keys(counts).length
          ? h('div', { class: 'facts' }, Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([id, c]) => h('div', { class: `cat-${id}` }, h('span', { class: 'eyebrow' }, catLabel(ctx, id)), h('b', {}, String(c)))))
          : empty('No tracked block next week.'),
        h('div', { class: 'focus-actions' }, h('a', { class: 'btn btn-small', href: `#/week/${nextMonday}` }, 'Open next week')),
      ),
    );
  }

  if (draft.step === 3) {
    const lastBackup = store.kv('lastBackup');
    body.append(
      note({
        tone: 'body',
        title: 'Download a backup',
        text: lastBackup ? `Last backup: ${fmtDate(lastBackup.at.slice(0, 10), 'long')}. The data only lives on this device.` : 'No backup yet. The data only lives on this device.',
        actions: h('button', {
          class: 'btn btn-small', type: 'button',
          onclick: async () => {
            await downloadBackup();
            toast('Backup downloaded.');
          },
        }, icon('download', 16), 'Download now'),
      }),
      h('div', { class: 'facts is-list' },
        h('div', {}, h('span', {}, 'Adherence this week'), h('b', {}, pct(stats.adherence.pct))),
        h('div', {}, h('span', {}, 'The one change'), h('b', {}, draft.change.trim() || 'none')),
      ),
      h('p', { class: 'form-hint' }, 'Then plan the lunchboxes for the week (Food has the grocery list and the note for the family).'),
    );
  }

  const finish = async () => {
    await store.putRecord({
      ...(existing ?? {}), type: 'review', kind: 'weekly', week: monday, date: today,
      worked: draft.worked.trim(), didnt: draft.didnt.trim(), change: draft.change.trim(),
      stats: {
        pct: stats.adherence.pct, kept: stats.adherence.kept, due: stats.adherence.due,
        learnMinutes: stats.learnMinutes, pfeMinutes: stats.pfeMinutes, weightAvg: stats.weight.avg,
      },
    });
    const block = blocksForDate(store.ctx(), sunday).find((b) => b.id === 'review' && !b.locked);
    if (block && sunday <= today) await markKept(sunday, block.key);
    draft = null;
    toast('Review saved. See you next Sunday.');
    navigate('review');
  };

  root.append(h('div', { class: 'review-nav' },
    draft.step > 0 ? h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => go(draft.step - 1) }, 'Back') : h('span', {}),
    draft.step < STEPS.length - 1
      ? h('button', { class: 'btn btn-solid btn-grow', type: 'button', onclick: () => go(draft.step + 1) }, `Next: ${STEPS[draft.step + 1].toLowerCase()}`)
      : h('button', { class: 'btn btn-solid btn-grow', type: 'button', onclick: finish }, existing ? 'Save the review again' : 'Finish the review'),
  ));
  return undefined;
}

// ---- monthly review: trends ---------------------------------------------------------

function monthly(root, ctx, today) {
  const month = today.slice(0, 7);
  const weeks = 12;
  const adh = weeklyAdherence(ctx, store.getDay, today, weeks);
  const weight = weeklyWeight(store.weights(), today, weeks).filter((w) => w.avg != null);
  const learnWeeks = weeklyMinutes(store.records('learn'), today, weeks);
  const label = (monday) => fmtDate(monday, 'day').split(' ')[0];
  const sessions = adh.map((w) => {
    const to = addDays(w.monday, 6);
    return { monday: w.monday, n: sessionCount(ctx, store.getDay, w.monday, to, ['muaythai', 'strength-a', 'strength-b', 'run']).kept };
  });
  const record = store.records('review').find((r) => r.kind === 'monthly' && r.month === month) ?? null;
  const noteIn = h('textarea', { class: 'input', rows: 3, maxlength: 800, placeholder: 'This month in a few lines: what moved, what did not', value: record?.note ?? '' });

  root.append(
    pageHead({
      eyebrow: 'Monthly review', title: fmtDate(`${month}-01`, 'dayMonth').split(' ')[1], thin: 'the last 12 weeks',
      below: h('div', { class: 'daynav' }, h('a', { class: 'nav-link', href: '#/review' }, icon('left', 16), 'Review')),
    }),
    h('div', { class: 'two-col' },
      h('div', { class: 'col' },
        section({ no: '01', title: 'Adherence per week', meta: 'Percent kept' },
          chart((w, hgt) => barChart(w, hgt, {
            bars: adh.map((x, i) => ({ label: label(x.monday), v: Math.round((x.pct ?? 0) * 100), strong: i === adh.length - 1 })),
            goal: ctx.program.unlock.threshold * 100, color: 'var(--mind)', unit: '%',
          }), { height: 180 }),
          h('p', { class: 'form-hint' }, 'Dashed line: the 80% the unlock system asks for. The last bar is the running week.'),
        ),
        section({ no: '02', title: 'Weight', meta: '7 day average at each week end' },
          chart((w, hgt) => timeChart(w, hgt, {
            from: adh[0].monday, to: today,
            dots: weight.map((x) => ({ date: x.date, v: x.avg })),
            lines: [{ data: weight.map((x) => ({ date: x.date, v: x.avg })), color: 'var(--body)', width: 2.4 }],
            dotColor: 'var(--body)', emptyText: 'No weigh-ins yet',
          }), { height: 190 }),
        ),
      ),
      h('div', { class: 'col' },
        section({ no: '03', title: 'Learning hours per week' },
          chart((w, hgt) => barChart(w, hgt, {
            bars: learnWeeks.map((x, i) => ({ label: label(x.monday), v: x.minutes / 60, strong: i === learnWeeks.length - 1 })),
            goal: 3, color: 'var(--c-learn)', unit: ' h',
          }), { height: 170 }),
        ),
        section({ no: '04', title: 'Training sessions per week', meta: 'Muay Thai, strength, run' },
          chart((w, hgt) => barChart(w, hgt, {
            bars: sessions.map((x, i) => ({ label: label(x.monday), v: x.n, strong: i === sessions.length - 1 })),
            color: 'var(--body)',
          }), { height: 170 }),
        ),
        section({ no: '05', title: 'One note for the month' },
          noteIn,
          h('div', { class: 'focus-actions' }, h('button', {
            class: 'btn btn-solid', type: 'button',
            onclick: async () => {
              await store.putRecord({ ...(record ?? {}), type: 'review', kind: 'monthly', month, date: today, note: noteIn.value.trim() });
              toast('Monthly note saved.');
            },
          }, 'Save the note')),
        ),
      ),
    ),
  );
  return undefined;
}

// ---- phase review ---------------------------------------------------------------------

function phaseReview(root, ctx, today, phaseId) {
  const phases = phaseWindows(ctx.program, ctx.settings);
  const phase = phases.find((p) => p.id === phaseId) ?? phases[0];
  const record = store.records('review').find((r) => r.kind === 'phase' && r.phase === phase.id) ?? null;
  const from = phase.start;
  const to = from ? (phase.end && phase.end < today ? phase.end : addDays(today, -1)) : null;
  const ready = from && to && to >= from;

  root.append(pageHead({
    eyebrow: `Phase review · phase ${phase.n}`,
    title: phase.name,
    thin: from ? `${fmtDate(from, 'dayYear')} to ${phase.end ? fmtDate(phase.end, 'dayYear') : 'the defense'}` : 'not started',
    below: h('div', { class: 'daynav' },
      h('a', { class: 'nav-link', href: '#/review' }, icon('left', 16), 'Review'),
      phases.filter((p) => p.id !== phase.id).map((p) => h('a', { class: 'nav-link', href: `#/review/phase/${p.id}` }, `Phase ${p.n}`)),
    ),
  }));
  root.append(h('p', { class: 'form-hint' }, phase.summary));

  if (!ready) {
    root.append(empty(from ? `This phase starts on ${fmtDate(from, 'long')}.` : 'This phase has no start date yet. It follows the defense date in Settings.'));
    return undefined;
  }

  const a = adherence(ctx, store.getDay, from, to);
  const weights = store.weights();
  const w0 = average7(weights, addDays(from, 6));
  const w1 = average7(weights, to);
  const learnMinutes = minutesBetween(store.records('learn'), from, to);
  const pfeMinutes = keptMinutes(ctx, store.getDay, from, to, 'pfe');
  const training = sessionCount(ctx, store.getDay, from, to, ['muaythai', 'strength-a', 'strength-b', 'run']);
  const done = store.kv('learn', {}).done ?? {};
  const modules = store.list('tracks', 'tracks').reduce((sum, t) => sum + trackProgress(t, done).done, 0);
  const days = diffDays(from, to) + 1;
  const cats = Object.entries(a.byCategory).sort((x, y) => y[1].due - x[1].due);

  const answers = { keep: record?.keep ?? '', drop: record?.drop ?? '', focus: record?.focus ?? '' };
  const area = (key, label, placeholder) => field(label, h('textarea', {
    class: 'input', rows: 3, maxlength: 800, placeholder, value: answers[key], oninput: (e) => { answers[key] = e.target.value; },
  }));

  root.append(h('div', { class: 'two-col' },
    h('div', { class: 'col' },
      section({ no: '01', title: 'The phase in numbers', meta: `${days} days so far` },
        h('div', { class: 'facts' },
          h('div', {}, h('span', { class: 'eyebrow' }, 'Adherence'), h('b', {}, pct(a.pct))),
          h('div', {}, h('span', { class: 'eyebrow' }, 'Training sessions'), h('b', {}, `${training.kept} of ${training.due}`)),
          h('div', {}, h('span', { class: 'eyebrow' }, 'Learning'), h('b', {}, hours(learnMinutes))),
          h('div', {}, h('span', { class: 'eyebrow' }, 'PFE'), h('b', {}, hours(pfeMinutes))),
          h('div', {}, h('span', { class: 'eyebrow' }, 'Weight'), h('b', {}, w0.avg != null && w1.avg != null ? `${signed(w1.avg - w0.avg)} kg` : '–')),
          h('div', {}, h('span', { class: 'eyebrow' }, 'Modules done'), h('b', {}, String(modules))),
        ),
      ),
      section({ no: '02', title: 'By category' },
        cats.length
          ? h('div', { class: 'catbars' }, cats.map(([id, c]) => h('div', { class: cx('catbar', `cat-${id}`) },
            h('span', { class: 'catbar-name' }, catLabel(ctx, id)), bar(c.pct ?? 0, 'var(--c)'), h('span', { class: 'catbar-num' }, pct(c.pct)),
          )))
          : empty('Nothing was due in this phase yet.'),
      ),
    ),
    h('div', { class: 'col' },
      section({ no: '03', title: 'Three questions' },
        area('keep', 'What do I keep?', 'What clearly works and stays'),
        area('drop', 'What do I drop or shrink?', 'What costs more than it gives'),
        area('focus', 'The main focus of the next phase', 'One sentence'),
        h('div', { class: 'focus-actions' }, h('button', {
          class: 'btn btn-solid', type: 'button',
          onclick: async () => {
            await store.putRecord({
              ...(record ?? {}), type: 'review', kind: 'phase', phase: phase.id, date: today,
              keep: answers.keep.trim(), drop: answers.drop.trim(), focus: answers.focus.trim(),
              stats: { pct: a.pct, learnMinutes, pfeMinutes },
            });
            toast('Phase review saved.');
          },
        }, record ? 'Save again' : 'Save the phase review')),
      ),
    ),
  ));
  return undefined;
}
