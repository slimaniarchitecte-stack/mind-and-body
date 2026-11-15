// Turns the template week (data/schedule.json + my edits) into the real blocks of a given date.
//
// ctx = {
//   program,        data/program.json
//   settings,       my settings
//   blocks,         template blocks, already merged with my edits
//   habits,         { dos, donts }
//   weekOverrides,  { '<monday>': { patches, added, removed, moves } }   "this week only" changes
//   stages,         result of resolveStages()
// }

import { dow, mondayOf, diffDays, addDays, parseHM } from './dates.js';
import { lockInfo } from './unlock.js';

const DAY_MIN = 1440;

// Clock times before the day start hour belong to the night that is ending (00:30 -> 1470).
function clock(text, dayStartHour) {
  const v = parseHM(text);
  if (v == null) return null;
  return v < dayStartHour * 60 ? v + DAY_MIN : v;
}

// The times that come from Settings, for one weekday.
export function resolveAnchors(settings, weekday, dayStartHour = 4) {
  const ram = settings.ramadan?.on ? settings.ramadan : null;
  const work = { ...settings.work, ...(ram?.work ?? {}) };
  const mt = { ...settings.muayThai, ...(ram?.muayThai ?? {}) };
  const t = (text) => clock(text, dayStartHour);
  const workday = work.days.includes(weekday);
  // Saturday has its own wake time (the urbanism session starts at 09:00).
  const wakeText = workday ? settings.wake : (weekday === 6 && settings.wakeSaturday) || settings.wakeWeekend;
  const a = {
    wake: t(wakeText),
    sleep: t(weekday === 6 ? settings.sleepSaturday : settings.sleep),
    'work.start': t(work.start),
    'work.end': t(work.end),
    'muayThai.start': t(mt.start),
    'muayThai.end': t(mt.end),
    'football.start': t(settings.football.start),
  };
  a.leave = a['work.start'] - settings.commuteMin;
  a.home = a['work.end'] + settings.commuteMin;
  a['football.end'] = a['football.start'] + settings.football.durationMin;
  if (ram) {
    a.iftar = t(ram.iftar);
    a.suhoor = t(ram.suhoor);
  }
  return a;
}

// '18:15' or '@muayThai.end+45' -> minutes.
export function resolveTime(expr, anchors, dayStartHour = 4) {
  if (typeof expr === 'number') return expr;
  if (typeof expr !== 'string') return null;
  const m = /^@([A-Za-z.]+)\s*([+-]\s*\d+)?$/.exec(expr.trim());
  if (m) {
    const base = anchors[m[1]];
    if (base == null) return null;
    return base + (m[2] ? parseInt(m[2].replace(/\s/g, ''), 10) : 0);
  }
  return clock(expr, dayStartHour);
}

// The weekdays of a block or habit. Explicit days win over "follow Settings".
export function daysOf(item, settings) {
  if (Array.isArray(item.days)) return item.days;
  const src = item.daysFrom ?? item.days;
  if (src === 'work') return settings.work.days;
  if (src === 'muayThai') return settings.muayThai.days;
  if (src === 'football') return [settings.football.day];
  return [];
}

// Phases with their real dates (Settings can override, the defense date ends phase 3).
export function phaseWindows(program, settings) {
  const defense = settings.defenseDate || null;
  const cesi = settings.cesiStart || null;
  return program.phases.map((p) => {
    const custom = settings.phaseDates?.[p.id] ?? {};
    let start = custom.start || p.start || null;
    let end = custom.end || p.end || null;
    if (!start && p.startsAt === 'defense' && defense) start = addDays(defense, 1);
    if (!end && p.endsAt === 'defense' && defense) end = defense;
    if (!end && p.endsAt === 'cesi' && cesi) end = addDays(cesi, -1);
    return { ...p, start, end };
  });
}

// The phase a date belongs to, or null before the program starts.
export function phaseFor(program, settings, date) {
  let found = null;
  for (const p of phaseWindows(program, settings)) {
    if (p.start && date >= p.start && (!p.end || date <= p.end)) found = p;
  }
  return found;
}

function instantiate(ctx, b, date, anchors) {
  const dsh = ctx.program.dayStartHour;
  const start = resolveTime(b.start, anchors, dsh);
  if (start == null) return null;
  const end = b.end != null ? resolveTime(b.end, anchors, dsh) : start + (b.duration ?? 30);
  if (end == null || end <= start) return null;
  const track = Boolean(b.track);
  return {
    id: b.id,
    key: b.id,
    date,
    title: b.title,
    note: b.note ?? '',
    category: b.category ?? 'free',
    start,
    end,
    track,
    counts: track && b.counts !== false,
    stage: b.stage ?? null,
    min: b.min ?? '',
    link: b.link ?? null,
    weekOnly: Boolean(b.weekOnly),
    custom: Boolean(b.custom),
    ...(track ? lockInfo(ctx.stages, b.stage, date) : { locked: false, unlockDate: null }),
  };
}

