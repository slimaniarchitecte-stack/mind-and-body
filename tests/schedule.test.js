import { test, assert } from './harness.js';
import { makeCtx } from './fixture.js';
import { fmtHM } from '../js/core/dates.js';
import { blocksForDate, dontsForDate, nowNext, phaseFor, waterTarget, resolveTime, resolveAnchors, clashes } from '../js/core/schedule.js';

const MON = '2026-11-16';
const TUE = '2026-11-17';
const WED = '2026-11-18';
const THU = '2026-11-19';
const SAT = '2026-11-21';
const SUN = '2026-11-22';

const find = (blocks, id) => blocks.find((b) => b.id === id);
const at = (blocks, id) => fmtHM(find(blocks, id).start);
const ALL_OPEN = { s2: { activatedOn: '2026-11-16' }, s3: { activatedOn: '2026-11-16' }, s4: { activatedOn: '2026-11-16' }, s5: { activatedOn: '2026-11-16' } };

test('schedule: a normal Monday follows the template', async () => {
  const b = blocksForDate(await makeCtx(), MON);
  assert.equal(at(b, 'wake'), '07:30');
  assert.equal(at(b, 'breakfast'), '07:45');
  assert.equal(at(b, 'commute-am'), '08:30');
  assert.equal(at(b, 'work'), '09:00');
  assert.equal(fmtHM(find(b, 'work').end), '17:00');
  assert.equal(at(b, 'lunchbox'), '13:00');
  assert.equal(at(b, 'snack'), '17:30');
  assert.equal(at(b, 'strength-a'), '18:15');
  assert.equal(at(b, 'journal'), '22:45');
  assert.equal(at(b, 'screens-off'), '23:00');
  assert.equal(find(b, 'lights-out').start, 1440, 'lights out is at midnight, at the end of the same day');
  assert.ok(!find(b, 'muaythai'), 'no Muay Thai on Monday');
  for (let i = 1; i < b.length; i += 1) assert.ok(b[i - 1].start <= b[i].start, 'sorted by start time');
});

test('schedule: locked blocks carry their unlock date', async () => {
  const b = blocksForDate(await makeCtx(), MON);
  assert.equal(find(b, 'strength-a').locked, true);
  assert.equal(find(b, 'strength-a').unlockDate, '2026-11-30');
  assert.equal(find(b, 'learn-mon').unlockDate, '2026-12-14');
  assert.equal(find(b, 'reading').unlockDate, '2026-12-28');
  assert.equal(find(b, 'wake').locked, false);
  assert.equal(find(b, 'work').locked, false, 'work is never locked');
  const before = blocksForDate(await makeCtx(), '2026-11-13');
  assert.equal(find(before, 'journal').locked, true, 'nothing counts before the start date');
});

test('schedule: Muay Thai day', async () => {
  const b = blocksForDate(await makeCtx(), TUE);
  assert.equal(at(b, 'snack-pre'), '17:45');
  assert.equal(at(b, 'muaythai'), '19:00');
  assert.equal(fmtHM(find(b, 'muaythai').end), '20:00');
  assert.equal(find(b, 'muaythai').locked, false);
  assert.equal(at(b, 'mobility'), '20:00');
  assert.equal(at(b, 'dinner-mt'), '20:45');
  assert.equal(at(b, 'tutorial'), '13:30');
  assert.ok(!find(b, 'snack'), 'the normal snack is replaced by the pre training snack');
});

test('schedule: weekend', async () => {
  const sat = blocksForDate(await makeCtx(), SAT);
  assert.equal(at(sat, 'wake'), '08:00', 'Saturday starts earlier, for the urbanism session');
  assert.equal(at(sat, 'breakfast'), '08:15');
  assert.equal(fmtHM(find(sat, 'breakfast').end), '08:35');
  assert.equal(at(sat, 'urbanism-ride-out'), '08:45', '15 minutes by motorcycle to the office');
  assert.equal(at(sat, 'urbanism'), '09:00');
  assert.equal(fmtHM(find(sat, 'urbanism').end), '11:00');
  assert.equal(find(sat, 'urbanism').track, false, 'a fixed commitment, like work');
  assert.equal(at(sat, 'urbanism-ride-back'), '11:00');
  assert.equal(fmtHM(find(sat, 'urbanism-ride-back').end), '11:15');
  assert.equal(at(sat, 'pfe-sat'), '11:30', 'a short break after the ride home');
  assert.equal(fmtHM(find(sat, 'pfe-sat').end), '13:30');
  assert.equal(at(sat, 'lunch-weekend'), '13:30');
  assert.equal(at(sat, 'arch-session'), '15:00');
  assert.equal(at(sat, 'muaythai'), '19:00');
  assert.equal(find(sat, 'lights-out').start, 1470, 'Saturday: in bed by 00:30');
  assert.equal(at(sat, 'journal'), '23:15');
  assert.ok(!find(sat, 'work'));
  const sun = blocksForDate(await makeCtx(), SUN);
  assert.equal(at(sun, 'wake'), '08:30');
  assert.equal(at(sun, 'pfe-sun'), '10:00');
  assert.equal(fmtHM(find(sun, 'pfe-sun').end), '13:00', 'the hour taken from Saturday is added on Sunday');
  assert.equal(at(sun, 'rotaract'), '14:15');
  assert.equal(find(sun, 'rotaract').counts, false, 'Rotaract time can be ticked but never counts against me');
  assert.equal(at(sun, 'free-sun'), '15:15');
  const ctx = await makeCtx();
  const pfeWeek = ['2026-11-18', SAT, SUN].flatMap((d) => blocksForDate(ctx, d))
    .filter((b) => b.category === 'pfe')
    .reduce((sum, b) => sum + (b.end - b.start), 0);
  assert.equal(pfeWeek, 360, 'PFE stays at 6 hours a week');
  assert.equal(at(sun, 'football'), '17:00');
  assert.equal(find(sun, 'football').counts, false, 'football never counts against me');
  assert.equal(at(sun, 'learn-sun'), '18:30');
  assert.equal(at(sun, 'review'), '20:30');
  assert.equal(find(sun, 'lights-out').start, 1440);
});

