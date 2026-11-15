// Builds the same context the app uses, straight from the files in data/, for the tests.

import { loadJSON } from './harness.js';
import { resolveStages } from '../js/core/unlock.js';

let files = null;

async function load() {
  if (!files) {
    const [program, schedule, habits, training, nutrition] = await Promise.all([
      loadJSON('data/program.json'), loadJSON('data/schedule.json'), loadJSON('data/habits.json'),
      loadJSON('data/training.json'), loadJSON('data/nutrition.json'),
    ]);
    files = { program, schedule, habits, training, nutrition };
  }
  return files;
}

// options: { settings, unlocks, weekOverrides } to change the defaults for one test.
export async function makeCtx(options = {}) {
  const f = await load();
  const settings = { ...structuredClone(f.program.settings), ...(options.settings ?? {}) };
  return {
    program: f.program,
    settings,
    blocks: f.schedule.blocks,
    habits: f.habits,
    weekOverrides: options.weekOverrides ?? {},
    stages: resolveStages(f.program, options.unlocks ?? {}),
    water: f.nutrition.water,
  };
}

// The raw files from data/, for tests that read the program content itself.
export const dataFiles = () => load();

// A day store for tests: days(record, record, ...) returns the getDay function.
export function days(...records) {
  const map = new Map(records.map((r) => [r.date, r]));
  return (date) => map.get(date);
}

// Mark every tracked item of a date as kept.
export function keepAll(items, date, status = 'done') {
  return { date, items: Object.fromEntries(items.map((it) => [it.key, { s: status }])), water: 4000 };
}