// All blocks of one date, sorted by start time. Each block:
//   { id, key, date, title, note, category, start, end, track, counts, stage, min,
//     locked, unlockDate, weekOnly, moved, movedFrom }
export function blocksForDate(ctx, date, opts = {}) {
  const cacheKey = opts.ignoreMoves ? `${date}!` : date;
  if (!ctx._cache) ctx._cache = new Map();
  if (ctx._cache.has(cacheKey)) return ctx._cache.get(cacheKey);

  const dsh = ctx.program.dayStartHour;
  const weekday = dow(date);
  const phase = phaseFor(ctx.program, ctx.settings, date) ?? phaseWindows(ctx.program, ctx.settings)[0];
  const anchors = resolveAnchors(ctx.settings, weekday, dsh);
  const ramadan = Boolean(ctx.settings.ramadan?.on);
  const week = ctx.weekOverrides?.[mondayOf(date)] ?? {};
  const out = [];

  const consider = (base, extra) => {
    let b = base;
    const patch = week.patches?.[b.id];
    if (patch) b = { ...b, ...patch, weekOnly: true };
    if (b.phases && !b.phases.includes(phase.id)) return;
    const po = b.phaseOverrides?.[phase.id];
    if (po) b = { ...b, ...po };
    if (b.when === 'ramadan' && !ramadan) return;
    if (b.when === 'normal' && ramadan) return;
    if (!daysOf(b, ctx.settings).includes(weekday)) return;
    const inst = instantiate(ctx, b, date, anchors);
    if (inst) out.push(extra ? { ...inst, ...extra } : inst);
  };

  for (const b of ctx.blocks) {
    if (week.removed?.includes(b.id)) continue;
    consider(b);
  }
  for (const b of week.added ?? []) consider(b, { weekOnly: true, custom: true });

  if (!opts.ignoreMoves) {
    for (const m of week.moves ?? []) {
      if (m.from === date) {
        const i = out.findIndex((x) => x.id === m.id && !x.movedFrom);
        if (i < 0) continue;
        if (m.to === date) {
          const len = out[i].end - out[i].start;
          const start = resolveTime(m.start, anchors, dsh) ?? out[i].start;
          out[i] = { ...out[i], start, end: start + len, moved: true };
        } else {
          out.splice(i, 1);
        }
      } else if (m.to === date) {
        const src = blocksForDate(ctx, m.from, { ignoreMoves: true }).find((x) => x.id === m.id);
        if (!src) continue;
        const len = src.end - src.start;
        const start = resolveTime(m.start, anchors, dsh) ?? src.start;
        out.push({
          ...src,
          date,
          key: `${src.id}~${m.from}`,
          start,
          end: start + len,
          moved: true,
          movedFrom: m.from,
          ...(src.track ? lockInfo(ctx.stages, src.stage, date) : {}),
        });
      }
    }
  }

  out.sort((a, b) => a.start - b.start || a.end - b.end);
  ctx._cache.set(cacheKey, out);
  return out;
}

// Habits without a clock time that apply on this date (Today shows them as a checklist).
export function dailyHabitsForDate(ctx, date) {
  const weekday = dow(date);
  return ctx.habits.dos
    .filter((hb) => hb.daily && daysOf(hb, ctx.settings).includes(weekday))
    .map((hb) => ({ ...hb, key: `h:${hb.id}`, ...lockInfo(ctx.stages, hb.stage, date) }));
}

// The don'ts that are live on this date (unlocked, right weekday, not a system rule).
export function activeDonts(ctx, date) {
  const weekday = dow(date);
  return ctx.habits.donts.filter(
    (d) => !d.system && daysOf(d, ctx.settings).includes(weekday) && !lockInfo(ctx.stages, d.stage, date).locked,
  );
}

// Three don'ts for the evening check. They rotate from day to day so each one comes back regularly.
export function dontsForDate(ctx, date, count = 3) {
  const pool = activeDonts(ctx, date);
  if (pool.length <= count) return pool;
  const n = diffDays(ctx.program.startDate, date);
  const first = (((n * count) % pool.length) + pool.length) % pool.length;
  return Array.from({ length: count }, (_, i) => pool[(first + i) % pool.length]);
}

// What is happening at `minutes`, and what comes after.
// When blocks are nested (lunch inside work) the one that started last wins.
export function nowNext(blocks, minutes) {
  const live = blocks.filter((b) => !b.locked);
  const current = live
    .filter((b) => b.start <= minutes && minutes < b.end)
    .sort((a, b) => b.start - a.start || a.end - b.end)[0] ?? null;
  const next = live.filter((b) => b.start > minutes).sort((a, b) => a.start - b.start)[0] ?? null;
  return { current, next };
}

// Tracked, unlocked blocks of one day that overlap in time. Returns a Set of block keys.
// (Work and free time are not tracked, so lunch inside work is not a clash.)
export function clashes(blocks) {
  const list = blocks.filter((b) => b.track && !b.locked);
  const out = new Set();
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (list[i].start < list[j].end && list[j].start < list[i].end) {
        out.add(list[i].key);
        out.add(list[j].key);
      }
    }
  }
  return out;
}

// Water target in ml for a date: base, plus extra on training days.
export function waterTarget(ctx, date) {
  const training = blocksForDate(ctx, date).some((b) => b.category === 'body' && b.track && !b.locked && b.counts);
  const cfg = ctx.water ?? { baseMl: 3000, trainingExtraMl: 500 };
  return cfg.baseMl + (training ? cfg.trainingExtraMl : 0);
}
