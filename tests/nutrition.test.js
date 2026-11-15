import { test, assert } from './harness.js';
import { dataFiles } from './fixture.js';
import { addDays } from '../js/core/dates.js';
import {
  bmr, targets, roundKcal, roundGrams, average7, averageSeries, weeklyRate, suggestAdjustment, adjustmentDue,
} from '../js/core/nutrition.js';

const { program, nutrition } = await dataFiles();
const formula = nutrition.formula;

// A made up person, so the tests do not depend on (or publish) anyone's real numbers.
const profile = { birthDate: '2000-06-15', heightCm: 180, weightKg: 76, goal: 'leanBulk', activityFactor: 1.55 };

// 7 weigh-ins ending on `end`, all at `kg`.
const weekOf = (end, kg) => Array.from({ length: 7 }, (_, i) => ({ date: addDays(end, -i), kg }));

test('nutrition: Mifflin St Jeor, male', () => {
  // 10 x 76 + 6.25 x 180 - 5 x 26 + 5
  assert.equal(bmr({ weightKg: 76, heightCm: 180, age: 26 }), 1760);
});

test('nutrition: lean bulk targets', () => {
  const t = targets(profile, '2026-11-16', formula);
  assert.equal(t.age, 26);
  assert.equal(t.bmr, 1760);
  assert.close(t.maintenance, 2728, 0.001, 'activity factor 1.55');
  assert.close(t.kcal, 3028, 0.001, 'plus 300 for the lean bulk');
  assert.close(t.protein, 144.4, 0.001, '1.9 g per kg');
  assert.close(t.fat, 83.6, 0.001, '1.1 g per kg');
  assert.close(t.carbs, (3028 - 144.4 * 4 - 83.6 * 9) / 4, 0.001, 'carbs fill the rest');
  assert.equal(roundKcal(t.kcal), 3050);
  assert.equal(roundGrams(t.protein), 145);
  assert.equal(roundGrams(t.fat), 85);
  assert.equal(roundGrams(t.carbs), 425);
});

test('nutrition: the starting values of the program give sensible targets', () => {
  const p = program.settings.profile;
  const t = targets(p, program.startDate, formula);
  assert.ok(t.kcal > 2000 && t.kcal < 4000, `calories look wrong: ${t.kcal}`);
  assert.close(t.protein, formula.proteinPerKg * p.weightKg);
  assert.close(t.fat, formula.fatPerKg * p.weightKg);
  assert.ok(t.carbs > 0);
});

test('nutrition: the goal changes the calories, not the protein', () => {
  const bulk = targets(profile, '2026-11-16', formula);
  const recomp = targets({ ...profile, goal: 'recomp' }, '2026-11-16', formula);
  const cut = targets({ ...profile, goal: 'cut' }, '2026-11-16', formula);
  assert.close(recomp.kcal, bulk.kcal - 300);
  assert.close(cut.kcal, bulk.kcal - 700);
  assert.close(cut.protein, bulk.protein);
  assert.ok(cut.carbs < bulk.carbs, 'carbs fill what is left');
});

test('nutrition: accepted adjustments and a birthday move the target', () => {
  const base = targets(profile, '2026-11-16', formula);
  assert.close(targets(profile, '2026-11-16', formula, 150).kcal, base.kcal + 150);
  assert.close(targets(profile, '2026-11-16', formula, -150).kcal, base.kcal - 150);
  const older = targets(profile, '2027-06-15', formula);
  assert.equal(older.age, 27);
  assert.close(older.bmr, 1755);
  const heavier = targets({ ...profile, weightKg: 80 }, '2026-11-16', formula);
  assert.close(heavier.protein, 152);
});

test('nutrition: the 7 day average', () => {
  const entries = [
    { date: '2026-11-16', kg: 68.4 }, { date: '2026-11-18', kg: 68.8 },
    { date: '2026-11-20', kg: 68.6 }, { date: '2026-11-22', kg: 69.0 },
    { date: '2026-11-09', kg: 60 },
  ];
  const a = average7(entries, '2026-11-22');
  assert.equal(a.n, 4, 'only the 7 days ending on the date');
  assert.close(a.avg, 68.7);
  assert.equal(average7(entries, '2026-11-08').avg, null);
  const series = averageSeries(entries, '2026-11-16', '2026-11-22');
  assert.equal(series[0].date, '2026-11-18', 'the line starts once two weigh-ins exist');
  assert.equal(series.length, 5);
});

test('nutrition: weekly rate compares two 7 day averages, two weeks apart', () => {
  const entries = [...weekOf('2026-11-22', 70.0), ...weekOf('2026-12-06', 70.5)];
  const r = weeklyRate(entries, '2026-12-06');
  assert.close(r.then, 70.0);
  assert.close(r.now, 70.5);
  assert.close(r.perWeek, 0.25);
  assert.equal(weeklyRate(entries.slice(0, 9), '2026-12-06'), null, 'too few weigh-ins this week');
  assert.equal(weeklyRate(weekOf('2026-12-06', 70.5), '2026-12-06'), null, 'nothing two weeks ago');
});

test('nutrition: the two week suggestion', () => {
  const cfg = formula.adjust;
  assert.deepEqual(suggestAdjustment(0.1, 'leanBulk', cfg), { kcal: 150, why: 'slow' });
  assert.deepEqual(suggestAdjustment(-0.2, 'leanBulk', cfg), { kcal: 150, why: 'slow' });
  assert.deepEqual(suggestAdjustment(0.45, 'leanBulk', cfg), { kcal: -150, why: 'fast' });
  assert.equal(suggestAdjustment(0.15, 'leanBulk', cfg), null, 'exactly 0.15 is not under 0.15');
  assert.equal(suggestAdjustment(0.25, 'leanBulk', cfg), null);
  assert.equal(suggestAdjustment(0.4, 'leanBulk', cfg), null, 'exactly 0.4 is not over 0.4');
  assert.equal(suggestAdjustment(0.05, 'cut', cfg), null, 'only the lean bulk has a rule');
  assert.equal(suggestAdjustment(null, 'leanBulk', cfg), null);
});

test('nutrition: the check comes every two weeks', () => {
  assert.equal(adjustmentDue('2026-11-16', '2026-11-29'), false);
  assert.equal(adjustmentDue('2026-11-16', '2026-11-30'), true);
  assert.equal(adjustmentDue('2026-11-30', '2026-12-13'), false);
});
