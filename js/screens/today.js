// Today: what is now and next, the day's blocks, the trackers, the don'ts and the journal.

import { h, cx, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet, toast, confirmSheet } from '../ui/sheet.js';
import { pageHead, section, ring, tick, seg, bar, note, chips, pct, timeInput } from '../ui/parts.js';
import { store } from '../store.js';
import * as clock from '../clock.js';
import { refresh } from '../router.js';
import { setStatus, moveBlock, unmoveBlock, applyReplan, resetReplan, hasReplan } from '../actions.js';
import { replanDay, pullForward, restOfDay } from '../core/replan.js';
import { forceStage, FORCE_WARNING } from '../unlockFlow.js';
import {
  appDate, appMinutes, addDays, diffDays, fmtDate, fmtHM, fmtDur, programWeek, isISO, weekDates, mondayOf, normalizeTime, DAY_SHORT, dow,
} from '../core/dates.js';
import { blocksForDate, dailyHabitsForDate, dontsForDate, nowNext, phaseFor } from '../core/schedule.js';
import { dayStats, itemStatus, missedTwice, trackedItems } from '../core/adherence.js';
import { nextLockedStage } from '../core/unlock.js';
import { waterCell, proteinCell, foodSummary, changeFoodLog } from './shared.js';
import { MEALS, planFor, planEntries, addEntries, mealAt } from '../core/food.js';
import { weekSoFar } from '../core/stats.js';
import { monthMoney, spentBetween } from '../core/money.js';
import { pfeProgress } from '../core/pfe.js';
import { waterTarget } from '../core/schedule.js';
import { openFoodSheet } from './food.js';
import { openSpendSheet, dh } from './money.js';

