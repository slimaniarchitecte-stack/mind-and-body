// Numbers for the reviews: one week, a series of weeks, a whole phase.
// Everything here is computed from what I logged. Nothing is estimated or invented.

import { addDays, mondayOf } from './dates.js';
import { blocksForDate } from './schedule.js';
import { adherence, isKept } from './adherence.js';
import { average7 } from './nutrition.js';

// When a block was kept with its minimum version, we count this many minutes for it.
export const MIN_VERSION_MINUTES = 15;

// Time spent in a category, from the blocks that were kept between two dates.
// done counts the planned length of the block, minimum counts 15 minutes.
export function keptMinutes(ctx, getDay, from, to, category) {
  let minutes = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = getDay(d);
    for (const b of blocksForDate(ctx, d)) {
      if (b.category !== category || !b.track || b.locked) continue;
      const s = day?.items?.[b.key]?.s;
      if (s === 'done') minutes += b.end - b.start;
      else if (s === 'min') minutes += Math.min(MIN_VERSION_MINUTES, b.end - b.start);
    }
  }
  return minutes;
}

// Sessions kept and due for some block ids between two dates.
export function sessionCount(ctx, getDay, from, to, blockIds) {
  const out = { due: 0, kept: 0 };
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = getDay(d);
    for (const b of blocksForDate(ctx, d)) {
      if (!blockIds.includes(b.id) || b.locked) continue;
      out.due += 1;
      if (isKept(day?.items?.[b.key]?.s)) out.kept += 1;
    }
  }
  return out;
}

// The reasons I gave when I skipped something, most frequent first: [['Tired', 3], ...].
export function skipReasons(getDay, from, to) {
  const counts = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const rec of Object.values(getDay(d)?.items ?? {})) {
      if (rec.s !== 'skip') continue;
      const reason = rec.reason?.trim() || 'No reason given';
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

// Everything the weekly review shows.
//   extra: { learnSessions: [{ date, minutes }], weights: [{ date, kg }], footballGames: [{ date }] }
export function weekStats(ctx, getDay, monday, extra = {}) {
  const sunday = addDays(monday, 6);
  const inWeek = (r) => r.date >= monday && r.date <= sunday;
  const now = average7(extra.weights ?? [], sunday);
  const before = average7(extra.weights ?? [], addDays(sunday, -7));
  return {
    monday,
    sunday,
    adherence: adherence(ctx, getDay, monday, sunday),
    training: {
      muayThai: sessionCount(ctx, getDay, monday, sunday, ['muaythai']),
      strength: sessionCount(ctx, getDay, monday, sunday, ['strength-a', 'strength-b']),
      run: sessionCount(ctx, getDay, monday, sunday, ['run']),
      football: (extra.footballGames ?? []).filter(inWeek).length,
    },
    learnMinutes: (extra.learnSessions ?? []).filter(inWeek).reduce((sum, s) => sum + (Number(s.minutes) || 0), 0),
    pfeMinutes: keptMinutes(ctx, getDay, monday, sunday, 'pfe'),
    weight: {
      avg: now.avg,
      weighIns: now.n,
      change: now.avg != null && before.avg != null ? now.avg - before.avg : null,
    },
    skipReasons: skipReasons(getDay, monday, sunday),
  };
}

// Adherence week by week, oldest first, for the last `weeks` weeks that ended before `today`'s week ends.
export function weeklyAdherence(ctx, getDay, today, weeks = 12) {
  const thisMonday = mondayOf(today);
  const out = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const monday = addDays(thisMonday, -7 * i);
    const sunday = addDays(monday, 6);
    const to = sunday < today ? sunday : addDays(today, -1);
    const a = to >= monday ? adherence(ctx, getDay, monday, to) : { pct: null, due: 0, kept: 0 };
    out.push({ monday, pct: a.pct, due: a.due, kept: a.kept });
  }
  return out;
}

// The 7 day average weight at the end of each of the last `weeks` weeks.
export function weeklyWeight(weights, today, weeks = 12) {
  const thisMonday = mondayOf(today);
  const out = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const monday = addDays(thisMonday, -7 * i);
    const end = addDays(monday, 6) < today ? addDays(monday, 6) : today;
    const { avg, n } = average7(weights, end);
    out.push({ monday, date: end, avg: n >= 2 ? avg : null });
  }
  return out;
}

// Which week the weekly review is about: this week from Saturday on, otherwise the week before.
export function reviewWeek(today, weekday) {
  const monday = mondayOf(today);
  return weekday >= 6 ? monday : addDays(monday, -7);
}
