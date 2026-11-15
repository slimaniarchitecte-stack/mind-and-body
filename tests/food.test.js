import { test, assert } from './harness.js';
import { dataFiles } from './fixture.js';
import { targets } from '../js/core/nutrition.js';
import { MEALS, totals, planEntries, addEntries, proteinDots, mealAt, planFor, recentFood, monthSpend, fmtQty } from '../js/core/food.js';

const { program, nutrition } = await dataFiles();
const foods = nutrition.foods;
const plan = (id) => nutrition.mealPlans.find((p) => p.id === id);
let n = 0;
const makeId = () => `f${(n += 1)}`;

test('food: every food is one clear portion', () => {
  assert.ok(foods.length >= 15);
  assert.equal(new Set(foods.map((f) => f.id)).size, foods.length, 'ids are unique');
  for (const f of foods) {
    assert.ok(f.name && f.unit, `${f.id} has a name and a portion`);
    assert.ok(f.kcal > 0 && f.kcal < 700, `${f.id}: calories for one portion`);
    assert.ok(f.protein >= 0 && f.protein <= 40, `${f.id}: protein for one portion`);
    assert.ok(f.protein * 4 <= f.kcal, `${f.id}: protein cannot give more calories than the food has`);
  }
  assert.ok(!/\b(dh|dhs|mad|dirhams?)\b/i.test(JSON.stringify(nutrition)), 'no invented prices in the file');
});

test('food: totals of a meal', () => {
  const log = [
    { meal: 'breakfast', food: 'egg', qty: 3 },
    { meal: 'breakfast', food: 'bread', qty: 1 },
    { meal: 'lunch', food: 'chicken', qty: 1.5 },
    { meal: 'lunch', food: 'unknown-food', qty: 2 },
    { meal: 'lunch', food: 'egg', qty: 0 },
  ];
  const t = totals(log, foods);
  assert.equal(t.kcal, 3 * 70 + 210 + 1.5 * 220);
  assert.equal(t.protein, 3 * 6 + 7 + 1.5 * 33);
  assert.deepEqual(t.byMeal.breakfast, { kcal: 420, protein: 25, count: 2 });
  assert.equal(t.byMeal.lunch.count, 1, 'unknown foods and empty lines are ignored');
  assert.deepEqual(totals([], foods), { kcal: 0, protein: 0, byMeal: {} });
});

test('food: the model days use real foods and have the five moments', () => {
  const ids = new Set(foods.map((f) => f.id));
  assert.deepEqual(nutrition.mealPlans.map((p) => p.id), ['workday', 'muaythai', 'weekend']);
  for (const p of nutrition.mealPlans) {
    assert.deepEqual(p.meals.map((m) => m.id), MEALS.map((m) => m.id), `${p.id}: breakfast to before bed`);
    for (const m of p.meals) for (const it of m.items) assert.ok(ids.has(it.food) && it.qty > 0, `${p.id} ${m.id}: ${it.food}`);
  }
});

test('food: each model day lands near the targets', () => {
  const target = targets(program.settings.profile, program.startDate, nutrition.formula);
  for (const p of nutrition.mealPlans) {
    const t = totals(planEntries(p), foods);
    assert.ok(Math.abs(t.kcal - target.kcal) / target.kcal <= 0.06, `${p.id}: ${t.kcal} kcal against ${Math.round(target.kcal)}`);
    assert.ok(t.protein >= target.protein, `${p.id}: ${t.protein} g protein against ${Math.round(target.protein)}`);
  }
  assert.equal(totals(planEntries(plan('workday')), foods).kcal, 2870);
  assert.equal(totals(planEntries(plan('workday')), foods).protein, 145);
  assert.equal(totals(planEntries(plan('workday'), 'breakfast'), foods).kcal, 795);
});

test('food: logging the same food twice adds it up', () => {
  let log = addEntries([], planEntries(plan('workday'), 'breakfast'), makeId);
  assert.equal(log.length, 5);
  assert.ok(log.every((e) => e.id));
  log = addEntries(log, [{ meal: 'breakfast', food: 'egg', qty: 1 }, { meal: 'snack', food: 'egg', qty: 2 }, { meal: 'snack', food: 'fruit', qty: 0 }], makeId);
  assert.equal(log.length, 6, 'a new line only for a new meal');
  assert.equal(log.find((e) => e.meal === 'breakfast' && e.food === 'egg').qty, 4);
});

test('food: a meal with 20 g of protein earns its protein dot', () => {
  const day = planEntries(plan('workday'));
  assert.deepEqual(proteinDots(day, foods, nutrition.proteinMomentG), [true, true, true, true]);
  const training = planEntries(plan('muaythai'));
  assert.deepEqual(proteinDots(training, foods, 20), [true, true, false, true], 'the light pre training snack does not earn one');
  assert.deepEqual(proteinDots([], foods, 20), [false, false, false, false]);
});

test('food: the right meal and the right model day', () => {
  assert.equal(mealAt(7 * 60 + 45), 'breakfast');
  assert.equal(mealAt(13 * 60), 'lunch');
  assert.equal(mealAt(17 * 60 + 30), 'snack');
  assert.equal(mealAt(20 * 60 + 45), 'dinner');
  assert.equal(mealAt(23 * 60), 'evening');
  assert.equal(planFor(nutrition.mealPlans, { isWorkday: true, isMuayThai: false }).id, 'workday');
  assert.equal(planFor(nutrition.mealPlans, { isWorkday: true, isMuayThai: true }).id, 'muaythai');
  assert.equal(planFor(nutrition.mealPlans, { isWorkday: false, isMuayThai: true }).id, 'weekend', 'Saturday is a weekend day');
});

test('food: averages only count the days with a log', () => {
  const days = {
    '2026-11-16': { foodLog: [{ meal: 'lunch', food: 'chicken', qty: 2 }] },
    '2026-11-18': { foodLog: [{ meal: 'lunch', food: 'legumes', qty: 1 }, { meal: 'dinner', food: 'bread', qty: 2 }] },
    '2026-11-19': { foodLog: [] },
  };
  const r = recentFood((d) => days[d], foods, '2026-11-19', 7);
  assert.equal(r.days.length, 7);
  assert.equal(r.days[0].date, '2026-11-13');
  assert.equal(r.logged, 2);
  assert.equal(r.avgKcal, (440 + 720) / 2);
  assert.equal(r.avgProtein, (66 + 36) / 2);
  assert.equal(recentFood(() => undefined, foods, '2026-11-19').avgKcal, null);
});

test('food: money spent in a month', () => {
  const spend = [{ date: '2026-11-03', amount: 45 }, { date: '2026-11-20', amount: 30.5 }, { date: '2026-12-01', amount: 99 }, { date: '2026-11-21', amount: 'x' }];
  assert.equal(monthSpend(spend, '2026-11'), 75.5);
  assert.equal(monthSpend(spend, '2026-10'), 0);
  assert.equal(fmtQty(3), '3');
  assert.equal(fmtQty(1.5), '1.5');
});
