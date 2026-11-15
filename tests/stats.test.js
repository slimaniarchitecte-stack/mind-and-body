import { test, assert } from './harness.js';
import { makeCtx, days } from './fixture.js';
import { keptMinutes, sessionCount, skipReasons, weekStats, weeklyAdherence, weeklyWeight, reviewWeek } from '../js/core/stats.js';
import { dontStats } from '../js/core/adherence.js';

const MON = '2026-11-16';
const SUN = '2026-11-22';

// Week 1, partly kept.
const week1 = days(
  { date: '2026-11-16', items: { wake: { s: 'done' }, breakfast: { s: 'done' }, lunchbox: { s: 'done' }, journal: { s: 'done' }, 'lights-out': { s: 'done' } } },
  { date: '2026-11-17', items: { muaythai: { s: 'done' }, journal: { s: 'skip', reason: 'Tired' } } },
  { date: '2026-11-18', items: { 'pfe-wed': { s: 'done' }, lunchbox: { s: 'skip', reason: 'No time' } } },
  { date: '2026-11-19', items: { muaythai: { s: 'skip', reason: 'Tired' } } },
  { date: '2026-11-21', items: { 'pfe-sat': { s: 'min' }, muaythai: { s: 'min' } } },
  { date: '2026-11-22', items: { 'pfe-sun': { s: 'done' }, review: { s: 'done' }, football: { s: 'done' } } },
);

test('stats: PFE time comes from the blocks that were kept', async () => {
  const ctx = await makeCtx();
  assert.equal(keptMinutes(ctx, week1, MON, SUN, 'pfe'), 60 + 15 + 180, 'done counts the block, a minimum counts 15 minutes');
  assert.equal(keptMinutes(ctx, days(), MON, SUN, 'pfe'), 0);
});

test('stats: training sessions kept and due', async () => {
  const ctx = await makeCtx();
  assert.deepEqual(sessionCount(ctx, week1, MON, SUN, ['muaythai']), { due: 3, kept: 2 });
  assert.deepEqual(sessionCount(ctx, week1, MON, SUN, ['strength-a', 'strength-b']), { due: 0, kept: 0 }, 'still locked in week 1');
});

test('stats: skip reasons, most frequent first', () => {
  assert.deepEqual(skipReasons(week1, MON, SUN), [['Tired', 2], ['No time', 1]]);
});

test('stats: the weekly review numbers', async () => {
  const ctx = await makeCtx();
  const s = weekStats(ctx, week1, MON, {
    learnSessions: [{ date: '2026-11-16', minutes: 40 }, { date: '2026-11-22', minutes: 20 }, { date: '2026-11-23', minutes: 60 }],
    footballGames: [{ date: '2026-11-22' }, { date: '2026-11-29' }],
    weights: [
      { date: '2026-11-10', kg: 68.2 }, { date: '2026-11-12', kg: 68.4 },
      { date: '2026-11-17', kg: 68.6 }, { date: '2026-11-19', kg: 68.8 }, { date: '2026-11-21', kg: 68.7 },
    ],
  });
  assert.equal(s.sunday, SUN);
  assert.equal(s.adherence.due, 40);
  assert.equal(s.adherence.kept, 11, 'football is ticked but does not count');
  assert.equal(s.learnMinutes, 60);
  assert.equal(s.training.football, 1);
  assert.deepEqual(s.training.muayThai, { due: 3, kept: 2 });
  assert.equal(s.pfeMinutes, 255);
  assert.close(s.weight.avg, 68.7);
  assert.close(s.weight.change, 68.7 - 68.3);
  assert.equal(s.weight.weighIns, 3);
});

test('stats: adherence week by week', async () => {
  const ctx = await makeCtx();
  const series = weeklyAdherence(ctx, week1, '2026-11-25', 3);
  assert.deepEqual(series.map((w) => w.monday), ['2026-11-09', '2026-11-16', '2026-11-23']);
  assert.equal(series[0].pct, null, 'nothing was due before the start');
  assert.close(series[1].pct, 11 / 40);
  assert.equal(series[2].due, 5 + 6, 'the running week only counts the finished days');
});

test('stats: weight at each week end', () => {
  const weights = [{ date: '2026-11-17', kg: 68.6 }, { date: '2026-11-19', kg: 68.8 }, { date: '2026-11-24', kg: 69.0 }];
  const series = weeklyWeight(weights, '2026-11-25', 2);
  assert.close(series[0].avg, 68.7);
  assert.close(series[1].avg, 68.9, 'the running week uses the 7 days up to today');
  assert.equal(weeklyWeight([{ date: '2026-11-24', kg: 69 }], '2026-11-25', 1)[0].avg, null, 'one weigh-in is not an average yet');
});

test('stats: which week the review is about', () => {
  assert.equal(reviewWeek('2026-11-22', 7), '2026-11-16', 'on Sunday: this week');
  assert.equal(reviewWeek('2026-11-21', 6), '2026-11-16', 'on Saturday: this week');
  assert.equal(reviewWeek('2026-11-25', 3), '2026-11-16', 'on Wednesday: the week before');
  assert.equal(reviewWeek('2026-11-23', 1), '2026-11-16');
});

test("don'ts: percent avoided, on the evenings they were asked", () => {
  const getDay = days(
    { date: '2026-11-16', donts: { soda: false, 'skip-meals': true } },
    { date: '2026-11-17', donts: { soda: false, 'skip-meals': true } },
    { date: '2026-11-18', donts: { soda: false, 'skip-meals': false } },
    { date: '2026-11-19', donts: { soda: true } },
  );
  const meals = dontStats(getDay, 'skip-meals', MON, SUN);
  assert.equal(meals.asked, 3);
  assert.equal(meals.slips, 1);
  assert.close(meals.pct, 2 / 3);
  const soda = dontStats(getDay, 'soda', MON, SUN, 2);
  assert.equal(soda.asked, 4);
  assert.equal(soda.slips, 1, 'two a week are fine, the third one counts');
  assert.close(soda.pct, 3 / 4);
  assert.equal(dontStats(getDay, 'caffeine-late', MON, SUN).pct, null, 'never asked, no percentage');
});
