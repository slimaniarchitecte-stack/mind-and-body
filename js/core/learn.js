// Learning tracks: which one is the current focus, progress, AI lab theme, hours per week.
// Also the small rules of the Create screen (the 4 week cycle and the random brief).

import { addDays, diffDays, mondayOf } from './dates.js';

// The real dates of a track (the defense and CESI dates come from Settings).
export function trackWindow(track, settings) {
  const defense = settings.defenseDate || null;
  const cesi = settings.cesiStart || null;
  let start = track.start ?? null;
  let end = track.end ?? null;
  if (!start && track.startsAt === 'defense' && defense) start = addDays(defense, 1);
  if (!end && track.endsAt === 'defense' && defense) end = defense;
  if (!end && track.endsAt === 'cesi' && cesi) end = addDays(cesi, -1);
  return { start, end };
}

// Only one technical track is active at a time.
// Returns { current, next }: the focus track on this date, and the one that comes after.
export function currentFocus(tracks, settings, date) {
  let current = null;
  let next = null;
  for (const t of tracks) {
    if (t.kind !== 'focus') continue;
    const w = trackWindow(t, settings);
    if (!w.start) continue;
    if (date >= w.start && (!w.end || date <= w.end)) current = { ...t, ...w };
    else if (w.start > date && (!next || w.start < next.start)) next = { ...t, ...w };
  }
  return { current, next };
}

// done: { '<moduleId>': true }
export function trackProgress(track, done = {}) {
  const total = track.modules.length;
  const count = track.modules.filter((m) => done[m.id]).length;
  return { done: count, total, pct: total ? count / total : null, nextModule: track.modules.find((m) => !done[m.id]) ?? null };
}

// The AI lab theme of the week: they rotate, one per week, from the AI lab start date.
export function aiTheme(aiLab, date) {
  const n = aiLab.themes.length;
  const weeks = Math.floor(diffDays(mondayOf(aiLab.start), mondayOf(date)) / 7);
  return aiLab.themes[((weeks % n) + n) % n];
}

// Minutes per week for the last `weeks` weeks (oldest first). sessions: [{ date, minutes }].
export function weeklyMinutes(sessions, today, weeks = 8) {
  const thisMonday = mondayOf(today);
  const out = [];
  for (let i = weeks - 1; i >= 0; i -= 1) out.push({ monday: addDays(thisMonday, -7 * i), minutes: 0 });
  const index = new Map(out.map((w) => [w.monday, w]));
  for (const s of sessions) {
    const w = index.get(mondayOf(s.date));
    if (w) w.minutes += Number(s.minutes) || 0;
  }
  return out;
}

export function minutesBetween(sessions, from, to) {
  return sessions.reduce((sum, s) => (s.date >= from && s.date <= to ? sum + (Number(s.minutes) || 0) : sum), 0);
}

// ---- Create --------------------------------------------------------------------

// The Saturday session follows a 4 week cycle that starts the week the sessions start.
export function cycleStep(cycle, startDate, date) {
  const n = cycle.length;
  const weeks = Math.floor(diffDays(mondayOf(startDate), mondayOf(date)) / 7);
  return cycle[((weeks % n) + n) % n];
}

// A random brief, avoiding the ones I had most recently. recentIds: newest first.
export function pickBrief(briefs, recentIds = [], random = Math.random) {
  if (!briefs.length) return null;
  const avoid = new Set(recentIds.slice(0, Math.min(10, briefs.length - 1)));
  const pool = briefs.filter((b) => !avoid.has(b.id));
  const list = pool.length ? pool : briefs;
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}
