import { test, assert } from './harness.js';
import { makeCtx, days } from './fixture.js';
import { MONEY_CATS, catOf, daysInMonth, monthMoney, spentBetween } from '../js/core/money.js';
import { PFE_STARTER, pfeProgress } from '../js/core/pfe.js';
import { weekSoFar, sessionCount, keptMinutes, TRAINING_BLOCKS } from '../js/core/stats.js';
import { adherence } from '../js/core/adherence.js';

const spends = [
  { date: '2026-11-02', amount: 120 },                       // saved before categories: food
  { date: '2026-11-05', amount: 50, cat: 'transport' },
  { date: '2026-11-15', amount: '30.5', cat: 'going-out' },
  { date: '2026-11-15', amount: 20, cat: 'something-old' },  // unknown category: other
  { date: '2026-10-31', amount: 999, cat: 'food' },          // another month
];

test('money: old spending counts as food, unknown categories as other', () => {
  assert.equal(catOf({}), 'food');
  assert.equal(catOf({ cat: 'phone' }), 'phone');
  assert.equal(catOf({ cat: 'xyz' }), 'other');
  assert.equal(MONEY_CATS[0].id, 'food');
});

test('money: days in a month', () => {
  assert.equal(daysInMonth('2026-11'), 30);
  assert.equal(daysInMonth('2027-02'), 28);
  assert.equal(daysInMonth('2028-02'), 29);
});

test('money: the month in numbers', () => {
  const m = monthMoney(spends, '2026-11', 3000, '2026-11-15');
  assert.equal(m.total, 220.5);
  assert.equal(m.byCat.food, 120);
  assert.equal(m.byCat.transport, 50);
  assert.equal(m.byCat['going-out'], 30.5);
  assert.equal(m.byCat.other, 20);
  assert.equal(m.left, 2779.5);
  assert.equal(m.daysLeft, 16, 'the 15th to the 30th, today included');
  assert.equal(m.perDay, 2779.5 / 16);
});

test('money: no income, or over the income', () => {
  const none = monthMoney(spends, '2026-11', null, '2026-11-15');
  assert.equal(none.left, null);
  assert.equal(none.perDay, null);
  const over = monthMoney(spends, '2026-11', 200, '2026-11-30');
  assert.equal(over.left, -20.5);
  assert.equal(over.perDay, 0, 'never a negative amount per day');
  assert.equal(over.daysLeft, 1);
});

test('money: spent between two dates', () => {
  assert.equal(spentBetween(spends, '2026-11-09', '2026-11-15'), 50.5);
  assert.equal(spentBetween(spends, '2026-11-01', '2026-11-30'), 220.5);
});

test('pfe: progress, next step and late steps', () => {
  const steps = [
    { id: 'a', title: 'Site', done: true, due: '2026-11-10' },
    { id: 'b', title: 'Concept', done: false, due: '2026-11-20' },
    { id: 'c', title: 'Plans', done: false, due: '2026-11-12' },
    { id: 'd', title: 'Panels', done: false, due: null },
  ];
  const p = pfeProgress(steps, '2026-11-15', '2027-06-15');
  assert.equal(p.total, 4);
  assert.equal(p.done, 1);
  assert.equal(p.pct, 0.25);
  assert.equal(p.next.id, 'c', 'the open step due first');
  assert.equal(p.late, 1);
  assert.equal(p.daysToDeadline, 212);
});

test('pfe: without dates, the next step is the first open one', () => {
  const p = pfeProgress([{ id: 'a', done: true }, { id: 'b', done: false }, { id: 'c', done: false }], '2026-11-15', null);
  assert.equal(p.next.id, 'b');
  assert.equal(p.daysToDeadline, null);
  assert.equal(pfeProgress([], '2026-11-15', null).pct, null);
  assert.ok(PFE_STARTER.length >= 5 && PFE_STARTER.every((t) => typeof t === 'string' && t.length > 3));
});

const week = days(
  { date: '2026-11-16', water: 2000, items: { wake: { s: 'done' }, breakfast: { s: 'done' }, journal: { s: 'skip' } } },
  { date: '2026-11-17', water: 3000, items: { muaythai: { s: 'done' } } },
  { date: '2026-11-18', items: { 'pfe-wed': { s: 'done' }, wake: { s: 'done' } } },
);

test('week so far: later today is not counted as missed', async () => {
  const ctx = await makeCtx();
  const w = weekSoFar(ctx, week, '2026-11-18', '2026-11-16');
  const past = adherence(ctx, week, '2026-11-16', '2026-11-17');
  const todayKept = adherence(ctx, week, '2026-11-18', '2026-11-18').kept;
  assert.equal(w.kept, past.kept + todayKept);
  assert.equal(w.due, past.due + todayKept);
  assert.ok(todayKept >= 1);
  assert.equal(w.waterAvgL, 2.5, 'average over the days with water logged');
  assert.deepEqual(w.training, sessionCount(ctx, week, '2026-11-16', '2026-11-22', TRAINING_BLOCKS));
  assert.equal(w.pfeMinutes, keptMinutes(ctx, week, '2026-11-16', '2026-11-22', 'pfe'));
  assert.equal(w.pfeMinutes, 60);
});

test('week so far: nothing before the program starts', async () => {
  const ctx = await makeCtx();
  const w = weekSoFar(ctx, days(), '2026-11-16', '2026-11-16');
  assert.equal(w.kept, 0);
  assert.equal(w.pct, null);
  assert.equal(w.waterAvgL, null);
});
