// The app state: program defaults + my data, kept in memory and saved to IndexedDB.
// Screens read from here and call the update functions; every change tells the listeners.

import { db } from './db.js';
import { loadProgram, applyLayer, deepMerge } from './program.js';
import { resolveStages } from './core/unlock.js';
import * as clock from './clock.js';

export const SCHEMA = 1;

const listeners = new Set();
const state = {
  data: null,          // the files from data/
  kv: {},              // settings, overrides, weekOverrides, unlocks, meta, small lists
  days: new Map(),     // date -> day record
  records: new Map(),  // id -> record
};
let ctxCache = null;
let settingsCache = null;

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function emptyDay(date) {
  return { date, items: {}, badDay: false, water: 0, protein: [false, false, false, false], donts: {}, journal: { win: '', lesson: '', priority: '' } };
}

function invalidate() {
  ctxCache = null;
  settingsCache = null;
}

function emit(what) {
  for (const fn of listeners) fn(what);
}

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const store = {
  state,
  uid,

  async init() {
    state.data = await loadProgram();
    await db.open();
    state.kv = await db.entries('kv');
    for (const d of await db.all('days')) state.days.set(d.date, d);
    for (const r of await db.all('records')) state.records.set(r.id, r);
    if (!state.kv.meta) await this.setKV('meta', { schema: SCHEMA, createdAt: clock.now().toISOString() }, { silent: true });
    invalidate();
  },

  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  get persistent() {
    return db.persistent;
  },

  // ---- settings -------------------------------------------------------------

  get settings() {
    settingsCache ??= deepMerge(state.data.program.settings, state.kv.settings ?? {});
    return settingsCache;
  },

  async setSettings(patch, opts) {
    await this.setKV('settings', deepMerge(state.kv.settings ?? {}, patch), opts);
  },

  // ---- key / value ----------------------------------------------------------

  kv(key, fallback) {
    return state.kv[key] ?? fallback;
  },

  async setKV(key, value, { silent = false } = {}) {
    state.kv[key] = value;
    invalidate();
    await db.put('kv', clone(value), key);
    if (!silent) emit(key);
  },

  // ---- program + my edits ---------------------------------------------------

  // Everything the core logic needs, merged. Rebuilt only after a change.
  ctx() {
    if (ctxCache) return ctxCache;
    const d = state.data;
    const ov = state.kv.overrides ?? {};
    const program = {
      ...d.program,
      ...(ov.program ?? {}),
      stages: applyLayer(d.program.stages, ov.stages),
    };
    const dos = [...applyLayer(d.habits.dos, ov.dos)];
    // The optional module I switched on in Mind (chess or Spanish) shows up as a habit on Today.
    // It never counts in the adherence, it is an extra.
    const optional = d.mind?.optional?.find((o) => o.id === state.kv.optional?.active);
    if (optional) {
      dos.push({
        id: `opt-${optional.id}`, title: `${optional.title}, ${optional.minutes} min`, detail: optional.about,
        stage: 's5', daily: true, days: [1, 2, 3, 4, 5, 6, 7], counts: false, min: optional.min, category: 'mind', optional: true,
      });
    }
    ctxCache = {
      program,
      settings: this.settings,
      blocks: applyLayer(d.schedule.blocks, ov.blocks),
      habits: { dos, donts: applyLayer(d.habits.donts, ov.donts) },
      weekOverrides: state.kv.weekOverrides ?? {},
      stages: resolveStages(program, state.kv.unlocks ?? {}),
      water: d.nutrition?.water,
    };
    return ctxCache;
  },

  // One list of the program with my edits, for example list('tracks', 'tracks').
  list(file, key) {
    const ov = state.kv.overrides ?? {};
    return applyLayer(state.data[file]?.[key] ?? [], ov[key]);
  },

  async setLayer(key, layer, opts) {
    await this.setKV('overrides', { ...(state.kv.overrides ?? {}), [key]: layer }, opts);
  },

  layer(key) {
    return (state.kv.overrides ?? {})[key];
  },

  // ---- days -----------------------------------------------------------------

  // Never returns undefined: a date with nothing logged gives an empty record.
  day(date) {
    return state.days.get(date) ?? emptyDay(date);
  },

  getDay: (date) => state.days.get(date),

  async updateDay(date, mutate, { silent = false } = {}) {
    const next = clone(this.day(date));
    mutate(next);
    next.updatedAt = clock.now().toISOString();
    state.days.set(date, next);
    await db.put('days', next);
    if (!silent) emit('days');
  },

  // Every weigh-in, oldest first: [{ date, kg }].
  weights() {
    const out = [];
    for (const d of state.days.values()) if (typeof d.weight === 'number') out.push({ date: d.date, kg: d.weight });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  },

  // ---- records (logs and lists) ----------------------------------------------

  // All records of one type, newest first.
  records(type) {
    const out = [];
    for (const r of state.records.values()) if (r.type === type) out.push(r);
    return out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  },

  record(id) {
    return state.records.get(id);
  },

  async putRecord(rec, { silent = false } = {}) {
    const next = clone(rec);
    if (!next.id) next.id = uid(next.type ?? 'rec');
    next.createdAt ??= clock.now().toISOString();
    next.updatedAt = clock.now().toISOString();
    state.records.set(next.id, next);
    await db.put('records', next);
    if (!silent) emit('records');
    return next;
  },

  async deleteRecord(id, { silent = false } = {}) {
    state.records.delete(id);
    await db.del('records', id);
    if (!silent) emit('records');
  },

  // ---- everything at once (backup, import, reset) --------------------------------

  // A plain copy of all my data, without the photos (they live in their own store).
  snapshot() {
    return clone({ kv: state.kv, days: [...state.days.values()], records: [...state.records.values()] });
  },

  // Replace everything in memory and in IndexedDB with `data` ({ kv, days, records }).
  async replaceAll(data) {
    await Promise.all([db.clear('kv'), db.clear('days'), db.clear('records')]);
    state.kv = {};
    state.days = new Map();
    state.records = new Map();
    for (const [key, value] of Object.entries(data.kv ?? {})) {
      state.kv[key] = value;
      await db.put('kv', clone(value), key);
    }
    for (const d of data.days ?? []) state.days.set(d.date, d);
    for (const r of data.records ?? []) state.records.set(r.id, r);
    await db.putMany('days', clone(data.days ?? []));
    await db.putMany('records', clone(data.records ?? []));
    if (!state.kv.meta) await this.setKV('meta', { schema: SCHEMA, createdAt: clock.now().toISOString() }, { silent: true });
    invalidate();
    emit('all');
  },

  // Delete all my data, photos included. The program files in data/ are not touched.
  async clearAll() {
    await db.clear('photos');
    await this.replaceAll({ kv: {}, days: [], records: [] });
  },
};
