import { test, assert } from './harness.js';
import { makeCtx, days, keepAll } from './fixture.js';
import { addDays } from '../js/core/dates.js';
import { trackedItems, itemStatus, dayStats, adherence, adherenceLast, missedTwice, streak } from '../js/core/adherence.js';

const MON = '2026-11-16';
const TUE = '2026-11-17';
const WED = '2026-11-18';
const THU = '2026-11-19';
const FRI = '2026-11-20';
const SUN = '2026-11-22';

const keys = (ctx, date) => trackedItems(ctx, date).filter((it) => it.counts).map((it) => it.key).sort();

// Every tracked item kept, from `from` to `to`.
function allKept(ctx, from, to, except = () => false) {
  const records = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const items = trackedItems(ctx, d).filter((it) => !except(it, d));
    records.push(keepAll(items, d));
  }
  return days(...records);
}

test('adherence: what counts in week 1', async () => {
  const ctx = await makeCtx();
  assert.deepEqual(keys(ctx, MON), ['breakfast', 'journal', 'lights-out', 'lunchbox', 'wake']);
  assert.deepEqual(keys(ctx, TUE), ['breakfast', 'journal', 'lights-out', 'lunchbox', 'muaythai', 'wake']);
  assert.deepEqual(keys(ctx, SUN), ['breakfast', 'journal', 'lights-out', 'pfe-sun', 'review', 'wake']);
  assert.ok(trackedItems(ctx, SUN).some((it) => it.id === 'football' && !it.counts), 'football can be logged but never counts');
  assert.deepEqual(trackedItems(ctx, '2026-11-15'), [], 'nothing is due before the start');
});

test('adherence: minimum counts as kept, skipped and not logged do not', async () => {
  const ctx = await makeCtx();
  const day = { date: MON, items: { wake: { s: 'done' }, breakfast: { s: 'done' }, lunchbox: { s: 'min' }, journal: { s: 'skip', reason: 'Tired' } } };
  const s = dayStats(ctx, MON, day);
  assert.equal(s.due, 5);
  assert.equal(s.kept, 3);
  assert.equal(s.done, 2);
  assert.equal(s.min, 1);
  assert.equal(s.skipped, 1);
  assert.equal(s.open, 1);
  assert.close(s.pct, 0.6);
  assert.deepEqual(s.byCategory.food, { due: 2, kept: 2 });
  assert.deepEqual(s.byCategory.mind, { due: 3, kept: 1 });
});

test('adherence: percentages over a period', async () => {
  const ctx = await makeCtx();
  const perfect = adherence(ctx, allKept(ctx, MON, SUN), MON, SUN);
  assert.equal(perfect.pct, 1);
  assert.equal(perfect.due, 5 + 6 + 6 + 6 + 5 + 6 + 6);
  const empty = adherence(ctx, days(), MON, SUN);
  assert.equal(empty.pct, 0, 'days that were never logged count as missed');
  assert.equal(adherence(ctx, days(), '2026-11-09', '2026-11-15').pct, null, 'nothing due, no percentage');
  const noJournal = adherence(ctx, allKept(ctx, MON, SUN, (it) => it.id === 'journal'), MON, SUN);
  assert.close(noJournal.pct, (40 - 7) / 40);
  const onlyJournal = adherence(ctx, allKept(ctx, MON, SUN, (it) => it.id === 'journal'), MON, SUN, (it) => it.id === 'journal');
  assert.equal(onlyJournal.due, 7);
  assert.equal(onlyJournal.kept, 0);
});

test('adherence: the last 7 days end yesterday', async () => {
  const ctx = await makeCtx();
  const getDay = allKept(ctx, MON, WED);
  const r = adherenceLast(ctx, getDay, THU, 7);
  assert.equal(r.pct, 1, 'only Monday to Wednesday were due, and all were kept');
  assert.equal(r.due, 5 + 6 + 6);
});

test('never miss twice: one miss is neutral, two in a row raise the flag', async () => {
  const ctx = await makeCtx();
  const once = allKept(ctx, MON, TUE, (it, d) => it.id === 'journal' && d === TUE);
  assert.deepEqual(missedTwice(ctx, once, WED).map((m) => m.id), []);
  const twice = allKept(ctx, MON, TUE, (it) => it.id === 'journal');
  const flagged = missedTwice(ctx, twice, WED);
  assert.deepEqual(flagged.map((m) => m.id), ['journal']);
  assert.equal(flagged[0].dueToday, true);
  assert.equal(flagged[0].key, 'journal');
});

test('never miss twice: keeping it today, even the minimum, clears the flag', async () => {
  const ctx = await makeCtx();
  const base = allKept(ctx, MON, TUE, (it) => it.id === 'journal');
  const withToday = (date) => (date === WED ? { date: WED, items: { journal: { s: 'min' } } } : base(date));
  assert.deepEqual(missedTwice(ctx, withToday, WED).map((m) => m.id), []);
  const skippedToday = (date) => (date === WED ? { date: WED, items: { journal: { s: 'skip' } } } : base(date));
  assert.ok(missedTwice(ctx, skippedToday, WED).some((m) => m.id === 'journal'), 'skipping again keeps the flag');
});

test('never miss twice: for Muay Thai it means two sessions in a row', async () => {
  const ctx = await makeCtx();
  const oneMissed = allKept(ctx, MON, THU, (it, d) => it.id === 'muaythai' && d === TUE);
  assert.deepEqual(missedTwice(ctx, oneMissed, FRI).map((m) => m.id), []);
  const bothMissed = allKept(ctx, MON, THU, (it) => it.id === 'muaythai');
  const flagged = missedTwice(ctx, bothMissed, FRI);
  assert.deepEqual(flagged.map((m) => m.id), ['muaythai']);
  assert.equal(flagged[0].dueToday, false);
});

test('adherence: the water habit ticks itself from the counter', async () => {
  const ctx = await makeCtx({ unlocks: { s2: { activatedOn: '2026-11-30' } } });
  const date = '2026-12-01';
  const water = trackedItems(ctx, date).find((it) => it.id === 'h:water-target');
  assert.ok(water, 'unlocked with stage 2');
  assert.equal(itemStatus(ctx, { date, water: 3500 }, water, date), 'done', 'Tuesday is a training day: 3.5 L');
  assert.equal(itemStatus(ctx, { date, water: 3000 }, water, date), 'min');
  assert.equal(itemStatus(ctx, { date, water: 2000 }, water, date), 'min');
  assert.equal(itemStatus(ctx, { date, water: 1750 }, water, date), null);
  assert.ok(!trackedItems(ctx, '2026-11-29').some((it) => it.id === 'h:water-target'), 'still locked the day before');
});

test('streak: one miss per week does not reset it', async () => {
  const ctx = await makeCtx();
  const onlyJournal = (it) => it.id === 'journal';
  const oneMiss = allKept(ctx, MON, SUN, (it, d) => it.id === 'journal' && d === WED);
  assert.equal(streak(ctx, oneMiss, '2026-11-23', onlyJournal), 6);
  const twoMisses = allKept(ctx, MON, SUN, (it, d) => it.id === 'journal' && (d === WED || d === FRI));
  assert.equal(streak(ctx, twoMisses, '2026-11-23', onlyJournal), 3, 'the second miss of the week stops the count: Sat, Sun, and Thu before it');
  const perfect = allKept(ctx, MON, SUN);
  assert.equal(streak(ctx, perfect, '2026-11-23', onlyJournal), 7);
});
