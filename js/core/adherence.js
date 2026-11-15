// Adherence: did I keep what was due?
//
// "Kept" means done OR minimum version. Skipped and never logged both count as missed
// once the day is over. Only unlocked, tracked items count. Work, free time and
// football (counts: false) never count.
//
// A day record looks like:
//   { date, items: { '<key>': { s: 'done' | 'min' | 'skip', reason } }, water, ... }

import { addDays, mondayOf } from './dates.js';
import { blocksForDate, dailyHabitsForDate, waterTarget } from './schedule.js';

export const WATER_MIN_ML = 2000;

export const isKept = (status) => status === 'done' || status === 'min';

// Everything that can be ticked on a date: unlocked tracked blocks + unlocked daily habits.
export function trackedItems(ctx, date) {
  if (date < ctx.program.startDate) return [];
  const items = [];
  for (const b of blocksForDate(ctx, date)) {
    if (!b.track || b.locked) continue;
    items.push({ key: b.key, id: b.id, kind: 'block', title: b.title, category: b.category, counts: b.counts, min: b.min });
  }
  for (const hb of dailyHabitsForDate(ctx, date)) {
    if (hb.locked) continue;
    items.push({
      key: hb.key, id: hb.key, kind: 'habit', title: hb.title, category: hb.category ?? 'mind',
      counts: hb.counts !== false, min: hb.min ?? '', auto: hb.auto ?? null,
    });
  }
  return items;
}

// 'done' | 'min' | 'skip' | null (nothing logged yet).
export function itemStatus(ctx, day, item, date) {
  const manual = day?.items?.[item.key]?.s ?? null;
  if (item.auto === 'water') {
    const ml = day?.water ?? 0;
    if (ml >= waterTarget(ctx, date)) return 'done';
    if (ml >= (ctx.water?.minMl ?? WATER_MIN_ML)) return manual === 'done' ? 'done' : 'min';
  }
  return manual;
}

// Numbers for one day. pct is kept / due (null when nothing was due).
export function dayStats(ctx, date, day) {
  const s = { due: 0, kept: 0, done: 0, min: 0, skipped: 0, open: 0, pct: null, byCategory: {} };
  for (const it of trackedItems(ctx, date)) {
    if (!it.counts) continue;
    const st = itemStatus(ctx, day, it, date);
    const cat = (s.byCategory[it.category] ??= { due: 0, kept: 0 });
    s.due += 1;
    cat.due += 1;
    if (st === 'done') { s.done += 1; s.kept += 1; cat.kept += 1; }
    else if (st === 'min') { s.min += 1; s.kept += 1; cat.kept += 1; }
    else if (st === 'skip') s.skipped += 1;
    else s.open += 1;
  }
  s.pct = s.due ? s.kept / s.due : null;
  return s;
}

// Adherence between two dates (both included). getDay(date) returns the day record or undefined.
// filter(item) can narrow it down to one habit or one category.
export function adherence(ctx, getDay, from, to, filter) {
  let due = 0;
  let kept = 0;
  const byCategory = {};
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = getDay(d);
    for (const it of trackedItems(ctx, d)) {
      if (!it.counts || (filter && !filter(it))) continue;
      const cat = (byCategory[it.category] ??= { due: 0, kept: 0 });
      due += 1;
      cat.due += 1;
      if (isKept(itemStatus(ctx, day, it, d))) { kept += 1; cat.kept += 1; }
    }
  }
  for (const cat of Object.values(byCategory)) cat.pct = cat.due ? cat.kept / cat.due : null;
  return { due, kept, pct: due ? kept / due : null, byCategory };
}

// The last n finished days (today is not included, it is still running).
export function adherenceLast(ctx, getDay, today, n, filter) {
  return adherence(ctx, getDay, addDays(today, -n), addDays(today, -1), filter);
}

// Never miss twice: items whose last two due occurrences were both missed.
// For a daily habit that is two days in a row; for Muay Thai it is two sessions in a row.
// Today only counts once it is logged, so keeping the item today clears the warning.
export function missedTwice(ctx, getDay, today, lookback = 21) {
  const seen = new Map();
  for (let d = addDays(today, -lookback); d <= today; d = addDays(d, 1)) {
    const day = getDay(d);
    for (const it of trackedItems(ctx, d)) {
      if (!it.counts) continue;
      let e = seen.get(it.id);
      if (!e) {
        e = { id: it.id, title: it.title, min: it.min, kind: it.kind, history: [], dueToday: false, key: null };
        seen.set(it.id, e);
      }
      const st = itemStatus(ctx, day, it, d);
      if (d === today) {
        e.dueToday = true;
        e.key = it.key;
        if (!st) continue;
      }
      e.history.push(isKept(st));
    }
  }
  const out = [];
  for (const e of seen.values()) {
    const n = e.history.length;
    if (n >= 2 && !e.history[n - 1] && !e.history[n - 2]) out.push(e);
  }
  return out;
}

// How often a don't was avoided between two dates. Only the evenings where I answered count.
// allowance: slips per week (Monday to Sunday) that are still fine, for example soda 2 times a week.
export function dontStats(getDay, id, from, to, allowance = 0) {
  let asked = 0;
  let slips = 0;
  const perWeek = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const answer = getDay(d)?.donts?.[id];
    if (answer !== true && answer !== false) continue;
    asked += 1;
    if (answer === false) {
      const week = mondayOf(d);
      const n = (perWeek.get(week) ?? 0) + 1;
      perWeek.set(week, n);
      if (n > allowance) slips += 1;
    }
  }
  return { asked, slips, avoided: asked - slips, pct: asked ? (asked - slips) / asked : null };
}

// Streak that forgives one miss per week (Monday to Sunday), so one bad day never resets it.
// Counts kept occurrences going back from yesterday (or today when it is already kept).
export function streak(ctx, getDay, today, filter, lookback = 365) {
  let count = 0;
  const missesByWeek = new Map();
  for (let d = today, i = 0; i <= lookback && d >= ctx.program.startDate; d = addDays(d, -1), i += 1) {
    const day = getDay(d);
    const items = trackedItems(ctx, d).filter((it) => it.counts && (!filter || filter(it)));
    if (!items.length) continue;
    const statuses = items.map((it) => itemStatus(ctx, day, it, d));
    if (d === today && statuses.some((s) => !s)) continue;
    if (statuses.every(isKept)) {
      count += 1;
      continue;
    }
    const week = mondayOf(d);
    const misses = (missesByWeek.get(week) ?? 0) + 1;
    missesByWeek.set(week, misses);
    if (misses > 1) break;
  }
  return count;
}
