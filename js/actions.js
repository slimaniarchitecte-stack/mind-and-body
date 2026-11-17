// Changes that several screens need (marking a block, moving it, editing one week).

import { store } from './store.js';
import * as clock from './clock.js';
import { mondayOf, fmtHM } from './core/dates.js';

// status: 'done' | 'min' | 'skip' | null (null clears it).
export function setStatus(date, key, status, extra = {}, opts) {
  return store.updateDay(date, (d) => {
    if (!status) delete d.items[key];
    else d.items[key] = { s: status, ...extra, at: clock.now().toISOString() };
  }, opts);
}

// Mark a block as kept unless it already has a status (used when a log is saved).
export function markKept(date, key, opts) {
  if (store.day(date).items[key]) return Promise.resolve();
  return setStatus(date, key, store.day(date).badDay ? 'min' : 'done', { auto: true }, opts);
}

// Change the "this week only" layer of one week. fn receives { patches, added, removed, moves }.
export function updateWeek(monday, fn, opts) {
  const all = { ...store.kv('weekOverrides', {}) };
  const week = { patches: {}, added: [], removed: [], moves: [], ...JSON.parse(JSON.stringify(all[monday] ?? {})) };
  fn(week);
  all[monday] = week;
  return store.setKV('weekOverrides', all, opts);
}

// Move one occurrence of a block to another day or time of the same week.
//   origin: the date the template puts it on. to: the new date. start: 'HH:MM'.
export function moveBlock(id, origin, to, start) {
  return updateWeek(mondayOf(origin), (week) => {
    week.moves = week.moves.filter((m) => !(m.id === id && m.from === origin));
    week.moves.push({ id, from: origin, to, start });
  });
}

// Save a replan of one day: new times (this week only) and skipped blocks.
// Returns a function that undoes it.
//   moved: [{ block, start }]   skipped: [block]   reason: text for the skips
export async function applyReplan(date, { moved = [], skipped = [], reason = 'Plans changed' }) {
  const monday = mondayOf(date);
  const beforeWeek = JSON.parse(JSON.stringify(store.kv('weekOverrides', {})[monday] ?? null));
  const beforeItems = JSON.parse(JSON.stringify(store.day(date).items));
  const at = clock.now().toISOString();
  await store.updateDay(date, (d) => {
    for (const b of skipped) d.items[b.key] = { s: 'skip', reason, replan: true, at };
  }, { silent: true });
  await updateWeek(monday, (week) => {
    for (const { block, start } of moved) {
      const origin = block.movedFrom ?? date;
      week.moves = week.moves.filter((m) => !(m.id === block.id && m.from === origin));
      week.moves.push({ id: block.id, from: origin, to: date, start: fmtHM(start), replan: true });
    }
  });
  return async () => {
    const all = { ...store.kv('weekOverrides', {}) };
    if (beforeWeek) all[monday] = beforeWeek;
    else delete all[monday];
    await store.updateDay(date, (d) => { d.items = beforeItems; }, { silent: true });
    await store.setKV('weekOverrides', all);
  };
}

// Put a day back to its usual plan: remove the replan moves and the replan skips.
export async function resetReplan(date) {
  await store.updateDay(date, (d) => {
    for (const [key, rec] of Object.entries(d.items)) if (rec.replan) delete d.items[key];
  }, { silent: true });
  await updateWeek(mondayOf(date), (week) => {
    week.moves = week.moves.filter((m) => !(m.replan && m.to === date));
  });
}

export function hasReplan(date) {
  const week = store.kv('weekOverrides', {})[mondayOf(date)];
  return Boolean(week?.moves?.some((m) => m.replan && m.to === date)) || Object.values(store.day(date).items).some((r) => r.replan);
}

export function unmoveBlock(id, origin) {
  return updateWeek(mondayOf(origin), (week) => {
    week.moves = week.moves.filter((m) => !(m.id === id && m.from === origin));
  });
}
