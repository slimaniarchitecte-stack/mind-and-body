// Changes that several screens need (marking a block, moving it, editing one week).

import { store } from './store.js';
import * as clock from './clock.js';
import { mondayOf } from './core/dates.js';

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

export function unmoveBlock(id, origin) {
  return updateWeek(mondayOf(origin), (week) => {
    week.moves = week.moves.filter((m) => !(m.id === id && m.from === origin));
  });
}
