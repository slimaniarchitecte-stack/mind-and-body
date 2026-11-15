// Progressive unlock: stages open one after the other, only when the active items hold.
//
// program.stages is the planned schedule. `unlocks` is what really happened:
//   { s2: { activatedOn: '2026-11-30', forced: false, notBefore: '2026-12-07', checks: [...] } }

import { addDays, mondayOnOrAfter } from './dates.js';

const later = (a, b) => (a > b ? a : b);

// Returns { s1: { ...stage, active, activatedOn, due, forced }, ... }.
// `due` is the date the next check happens. A stage is never due less than
// minGapDays after the previous one, so a late stage pushes the following ones.
export function resolveStages(program, unlocks = {}) {
  const cfg = program.unlock;
  const out = {};
  let prev = null;
  for (const stage of program.stages) {
    const u = unlocks[stage.id] ?? {};
    let info;
    if (!prev) {
      const on = u.activatedOn ?? stage.date;
      info = { ...stage, active: true, activatedOn: on, due: on, forced: false, checks: [] };
    } else {
      let due = stage.date;
      if (u.notBefore) due = later(due, u.notBefore);
      due = later(due, addDays(prev.active ? prev.activatedOn : prev.due, cfg.minGapDays));
      due = mondayOnOrAfter(due);
      info = {
        ...stage,
        active: Boolean(u.activatedOn),
        activatedOn: u.activatedOn ?? null,
        due,
        forced: Boolean(u.forced),
        checks: u.checks ?? [],
      };
    }
    out[stage.id] = info;
    prev = info;
  }
  return out;
}

// The first stage that is not active yet, or null when everything is unlocked.
export function nextLockedStage(stages) {
  return Object.values(stages).find((s) => !s.active) ?? null;
}

// Is an item of this stage live on this date?
export function lockInfo(stages, stageId, date) {
  const st = stageId ? stages?.[stageId] : null;
  if (!st) return { locked: false, unlockDate: null };
  if (st.active && date >= st.activatedOn) return { locked: false, unlockDate: st.activatedOn };
  return { locked: true, unlockDate: st.active ? st.activatedOn : st.due };
}

// Decide what to do with the next locked stage today.
//   pct: adherence (0..1, or null when nothing was due) on the active items over the last windowDays.
// Returns null when there is nothing to decide, or
//   { stage, action: 'activate' | 'postpone', pct, unlocks }  with the updated unlock record.
export function evaluateUnlock(program, unlocks, today, pct) {
  const cfg = program.unlock;
  const stages = resolveStages(program, unlocks);
  const stage = nextLockedStage(stages);
  if (!stage || today < stage.due) return null;

  const u = { ...(unlocks[stage.id] ?? {}) };
  const checks = [...(u.checks ?? [])];
  const pass = pct != null && pct >= cfg.threshold;
  checks.push({ date: today, pct, pass });
  if (pass) {
    return {
      stage, action: 'activate', pct,
      unlocks: { ...unlocks, [stage.id]: { ...u, activatedOn: today, forced: false, checks } },
    };
  }
  return {
    stage, action: 'postpone', pct,
    unlocks: { ...unlocks, [stage.id]: { ...u, notBefore: addDays(today, cfg.postponeDays), checks } },
  };
}

// Unlock now, whatever the adherence says. The UI shows a clear warning first.
export function forceUnlock(unlocks, stageId, today) {
  const u = unlocks[stageId] ?? {};
  return { ...unlocks, [stageId]: { ...u, activatedOn: today, forced: true } };
}

// Put a stage back to locked (undo a forced unlock).
export function relock(unlocks, stageId) {
  const u = { ...(unlocks[stageId] ?? {}) };
  delete u.activatedOn;
  delete u.forced;
  return { ...unlocks, [stageId]: u };
}