test('schedule: times follow Settings', async () => {
  const ctx = await makeCtx();
  ctx.settings.muayThai = { days: [1, 3], start: '18:30', end: '20:00' };
  ctx.settings.commuteMin = 45;
  const b = blocksForDate(ctx, MON);
  assert.equal(at(b, 'muaythai'), '18:30');
  assert.equal(at(b, 'snack-pre'), '17:15');
  assert.equal(at(b, 'mobility'), '20:00');
  assert.equal(at(b, 'commute-am'), '08:15');
  assert.ok(!find(blocksForDate(ctx, TUE), 'muaythai'));
  const a = resolveAnchors(ctx.settings, 1);
  assert.equal(resolveTime('@home+10', a), 17 * 60 + 45 + 10);
  assert.equal(resolveTime('00:30', a), 1470);
  assert.equal(resolveTime('@nothing', a), null);
});

test('schedule: phases', async () => {
  const ctx = await makeCtx();
  assert.equal(phaseFor(ctx.program, ctx.settings, '2026-11-15'), null);
  assert.equal(phaseFor(ctx.program, ctx.settings, '2026-11-16').id, 'p1');
  assert.equal(phaseFor(ctx.program, ctx.settings, '2027-01-10').id, 'p1');
  assert.equal(phaseFor(ctx.program, ctx.settings, '2027-01-11').id, 'p2');
  assert.equal(phaseFor(ctx.program, ctx.settings, '2027-04-30').id, 'p2');
  assert.equal(phaseFor(ctx.program, ctx.settings, '2027-05-01').id, 'p3');
  assert.equal(phaseFor(ctx.program, ctx.settings, '2027-09-01').id, 'p3', 'phase 3 stays open until a defense date is set');
  ctx.settings.defenseDate = '2027-06-28';
  assert.equal(phaseFor(ctx.program, ctx.settings, '2027-06-28').id, 'p3');
  assert.equal(phaseFor(ctx.program, ctx.settings, '2027-06-29').id, 'p4');
});

test('schedule: the PFE phase replaces learning with PFE blocks', async () => {
  const ctx = await makeCtx({ unlocks: ALL_OPEN });
  const mon = blocksForDate(ctx, '2027-05-03');
  assert.ok(find(mon, 'pfe-mon'));
  assert.ok(!find(mon, 'learn-mon'));
  const fri = blocksForDate(ctx, '2027-05-07');
  assert.ok(find(fri, 'maintenance'));
  assert.ok(!find(fri, 'ai-lab'));
  assert.equal(at(fri, 'free-fri'), '21:45');
  const sat = blocksForDate(ctx, '2027-05-08');
  assert.ok(find(sat, 'pfe-sat-pm'));
  assert.ok(!find(sat, 'arch-session'));
  assert.ok(find(sat, 'muaythai'), 'training stays');
  const sun = blocksForDate(ctx, '2027-05-09');
  assert.ok(find(sun, 'pfe-sun-eve'));
  assert.ok(!find(sun, 'learn-sun'));
  const tue = blocksForDate(ctx, '2027-05-04');
  assert.ok(!find(tue, 'tutorial'));
});

