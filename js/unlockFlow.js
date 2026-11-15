// The unlock check: when the date of the next stage arrives, look at the adherence of the
// last 14 days. 80% or more activates the stage. Under 80% postpones it by one week.

import { store } from './store.js';
import * as clock from './clock.js';
import { appDate, addDays } from './core/dates.js';
import { evaluateUnlock, forceUnlock, relock, nextLockedStage } from './core/unlock.js';
import { adherence } from './core/adherence.js';

// Adherence on the active items over the unlock window (the 14 days before today).
export function gateAdherence(ctx, today) {
  const n = ctx.program.unlock.windowDays;
  return adherence(ctx, store.getDay, addDays(today, -n), addDays(today, -1));
}

// Runs at app start and when the app comes back to the front. Returns true when a stage was checked.
export async function runUnlockCheck() {
  const ctx = store.ctx();
  const today = appDate(clock.now(), ctx.program.dayStartHour);
  if (today < ctx.program.startDate) return false;
  const stage = nextLockedStage(ctx.stages);
  if (!stage || today < stage.due) return false;
  const pct = gateAdherence(ctx, today).pct;
  const result = evaluateUnlock(ctx.program, store.kv('unlocks', {}), today, pct);
  if (!result) return false;
  await store.setKV('unlocks', result.unlocks, { silent: true });
  await store.setKV('unlockNotice', { stageId: result.stage.id, action: result.action, pct, date: today });
  return true;
}

// Unlock a stage now, against the rule. The screens ask for a clear confirmation first.
export async function forceStage(stageId) {
  const ctx = store.ctx();
  const today = appDate(clock.now(), ctx.program.dayStartHour);
  await store.setKV('unlocks', forceUnlock(store.kv('unlocks', {}), stageId, today), { silent: true });
  await store.setKV('unlockNotice', { stageId, action: 'forced', pct: gateAdherence(ctx, today).pct, date: today });
}

export async function relockStage(stageId) {
  await store.setKV('unlockNotice', null, { silent: true });
  await store.setKV('unlocks', relock(store.kv('unlocks', {}), stageId));
}

export const FORCE_WARNING = 'This adds new habits before the current ones hold. It is the exact pattern this program protects you from: many changes at once, two good weeks, then back to zero. Waiting one week costs nothing.';