const SKIP_REASONS = ['Tired', 'No time', 'Sick', 'Forgot', 'Plans changed'];
const LINK_LABELS = { body: 'Open in Body', learn: 'Open Learn', create: 'Open Create', mind: 'Open Mind', review: 'Start the review', food: 'Open Food', pfe: 'Open my PFE steps' };

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export function today(root, route) {
  const ctx = store.ctx();
  const dsh = ctx.program.dayStartHour;
  const realToday = appDate(clock.now(), dsh);
  const date = isISO(route.params[0]) ? route.params[0] : realToday;
  const isToday = date === realToday;
  const start = ctx.program.startDate;
  const started = date >= start;
  const day = store.day(date);
  const blocks = blocksForDate(ctx, date);
  const live = blocks.filter((b) => !b.locked);
  const lockedBlocks = blocks.filter((b) => b.locked);
  const phase = phaseFor(ctx.program, ctx.settings, date);
  const items = new Map(trackedItems(ctx, date).map((it) => [it.key, it]));
  const statusOf = (key) => (items.has(key) ? itemStatus(ctx, store.day(date), items.get(key), date) : null);
  const minutesNow = () => appMinutes(clock.now(), dsh);

  // ---- header ---------------------------------------------------------------

  const dayLabel = (d) => `${DAY_SHORT[dow(d) - 1]} ${Number(d.slice(8))}`;
  const dayNav = h('div', { class: 'daynav' },
    h('a', { class: 'nav-link', href: `#/today/${addDays(date, -1)}`, 'aria-label': `Previous day, ${fmtDate(addDays(date, -1), 'long')}` }, icon('left', 16), dayLabel(addDays(date, -1))),
    h('a', { class: 'nav-link', href: `#/today/${addDays(date, 1)}`, 'aria-label': `Next day, ${fmtDate(addDays(date, 1), 'long')}` }, dayLabel(addDays(date, 1)), icon('right', 16)),
    isToday ? null : h('a', { class: 'btn btn-quiet btn-small', href: '#/today' }, 'Back to today'),
  );

  // Section numbers follow what is really on screen (habits and don'ts can be absent).
  let secCount = 0;
  const nextNo = () => String(++secCount).padStart(2, '0');
  const headSlot = h('div');
  const drawHead = () => {
    const stats = dayStats(ctx, date, store.day(date));
    headSlot.replaceChildren(pageHead({
      eyebrow: started ? `${phase?.name ?? 'Program'} · Week ${programWeek(start, date)}` : 'Before the start',
      title: fmtDate(date, 'weekday'),
      thin: fmtDate(date, 'dayMonth'),
      side: started ? ring(stats.pct, { size: 68 }) : null,
      below: dayNav,
    }));
  };

  // ---- banners --------------------------------------------------------------

  const banners = h('div', { class: 'banners' });   // above everything
  const alerts = h('div', { class: 'banners' });    // after the now card

  if (clock.isSimulated()) {
    banners.append(h('div', { class: 'strip' },
      h('span', {}, `Preview: ${fmtDate(realToday, 'short')}, ${fmtHM(minutesNow())}`),
      h('a', { href: '?now=off' }, 'Back to real time'),
    ));
  }

  if (!started) {
    const n = diffDays(date, start);
    banners.append(note({
      tone: 'mind',
      title: `The program starts on ${fmtDate(start, 'long')}.`,
      text: `${n === 1 ? 'One day' : `${n} days`} to go. Use the time to check your times in Settings and to look at the first week.`,
      actions: [
        h('a', { class: 'btn btn-solid btn-small', href: '#/guide' }, 'How it works'),
        h('a', { class: 'btn btn-quiet btn-small', href: `#/week/${start}` }, 'Preview week 1'),
      ],
    }));
  }

  // The result of the last unlock check stays here until I close it.
  const notice = isToday ? store.kv('unlockNotice') : null;
  const noticeStage = notice ? ctx.stages[notice.stageId] : null;
  if (noticeStage) {
    const closeNotice = () => store.setKV('unlockNotice', null);
    const threshold = pct(ctx.program.unlock.threshold);
    if (notice.action === 'postpone') {
      banners.append(note({
        tone: 'warn',
        title: 'Not yet, consolidate first',
        text: `Your adherence on the active items over the last ${ctx.program.unlock.windowDays} days is ${pct(notice.pct)}. Stage ${noticeStage.n} needs ${threshold}. Next check: ${fmtDate(noticeStage.due, 'long')}.`,
        actions: [
          h('button', { class: 'btn btn-small btn-solid', type: 'button', onclick: closeNotice }, 'OK, one more week'),
          h('button', {
            class: 'btn-text', type: 'button',
            onclick: async () => {
              const yes = await confirmSheet({
                title: `Force stage ${noticeStage.n}?`,
                message: `${FORCE_WARNING} Your adherence is ${pct(notice.pct)}, the rule asks for ${threshold}.`,
                confirm: 'Unlock anyway', cancel: 'Wait', danger: true,
              });
              if (yes) await forceStage(noticeStage.id);
            },
          }, 'Unlock anyway'),
        ],
      }));
    } else {
      banners.append(note({
        tone: 'mind',
        title: notice.action === 'forced' ? `Stage ${noticeStage.n} unlocked, against the rule` : `Unlocked today: stage ${noticeStage.n}`,
        text: `${noticeStage.summary}${notice.action === 'forced' ? '' : ` Adherence over the last ${ctx.program.unlock.windowDays} days: ${pct(notice.pct)}.`}`,
        actions: [
          h('button', { class: 'btn btn-small btn-solid', type: 'button', onclick: closeNotice }, 'OK'),
          h('a', { class: 'btn btn-small btn-quiet', href: '#/week' }, 'See the week'),
        ],
      }));
    }
  }

  const priority = started ? store.day(addDays(date, -1)).journal?.priority : '';
  if (priority) {
    banners.append(h('div', { class: 'priority' }, h('span', { class: 'eyebrow' }, 'No. 1 today'), h('p', {}, priority)));
  }

  // The one change I chose in last week's review.
  const reviews = store.records('review').filter((r) => r.kind === 'weekly');
  const change = started ? reviews.find((r) => r.week === addDays(mondayOf(date), -7))?.change : '';
  if (change) {
    banners.append(h('div', { class: 'priority' }, h('span', { class: 'eyebrow' }, 'One change this week'), h('p', {}, change)));
  }

  if (isToday && started && dow(date) === 7 && !reviews.some((r) => r.week === mondayOf(date))) {
    banners.append(note({
      title: 'Weekly review',
      text: 'About 20 minutes: the numbers, three questions, one change. Then a backup.',
      actions: h('a', { class: 'btn btn-small btn-solid', href: '#/review/weekly' }, 'Start the review'),
    }));
  }

  if (isToday && started) {
    const twice = missedTwice(ctx, store.getDay, date);
    if (twice.length) {
      alerts.append(h('div', { class: 'note note-warn' },
        h('p', { class: 'note-title' }, 'Never miss twice'),
        h('p', { class: 'note-text' }, `${twice.length === 1 ? 'One thing was' : `${twice.length} things were`} missed two times in a row. The minimum is enough to break the chain.`),
        h('div', { class: 'ylist' }, twice.slice(0, 4).map((m) => {
          const status = m.key ? statusOf(m.key) : null;
          const block = live.find((b) => b.key === m.key);
          const later = block && block.start > minutesNow();
          return h('div', { class: 'yrow' },
            h('span', { class: 'yrow-text' }, m.title, m.min ? h('small', {}, m.min) : null),
            m.dueToday && !status && !later
              ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => setStatus(date, m.key, 'min') }, 'Min done')
              : h('span', { class: 'yrow-note' }, later ? `Today, ${fmtHM(block.start)}` : m.dueToday ? 'Skipped today' : 'Next time'),
          );
        })),
        twice.length > 4 ? h('a', { class: 'btn-text', href: '#/habits' }, `${twice.length - 4} more in Habits`) : null,
      ));
    }

    const y = addDays(date, -1);
    const yDay = store.day(y);
    const open = trackedItems(ctx, y).filter((it) => it.counts && !itemStatus(ctx, yDay, it, y));
    if (open.length) {
      alerts.append(h('div', { class: 'note' },
        h('p', { class: 'note-title' }, `Yesterday: ${open.length} not logged`),
        h('p', { class: 'note-text' }, 'What is not logged counts as missed. Missing once is neutral.'),
        h('div', { class: 'ylist' }, open.map((it) => h('div', { class: 'yrow' },
          h('span', { class: 'yrow-text' }, it.title),
          seg(
            [{ value: 'done', label: 'Done' }, { value: 'min', label: 'Min' }, { value: 'skip', label: 'Missed' }],
            null,
            (v) => v && setStatus(y, it.key, v),
            { label: it.title },
          ),
        ))),
      ));
    }
  }

  // ---- now / next -----------------------------------------------------------

  const nowSlot = h('div');
  let nowKey = null;
  const drawNow = () => {
    if (!isToday || !started) return;
    const minutes = minutesNow();
    const { current, next } = nowNext(live, minutes);
    nowKey = current?.key ?? null;
    nowSlot.replaceChildren(h('div', { class: cx('now', current && `cat-${current.category}`) },
      h('div', { class: 'now-top' },
        h('span', { class: 'eyebrow' }, 'Now'),
        h('span', { class: 'now-clock' }, fmtHM(minutes)),
      ),
      current
        ? [
          h('button', { class: 'now-title', type: 'button', onclick: () => openBlockSheet(current) }, current.title),
          h('div', { class: 'now-sub' },
            h('span', {}, `${fmtHM(current.start)} to ${fmtHM(current.end)}`),
            h('strong', {}, `${fmtDur(current.end - minutes)} left`),
          ),
          bar((minutes - current.start) / (current.end - current.start), 'var(--c)'),
        ]
        : [
          h('p', { class: 'now-title is-quiet' }, 'Open time'),
          h('div', { class: 'now-sub' }, h('span', {}, 'Nothing is planned right now.')),
        ],
      h('div', { class: 'now-next' },
        h('span', { class: 'eyebrow' }, 'Next'),
        next
          ? [
            h('span', { class: 'now-next-title' }, h('b', {}, fmtHM(next.start)), ` ${next.title}`),
            h('span', { class: 'now-next-in' }, `in ${fmtDur(next.start - minutes)}`),
          ]
          : h('span', { class: 'now-next-title' }, 'Nothing more today.'),
      ),
    ));
  };

  // ---- quick log: the four things I log most, one tap each ---------------------

  const nutrition = store.state.data.nutrition;
  const todayPlan = planFor(nutrition.mealPlans, {
    isWorkday: ctx.settings.work.days.includes(dow(date)),
    isMuayThai: blocks.some((b) => b.id === 'muaythai'),
  });

  const addWater = async () => {
    const step = ctx.water?.stepMl ?? 250;
    await store.updateDay(date, (d) => { d.water = (d.water ?? 0) + step; });
    const total = store.day(date).water;
    toast(`Water: ${(total / 1000).toFixed(2)} of ${(waterTarget(ctx, date) / 1000).toFixed(1)} L`, {
      action: { label: 'Undo', run: () => store.updateDay(date, (d) => { d.water = Math.max(0, (d.water ?? 0) - step); }) },
    });
  };

  // The meal that fits the clock. If it is planned and not logged yet, one tap logs the plan.
  const mealId = mealAt(appMinutes(clock.now(), 0) % 1440);
  const mealName = (MEALS.find((m) => m.id === mealId)?.title ?? 'Meal').toLowerCase();
  const plannedMeal = todayPlan.meals.find((m) => m.id === mealId);
  const mealLogged = (day.foodLog ?? []).some((e) => e.meal === mealId);
  const ateMeal = async () => {
    if (!plannedMeal || mealLogged) {
      openFoodSheet(date, mealId);
      return;
    }
    const before = new Set((store.day(date).foodLog ?? []).map((e) => e.id));
    await changeFoodLog(date, (log) => addEntries(log, planEntries(todayPlan, mealId), () => store.uid('f')));
    const added = new Set((store.day(date).foodLog ?? []).map((e) => e.id).filter((id) => !before.has(id)));
    toast(`${plannedMeal.title ?? 'Meal'} logged as planned.`, {
      action: { label: 'Undo', run: () => changeFoodLog(date, (log) => log.filter((e) => !added.has(e.id))) },
    });
  };

  const openWeight = () => {
    const input = h('input', {
      class: 'input input-big', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '00.0',
      value: store.day(date).weight ?? '', 'aria-label': 'Weight in kg',
    });
    const save = async () => {
      const v = Number(String(input.value).replace(',', '.'));
      if (!(v >= 30 && v <= 250)) { input.focus(); toast('Type your weight, for example 70.4'); return; }
      await store.updateDay(date, (d) => { d.weight = Math.round(v * 10) / 10; });
      sheet.close();
      toast(`Weight ${Math.round(v * 10) / 10} kg saved.`);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    const sheet = openSheet({
      eyebrow: 'Morning weight',
      title: 'My weight',
      body: [h('div', { class: 'money-amount' }, input, h('span', {}, 'kg')), h('p', { class: 'form-hint' }, 'After the toilet, before eating.')],
      footer: [h('button', { class: 'btn btn-solid btn-grow', type: 'button', onclick: save }, 'Save')],
    });
    setTimeout(() => input.focus(), 60);
  };

  const qBtn = (iconName, label, sub, onclick, on) => h('button', { class: cx('quick-item', on && 'is-on'), type: 'button', onclick },
    icon(iconName, 20), h('span', {}, label), sub ? h('small', {}, sub) : null);

  const quick = isToday
    ? h('div', { class: 'quick', role: 'group', 'aria-label': 'Quick log' },
      qBtn('drop', `+${ctx.water?.stepMl ?? 250} ml`, `${((day.water ?? 0) / 1000).toFixed(2)} L`, addWater),
      qBtn('food', plannedMeal && !mealLogged ? `Ate ${mealName}` : 'Log food', plannedMeal && !mealLogged ? 'as planned' : mealLogged ? `${mealName} done` : null, ateMeal, mealLogged),
      qBtn('money', 'Spent', null, () => openSpendSheet()),
      qBtn('scale', 'Weight', day.weight ? `${day.weight} kg` : null, openWeight, Boolean(day.weight)),
    )
    : null;

  // ---- replan my day: the day changed, fix the rest of it in two taps ---------------

  function openReplanSheet() {
    let sheet = null;
    const now = minutesNow();
    const rawStatus = (key) => store.day(date).items[key]?.s ?? null;
    const opts = { now, statusOf: rawStatus };

    const option = (title, sub, onclick) => h('button', { class: 'replan-opt', type: 'button', onclick }, h('b', {}, title), h('small', {}, sub));
    const back = () => h('button', { class: 'btn btn-quiet', type: 'button', onclick: showMenu }, 'Back');

    function showPreview(title, { moved = [], skipped = [], kept = [], reason = 'Plans changed', empty: emptyText }) {
      const line = (name, from, to, tone) => h('div', { class: cx('replan-line', tone && `is-${tone}`) }, h('span', {}, name), h('b', {}, from, to ? [' → ', to] : null));
      const lines = [
        ...moved.map(({ block, start }) => line(block.title, fmtHM(block.start), fmtHM(start))),
        ...skipped.map((b) => line(b.title, fmtHM(b.start), 'skipped', 'skip')),
        ...kept.map((b) => line(b.title, fmtHM(b.start), 'no room, stays', 'quiet')),
      ];
      sheet.setBody(
        h('p', { class: 'sheet-eyebrow-line' }, title),
        lines.length ? h('div', { class: 'replan-lines' }, lines) : h('p', { class: 'sheet-text' }, emptyText ?? 'Nothing needs to change. Your plan still works.'),
        skipped.length ? h('p', { class: 'form-hint' }, `Skipped blocks get the reason "${reason}". Missing once is neutral.${skipped.some((b) => b.min) ? ' If you still find 15 minutes, open the block and mark the minimum: it counts as kept.' : ''}`) : null,
        moved.length ? h('p', { class: 'form-hint' }, 'New times are for today only. Your usual week stays the same.') : null,
      );
      sheet.setFooter(
        back(),
        moved.length || skipped.length
          ? h('button', {
            class: 'btn btn-solid btn-grow', type: 'button',
            onclick: async () => {
              const undo = await applyReplan(date, { moved, skipped, reason });
              sheet.close();
              toast(`Day replanned: ${moved.length} moved${skipped.length ? `, ${skipped.length} skipped` : ''}.`, { ms: 6000, action: { label: 'Undo', run: undo } });
            },
          }, 'Apply')
          : null,
      );
    }

    const fromRule = (title, r) => showPreview(title, {
      moved: r.moved,
      skipped: [...r.missed, ...r.dropped.filter((b) => b.track)],
      kept: r.dropped.filter((b) => !b.track),
    });

    function showLate() {
      sheet.setBody(
        h('p', { class: 'sheet-text' }, 'How late are you? What is in the way moves later, the rest keeps its time. Work, Muay Thai and your bedtime routine never move.'),
        h('div', { class: 'replan-chips' }, [15, 30, 60, 90, 120].map((m) => h('button', {
          class: 'btn', type: 'button',
          onclick: () => fromRule(`Running ${fmtDur(m)} late`, replanDay(live, ctx.blocks, { ...opts, busyUntil: now + m, markMissed: false })),
        }, `+${fmtDur(m)}`))),
      );
      sheet.setFooter(back());
    }

    function showBusy() {
      const suggest = Math.ceil((now + 60) / 15) * 15;
      const until = timeInput(fmtHM(suggest), { label: 'Busy until' });
      const go = () => {
        const v = normalizeTime(until.value);
        if (!v) { toast('Type a time, for example 19:30.'); return; }
        let end = Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
        if (end < dsh * 60) end += 1440;
        if (end <= now) { toast('That time has already passed.'); return; }
        fromRule(`Busy until ${v}`, replanDay(live, ctx.blocks, { ...opts, busyUntil: end }));
      };
      until.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      sheet.setBody(
        h('p', { class: 'sheet-text' }, 'Work runs late, a meeting, the family, the road. Until when are you busy?'),
        h('div', { class: 'replan-chips' }, [60, 120, 180].map((m) => h('button', {
          class: 'btn', type: 'button', onclick: () => { until.value = fmtHM(Math.ceil((now + m) / 15) * 15); go(); },
        }, `${fmtDur(m)} from now`))),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Or busy until'), until),
      );
      sheet.setFooter(back(), h('button', { class: 'btn btn-solid btn-grow', type: 'button', onclick: go }, 'See the new plan'));
    }

    function showFree() {
      const r = pullForward(live, ctx.blocks, opts);
      if (r.reason) {
        showPreview('Free time now', {
          empty: r.reason === 'nothing'
            ? 'Nothing left to bring forward today. Enjoy the free time, or open Learn or Create.'
            : `${r.block.title} (${fmtDur(r.block.end - r.block.start)}) does not fit before the next fixed thing. Keep it at ${fmtHM(r.block.start)}.`,
        });
        return;
      }
      showPreview('Free time now: do the next thing earlier', { moved: r.moved });
    }

    function showOff() {
      const left = restOfDay(live, opts);
      sheet.setBody(
        h('p', { class: 'sheet-text' }, `Everything still open today (${left.length} ${left.length === 1 ? 'block' : 'blocks'}) is marked skipped. Tomorrow starts fresh.`),
        h('div', { class: 'replan-chips' }, ['Sick', 'Exhausted', 'Family', 'Plans changed'].map((r) => h('button', {
          class: 'btn', type: 'button', onclick: () => showPreview(`Day off: ${r.toLowerCase()}`, { skipped: left, reason: r }),
        }, r))),
        h('p', { class: 'form-hint' }, 'Only tired, not sick? "Bad day? Switch to minimums" keeps the day alive with small versions.'),
      );
      sheet.setFooter(back());
    }

    function showMenu() {
      sheet.setBody(
        h('div', { class: 'replan-opts' },
          option("I'm running late", 'Push everything still open by 15 min to 2 h', showLate),
          option('Something came up', 'Busy until a time: work, family, a meeting', showBusy),
          option('I have free time now', 'Do the next thing earlier', showFree),
          option('Day off', 'Sick or exhausted: skip what is left, no guilt', showOff),
        ),
        hasReplan(date)
          ? h('button', {
            class: 'btn-text', type: 'button',
            onclick: async () => { await resetReplan(date); sheet.close(); toast('Today is back to the usual plan.'); },
          }, 'Put today back to the usual plan')
          : null,
      );
      sheet.setFooter();
    }

    sheet = openSheet({ eyebrow: `Now ${fmtHM(now)}`, title: 'Replan my day', body: [] });
    showMenu();
  }

  const replanBtn = isToday && started
    ? h('button', { class: 'btn btn-block replan-btn', type: 'button', onclick: openReplanSheet }, icon('shuffle', 18), 'My day changed: replan')
    : null;

  // ---- this week at a glance ---------------------------------------------------

  const weekCard = (() => {
    if (!isToday) return null;
    const rows = [];
    const row = (href, label, value, sub) => rows.push(h('a', { class: 'wk-row', href }, h('span', {}, label), h('b', {}, value), sub ? h('small', {}, sub) : null));
    if (started) {
      const w = weekSoFar(ctx, store.getDay, date, start);
      row('#/habits', 'Kept so far', w.due ? `${w.kept} of ${w.due}` : '–', w.pct != null ? `${Math.round(w.pct * 100)}%` : null);
      row('#/body', 'Training', `${w.training.kept} of ${w.training.due}`, 'sessions');
      row('#/food', 'Water', w.waterAvgL != null ? `${w.waterAvgL.toFixed(1)} L` : '–', 'a day');
      const p = pfeProgress(store.kv('pfeSteps', []), date, ctx.settings.defenseDate || null);
      row('#/pfe', 'PFE', `${Math.round((w.pfeMinutes / 60) * 10) / 10} h`, p.pct != null ? `${Math.round(p.pct * 100)}% of steps` : 'add steps');
    }
    const spends = store.records('spend');
    const m = monthMoney(spends, date.slice(0, 7), ctx.settings.income ?? null, date);
    row('#/money', 'Spent', dh(spentBetween(spends, mondayOf(date), date)), m.left != null ? `${dh(m.left)} left this month` : 'this week');
    return h('section', { class: 'wk-card', 'aria-label': 'This week' },
      h('div', { class: 'wk-card-head' }, h('span', { class: 'eyebrow' }, 'This week'), h('a', { href: '#/review' }, 'Review')),
      rows);
  })();

  // ---- bad day --------------------------------------------------------------

  // In Ramadan mode every block shows its minimum version first, like on a minimum day.
  const ramadan = Boolean(ctx.settings.ramadan?.on);
  const minFirst = (d) => Boolean(d.badDay) || ramadan;

  const badDay = !started ? null : ramadan && !day.badDay
    ? note({ tone: 'mind', title: 'Ramadan mode', text: 'Meals are at iftar and suhoor. Minimum versions come first: a tick marks the minimum, open a block to mark the full version.' })
    : day.badDay
    ? note({
      tone: 'body',
      title: 'Minimum day',
      text: 'The small version of everything counts today. No guilt.',
      actions: h('button', {
        class: 'btn btn-small btn-quiet', type: 'button',
        onclick: () => store.updateDay(date, (d) => { d.badDay = false; }),
      }, 'Back to the normal day'),
    })
    : h('button', {
      class: 'btn btn-quiet btn-block badday', type: 'button',
      onclick: () => {
        store.updateDay(date, (d) => { d.badDay = true; });
        toast('Minimum day. Every block now shows its small version.');
      },
    }, 'Bad day? Switch to minimums');

  // ---- timeline -------------------------------------------------------------

  const quickToggle = (key, status) => setStatus(date, key, status ? null : (minFirst(store.day(date)) ? 'min' : 'done'));

  function blockRow(b, d, minutes) {
    const status = b.track ? statusOf(b.key) : null;
    const rec = d.items[b.key];
    const isNow = isToday && nowKey === b.key;
    const isPast = isToday ? b.end <= minutes : date < realToday;
    const showMin = b.track && b.min && (status === 'min' || (minFirst(d) && !status));
    const meta = [fmtDur(b.end - b.start)];
    if (b.moved) meta.push('moved');
    if (status === 'skip') meta.push(rec?.reason ? `skipped: ${rec.reason.toLowerCase()}` : 'skipped');
    else if (b.note && !showMin) meta.push(b.note);
    return h('div', { class: cx('blk', `cat-${b.category}`, isNow && 'is-now', isPast && 'is-past', status && `is-${status}`, !b.track && 'is-info') },
      h('span', { class: 'blk-time' }, fmtHM(b.start)),
      h('span', { class: 'blk-bar' }),
      h('button', { class: 'blk-main', type: 'button', onclick: () => openBlockSheet(b) },
        h('span', { class: 'blk-title' }, b.title, isNow ? h('span', { class: 'tag' }, 'Now') : null),
        h('span', { class: 'blk-meta' }, meta.join(' · ')),
        showMin ? h('span', { class: 'blk-min' }, `Minimum: ${b.min}`) : null,
      ),
      b.track
        ? tick(status, { label: `${b.title}: ${status ? 'clear' : 'mark done'}`, onclick: () => quickToggle(b.key, status) })
        : h('span', { class: 'blk-none' }),
    );
  }

  const timelineSlot = h('div');
  const timelineNo = started ? nextNo() : null;
  const drawTimeline = () => {
    if (!started) return;
    const d = store.day(date);
    const minutes = isToday ? minutesNow() : 0;
    const stats = dayStats(ctx, date, d);
    const next = nextLockedStage(ctx.stages);
    timelineSlot.replaceChildren(section(
      { no: timelineNo, title: 'Your schedule', meta: stats.due ? `${stats.kept} of ${stats.due} kept` : null },
      // In the first two weeks, a reminder of how the squares work.
      programWeek(start, date) <= 2
        ? h('p', { class: 'form-hint is-tip' }, 'Tap a square when a block is done. Tap its name for the minimum version, to skip it or to move it. ', h('a', { href: '#/guide' }, 'How it works'))
        : null,
      h('div', { class: 'blks' }, live.map((b) => blockRow(b, d, minutes))),
      lockedBlocks.length
        ? h('a', { class: 'locked-line', href: `#/week/${date}` },
          icon('lock', 16),
          h('span', {}, `${lockedBlocks.length} locked ${lockedBlocks.length === 1 ? 'block' : 'blocks'} today`,
            next ? `. Next unlock check: ${fmtDate(next.due, 'short')}.` : '.'),
        )
        : null,
    ));
  };

  // ---- block sheet ----------------------------------------------------------

  function openBlockSheet(b) {
    const status = b.track ? statusOf(b.key) : null;
    const origin = b.movedFrom ?? b.date;
    let sheet = null;
    const act = (s, extra) => {
      setStatus(date, b.key, s, extra);
      sheet.close();
    };

    const choice = (value, label, sub) => h('button', {
      class: 'choice-btn', type: 'button', 'aria-pressed': String(status === value),
      onclick: () => (value === 'skip' ? showSkip() : act(value)),
    }, h('b', {}, label), sub ? h('small', {}, sub) : null);

    const mainView = () => [
      b.note ? h('p', { class: 'sheet-text' }, b.note) : null,
      b.track && b.min
        ? h('div', { class: 'minbox' }, h('span', { class: 'eyebrow' }, 'Minimum version'), h('p', {}, b.min))
        : null,
      b.track
        ? h('div', { class: 'choice' },
          choice('done', 'Done', 'Full version'),
          choice('min', 'Minimum', 'Counts as kept'),
          choice('skip', 'Skipped', 'With a reason'),
        )
        : null,
      h('div', { class: 'sheet-links' },
        h('button', { class: 'row-btn', type: 'button', onclick: showMove }, icon('move', 18), 'Move to another time'),
        b.link ? h('a', { class: 'row-btn', href: `#/${b.link}`, onclick: () => sheet.close() }, icon('right', 18), LINK_LABELS[b.link.split('/')[0]] ?? 'Open') : null,
        h('a', { class: 'row-btn', href: `#/week/${date}/edit/${b.id}`, onclick: () => sheet.close() }, icon('create', 18), 'Edit this block'),
        b.moved ? h('button', { class: 'row-btn', type: 'button', onclick: () => { unmoveBlock(b.id, origin); sheet.close(); } }, icon('left', 18), 'Put it back to its usual time') : null,
        status ? h('button', { class: 'row-btn', type: 'button', onclick: () => act(null) }, icon('close', 18), 'Clear the status') : null,
      ),
    ];

    function showSkip() {
      const other = h('input', { class: 'input', type: 'text', placeholder: 'Another reason', maxlength: 80 });
      sheet.setBody(
        h('p', { class: 'sheet-text' }, 'Missing once is neutral. A quick reason helps the weekly review.'),
        chips(SKIP_REASONS.map((r) => ({ value: r, label: r })), null, (r) => act('skip', { reason: r })),
        h('div', { class: 'field' }, other),
      );
      sheet.setFooter(
        h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => { sheet.setBody(mainView()); sheet.setFooter(); } }, 'Back'),
        h('button', { class: 'btn btn-solid', type: 'button', onclick: () => act('skip', { reason: other.value.trim() }) }, 'Save as skipped'),
      );
    }

    function showMove() {
      const days = weekDates(origin).filter((d) => d >= realToday || d === date);
      let target = date;
      const time = timeInput(fmtHM(b.start), { label: 'Start time' });
      const dayChips = h('div');
      const drawDays = () => dayChips.replaceChildren(chips(
        days.map((d) => ({ value: d, label: `${DAY_SHORT[dow(d) - 1]} ${Number(d.slice(8))}` })),
        target,
        (d) => { target = d; drawDays(); },
      ));
      drawDays();
      sheet.setBody(
        h('p', { class: 'sheet-text' }, 'This moves the block for this week only. The template stays the same.'),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Day'), dayChips),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Start time'), time),
      );
      sheet.setFooter(
        h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => { sheet.setBody(mainView()); sheet.setFooter(); } }, 'Back'),
        h('button', {
          class: 'btn btn-solid', type: 'button',
          onclick: () => {
            const at = normalizeTime(time.value);
            if (!at) {
              toast('Type a time, for example 18:15.');
              return;
            }
            moveBlock(b.id, origin, target, at);
            sheet.close();
            toast(`Moved to ${fmtDate(target, 'short')}, ${at}.`);
          },
        }, 'Move'),
      );
    }

    sheet = openSheet({
      eyebrow: `${ctx.program.categories.find((c) => c.id === b.category)?.label ?? ''} · ${fmtHM(b.start)} to ${fmtHM(b.end)}`,
      title: b.title,
      body: mainView(),
    });
  }

  // ---- daily habits ---------------------------------------------------------

  const habits = started ? dailyHabitsForDate(ctx, date).filter((hb) => !hb.locked) : [];
  const habitsSec = habits.length
    ? section({ no: nextNo(), title: 'Habits', meta: 'No clock time' },
      h('div', { class: 'habs' }, habits.map((hb) => {
        const status = statusOf(hb.key);
        const showMin = hb.min && (status === 'min' || (minFirst(day) && !status));
        return h('div', { class: cx('hab', status && `is-${status}`) },
          h('div', { class: 'hab-main' },
            h('span', { class: 'hab-title' }, hb.title),
            showMin ? h('span', { class: 'blk-min' }, `Minimum: ${hb.min}`) : hb.auto === 'water' ? h('span', { class: 'blk-meta' }, 'Fills in from the water counter.') : null,
          ),
          h('div', { class: 'hab-act' },
            !status && hb.min && !minFirst(day)
              ? h('button', { class: 'btn-text', type: 'button', onclick: () => setStatus(date, hb.key, 'min') }, 'Min')
              : null,
            tick(status, { label: `${hb.title}: ${status ? 'clear' : 'mark done'}`, onclick: () => quickToggle(hb.key, day.items[hb.key]?.s) }),
          ),
        );
      })),
    )
    : null;

  // ---- trackers: water, protein, weight ---------------------------------------

  const eaten = foodSummary(ctx, date);
  const saveWeight = debounce((text) => {
    const v = Number(String(text).replace(',', '.'));
    store.updateDay(date, (d) => {
      if (text.trim() === '') delete d.weight;
      else if (v >= 30 && v <= 250) d.weight = Math.round(v * 10) / 10;
    }, { silent: true });
  }, 500);

  const trackersSec = section({ no: nextNo(), title: 'Body check', meta: started ? null : 'Open before the start' },
    h('div', { class: 'cells' },
      waterCell(ctx, date, day),
      h('div', { class: 'cell cell-wide' },
        h('div', { class: 'cell-top' },
          h('span', { class: 'eyebrow' }, 'Food'),
          h('span', { class: 'cell-figure' }, h('b', {}, Math.round(eaten.kcal).toLocaleString('en-US')), ` / ${eaten.targetKcal.toLocaleString('en-US')} kcal`),
        ),
        bar(eaten.targetKcal ? eaten.kcal / eaten.targetKcal : 0, 'var(--body)'),
        h('div', { class: 'cell-actions is-split' },
          h('span', { class: 'cell-hint' }, `Protein: ${Math.round(eaten.protein)} of ${eaten.targetProtein} g`),
          isToday
            ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => openFoodSheet(date) }, 'Log food')
            : h('a', { class: 'btn btn-small', href: '#/food/plan' }, 'See the plan'),
        ),
      ),
      proteinCell(date, day),
      h('div', { class: 'cell' },
        h('label', { class: 'eyebrow', for: 'weight-in' }, 'Morning weight'),
        h('div', { class: 'weight' },
          h('input', {
            id: 'weight-in', class: 'weight-input', type: 'text', inputmode: 'decimal', autocomplete: 'off',
            placeholder: '00.0', value: day.weight ?? '',
            oninput: (e) => saveWeight(e.target.value), onblur: () => saveWeight.flush(),
          }),
          h('span', {}, 'kg'),
        ),
        h('span', { class: 'cell-hint' }, 'After the toilet, before eating.'),
      ),
    ),
  );

  // ---- don'ts ---------------------------------------------------------------

  const donts = started ? dontsForDate(ctx, date) : [];
  const dontsSec = donts.length
    ? section({ no: nextNo(), title: "Don'ts", meta: 'Avoided?' },
      donts.map((dn) => h('div', { class: 'dont' },
        h('div', {},
          h('p', { class: 'dont-title' }, dn.title),
          dn.detail ? h('p', { class: 'dont-detail' }, dn.detail) : null,
        ),
        seg(
          [{ value: true, label: 'Avoided' }, { value: false, label: 'Slipped' }],
          day.donts?.[dn.id],
          (v) => store.updateDay(date, (d) => {
            d.donts ??= {};
            if (v == null) delete d.donts[dn.id];
            else d.donts[dn.id] = v;
          }),
          { label: dn.title },
        ),
      )),
    )
    : null;

  // ---- evening: journal and plan ----------------------------------------------

  const journalInputs = {};
  const saveJournal = debounce(() => {
    const values = Object.fromEntries(Object.entries(journalInputs).map(([k, el]) => [k, el.value.trim()]));
    const filled = Object.values(values).filter(Boolean).length;
    store.updateDay(date, (d) => {
      d.journal = values;
      // The journal block ticks itself: three lines is done, one or two is the minimum.
      const cur = d.items.journal;
      if (items.has('journal') && (!cur || cur.auto)) {
        if (filled === 0) delete d.items.journal;
        else d.items.journal = { s: filled === 3 ? 'done' : 'min', auto: true, at: clock.now().toISOString() };
      }
    }, { silent: true });
    drawHead();
    drawTimeline();
  }, 500);

  const line = (key, label, placeholder) => {
    const el = h('textarea', {
      class: 'line-input', rows: 1, placeholder, maxlength: 400, value: day.journal?.[key] ?? '',
      oninput: (e) => { autosize(e.target); saveJournal(); },
      onblur: () => saveJournal.flush(),
    });
    journalInputs[key] = el;
    return h('label', { class: 'line' }, h('span', { class: 'field-label' }, label), el);
  };

  const journalSec = started
    ? section({ no: nextNo(), title: 'Evening', meta: 'Journal and plan' },
      line('win', 'One win', 'What went well today'),
      line('lesson', 'One lesson', 'What I learned or would change'),
      line('priority', "Tomorrow's no. 1 priority", 'The one thing that must happen'),
    )
    : null;

  // ---- put it together --------------------------------------------------------

  drawHead();
  drawNow();
  drawTimeline();
  root.append(
    headSlot,
    banners,
    ...(started ? [] : [
      h('nav', { class: 'simple-actions', 'aria-label': 'Plan your day' },
        h('a', { class: 'btn btn-solid', href: '#/week' }, icon('week', 18), 'Edit my schedule'),
        h('a', { class: 'btn', href: '#/settings/reminders' }, 'Reminders'),
        h('a', { class: 'btn btn-quiet', href: '#/guide' }, 'Help')),
      h('p', { class: 'form-hint' }, 'Start here: follow your schedule, tick what you finish, then log your food and water.'),
    ]),
    h('div', { class: 'today-grid' },
      h('div', { class: 'col' }, nowSlot, quick, replanBtn, weekCard, badDay, alerts, timelineSlot),
      h('div', { class: 'col' }, trackersSec, (habitsSec || dontsSec) ? h('details', { class: 'simple-panel' }, h('summary', {}, 'Daily habits'), habitsSec, dontsSec) : null, journalSec ? h('details', { class: 'simple-panel' }, h('summary', {}, 'Evening journal'), journalSec) : null),
    ),
  );
  setTimeout(() => Object.values(journalInputs).forEach(autosize), 0);

  const timer = setInterval(() => {
    if (!isToday) return;
    if (appDate(clock.now(), dsh) !== realToday) {
      refresh();
      return;
    }
    const before = nowKey;
    drawNow();
    if (before !== nowKey) drawTimeline();
  }, 20000);

  return () => {
    clearInterval(timer);
    saveJournal.flush();
    saveWeight.flush();
  };
}