test('schedule: "this week only" changes stay in their week', async () => {
  const ctx = await makeCtx({
    weekOverrides: {
      '2026-11-16': {
        patches: { 'pfe-wed': { start: '20:00', end: null, duration: 90 } },
        removed: ['dinner'],
        added: [{ id: 'c-1', title: 'Dentist', category: 'free', days: [4], start: '17:30', duration: 45, track: false }],
      },
    },
  });
  const wed = blocksForDate(ctx, WED);
  assert.equal(at(wed, 'pfe-wed'), '20:00');
  assert.equal(find(wed, 'pfe-wed').end - find(wed, 'pfe-wed').start, 90);
  assert.equal(find(wed, 'pfe-wed').weekOnly, true);
  assert.ok(!find(wed, 'dinner'));
  assert.ok(find(blocksForDate(ctx, THU), 'c-1'));
  const nextWed = blocksForDate(ctx, '2026-11-25');
  assert.equal(at(nextWed, 'pfe-wed'), '21:00');
  assert.ok(find(nextWed, 'dinner'));
  assert.ok(!find(blocksForDate(ctx, '2026-11-26'), 'c-1'));
});

test('schedule: moving one block to another day', async () => {
  const ctx = await makeCtx({
    weekOverrides: { '2026-11-16': { moves: [{ id: 'pfe-wed', from: WED, to: THU, start: '20:30' }] } },
  });
  assert.ok(!find(blocksForDate(ctx, WED), 'pfe-wed'), 'gone from Wednesday');
  const moved = find(blocksForDate(ctx, THU), 'pfe-wed');
  assert.equal(fmtHM(moved.start), '20:30');
  assert.equal(moved.end - moved.start, 60);
  assert.equal(moved.key, 'pfe-wed~2026-11-18');
  assert.equal(moved.movedFrom, WED);
  const same = await makeCtx({
    weekOverrides: { '2026-11-16': { moves: [{ id: 'pfe-wed', from: WED, to: WED, start: '19:00' }] } },
  });
  assert.equal(at(blocksForDate(same, WED), 'pfe-wed'), '19:00');
  assert.equal(find(blocksForDate(same, WED), 'pfe-wed').key, 'pfe-wed');
});

test('schedule: now and next', async () => {
  const b = blocksForDate(await makeCtx(), MON);
  let r = nowNext(b, 12 * 60);
  assert.equal(r.current.id, 'work');
  assert.equal(r.next.id, 'lunchbox');
  r = nowNext(b, 13 * 60 + 10);
  assert.equal(r.current.id, 'lunchbox', 'lunch wins over work while it lasts');
  r = nowNext(b, 14 * 60);
  assert.equal(r.current.id, 'work');
  assert.equal(r.next.id, 'commute-pm');
  r = nowNext(b, 18 * 60 + 20);
  assert.equal(r.current, null, 'a locked block is never "now"');
  r = nowNext(b, 1445);
  assert.equal(r.next, null);
});

test("schedule: the evening don'ts", async () => {
  const ctx = await makeCtx();
  assert.deepEqual(dontsForDate(ctx, MON).map((d) => d.id), ['skip-meals']);
  assert.deepEqual(dontsForDate(ctx, TUE).map((d) => d.id).sort(), ['heavy-meal-pre-mt', 'skip-meals']);
  const open = await makeCtx({ unlocks: ALL_OPEN });
  const a = dontsForDate(open, MON).map((d) => d.id);
  const b = dontsForDate(open, TUE).map((d) => d.id);
  assert.equal(a.length, 3);
  assert.equal(b.length, 3);
  assert.ok(a.join() !== b.join(), 'they rotate from day to day');
  assert.ok(!a.includes('miss-twice') && !b.includes('new-habits'), 'system rules are never asked');
  assert.ok(!dontsForDate(open, '2026-11-20').some((d) => d.id === 'gaming-late'), 'no gaming rule on Friday');
});

test('schedule: water target is higher on training days', async () => {
  const ctx = await makeCtx();
  assert.equal(waterTarget(ctx, MON), 3000);
  assert.equal(waterTarget(ctx, TUE), 3500);
  assert.equal(waterTarget(ctx, SUN), 3000, 'football is optional, so it does not raise the target');
});

test('schedule: overlapping blocks are flagged', async () => {
  const open = await makeCtx({ unlocks: ALL_OPEN });
  for (const date of ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']) {
    assert.equal(clashes(blocksForDate(open, date)).size, 0, `the template has no overlap on ${date}`);
  }
  const late = await makeCtx({ unlocks: ALL_OPEN });
  late.settings.football = { day: 7, start: '18:00', durationMin: 90 };
  assert.deepEqual([...clashes(blocksForDate(late, SUN))].sort(), ['football', 'learn-sun'], 'football until 19:30 runs into the 18:30 Learn block');
});

test('schedule: Ramadan mode hides the daytime meals', async () => {
  const ctx = await makeCtx();
  ctx.settings.ramadan = { ...ctx.settings.ramadan, on: true };
  const b = blocksForDate(ctx, TUE);
  assert.ok(!find(b, 'breakfast'));
  assert.ok(!find(b, 'lunchbox'));
  assert.equal(at(b, 'muaythai'), '21:30');
  assert.equal(fmtHM(find(b, 'work').end), '15:00');
});
