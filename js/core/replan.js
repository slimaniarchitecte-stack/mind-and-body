// Replan the rest of a day when it does not go as planned. No AI: a few clear rules.
//
// Fixed blocks never move: work and the commute, Muay Thai, football, the urbanism session,
// the evening routine tied to bedtime, and anything inside work (the lunchbox).
// Flexible blocks (PFE, Learn, home training, meals at home, Rotaract ...) keep their order and
// are placed again around the fixed ones. What no longer fits before the evening routine is
// dropped, and marked skipped with a reason so the numbers stay honest.

// Times tied to Settings (work, Muay Thai, football, bedtime) are fixed; tied to waking up is not.
const ANCHORED = /^@(?!wake\b)/;

function kindOf(b, template) {
  if (b.locked) return 'ignore';
  if (b.category === 'free' && !b.track) return 'ignore';
  const expr = template?.start;
  if (typeof expr === 'string' && ANCHORED.test(expr.trim())) return 'fixed';
  if (!b.track && (b.category === 'work' || b.category === 'community')) return 'fixed';
  return 'flex';
}

// Each block of the day with its kind: 'fixed' | 'flex' | 'ignore'.
export function classify(blocks, templates) {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const out = blocks.map((b) => ({ b, kind: kindOf(b, byId.get(b.id)), bedtime: /^@sleep\b/.test(String(byId.get(b.id)?.start ?? '')) }));
  // A flexible block inside an untracked fixed one (lunch inside work) stays where it is.
  const containers = out.filter((x) => x.kind === 'fixed' && !x.b.track);
  for (const x of out) {
    if (x.kind === 'flex' && containers.some((c) => c.b.start <= x.b.start && x.b.end <= c.b.end)) x.kind = 'fixed';
  }
  return out;
}

// The latest time flexible blocks may end: the start of the evening routine.
export function dayEndOf(classified) {
  const bed = classified.filter((x) => x.bedtime).map((x) => x.b.start);
  if (bed.length) return Math.min(...bed);
  return Math.max(24 * 60, ...classified.map((x) => x.b.end));
}

function overlaps(s, e, list) {
  return list.find((x) => s < x.end && x.start < e) ?? null;
}

// The main rule: nothing can happen between now and busyUntil. Flexible blocks in the way move
// to the first free slot after it, in their order; later blocks move only if they get pushed.
//   now:        minutes since midnight
//   statusOf:   key -> 'done' | 'min' | 'skip' | null
//   busyUntil:  "running 30 min late" is now + 30; "busy until 19:30" is 19:30
//   markMissed: fixed blocks inside the busy time (Muay Thai ...) cannot happen. When I am only
//               running late I may still go, so then they are left alone.
// Returns { moved: [{ block, start }], dropped: [block], missed: [block], dayEnd }.
export function replanDay(blocks, templates, { now, statusOf, busyUntil, markMissed = true }) {
  const cls = classify(blocks, templates);
  const dayEnd = dayEndOf(cls);
  const open = (b) => !statusOf(b.key);

  const busy = cls.filter((x) => x.kind === 'fixed').map((x) => ({ start: x.b.start, end: x.b.end }));
  const missed = [];
  if (busyUntil > now) {
    busy.push({ start: now, end: busyUntil });
    if (markMissed) {
      for (const x of cls) {
        if (x.kind === 'fixed' && x.b.track && open(x.b) && x.b.start < busyUntil && x.b.end > now) missed.push(x.b);
      }
    }
  }
  busy.sort((a, b) => a.start - b.start);
  const missedKeys = new Set(missed.map((b) => b.key));
  const free = busy.filter((x) => !blocks.some((b) => missedKeys.has(b.key) && b.start === x.start && b.end === x.end));

  const movable = cls
    .filter((x) => x.kind === 'flex' && open(x.b) && x.b.end > now)
    .map((x) => x.b)
    .sort((a, b) => a.start - b.start);

  const moved = [];
  const dropped = [];
  let cursor = -Infinity;
  for (const b of movable) {
    const len = b.end - b.start;
    let s = Math.max(b.start, cursor);
    if (s < now) s = now;
    for (let hit = overlaps(s, s + len, free); hit; hit = overlaps(s, s + len, free)) s = hit.end;
    if (s + len > dayEnd) {
      dropped.push(b);
      continue;
    }
    if (s !== b.start) moved.push({ block: b, start: s });
    cursor = s + len;
  }
  return { moved, dropped, missed, dayEnd };
}

// "I have free time now": bring the next open flexible block forward to now, if it fits.
export function pullForward(blocks, templates, { now, statusOf }) {
  const cls = classify(blocks, templates);
  const dayEnd = dayEndOf(cls);
  const next = cls
    .filter((x) => x.kind === 'flex' && x.b.track && !statusOf(x.b.key) && x.b.start > now)
    .sort((a, b) => a.b.start - b.b.start)[0]?.b;
  if (!next) return { moved: [], reason: 'nothing' };
  const len = next.end - next.start;
  const others = cls
    .filter((x) => x.b.key !== next.key && x.kind !== 'ignore' && x.b.end > now)
    .map((x) => ({ start: x.b.start, end: x.b.end }));
  if (overlaps(now, now + len, others) || now + len > dayEnd) return { moved: [], reason: 'nofit', block: next };
  return { moved: [{ block: next, start: now }], reason: null, block: next };
}

// "Day off": every open tracked block that is not over yet.
export function restOfDay(blocks, { now, statusOf }) {
  return blocks.filter((b) => b.track && !b.locked && !statusOf(b.key) && b.end > now);
}
