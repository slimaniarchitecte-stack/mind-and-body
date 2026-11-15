import { test, assert, loadJSON } from './harness.js';
import { currentFocus, trackWindow, trackProgress, aiTheme, weeklyMinutes, minutesBetween, cycleStep, pickBrief } from '../js/core/learn.js';

const { tracks, aiLab } = await loadJSON('data/tracks.json');
const create = await loadJSON('data/create.json');
const mind = await loadJSON('data/mind.json');
const settings = { defenseDate: '', cesiStart: '' };

test('learn: Dynamo is the current focus from 14 December 2026', () => {
  const before = currentFocus(tracks, settings, '2026-12-13');
  assert.equal(before.current, null, 'no technical track before the Learn blocks start');
  assert.equal(before.next.id, 'dynamo');
  assert.equal(currentFocus(tracks, settings, '2026-12-14').current.id, 'dynamo');
  assert.equal(currentFocus(tracks, settings, '2027-02-28').current.id, 'dynamo');
  assert.equal(currentFocus(tracks, settings, '2026-12-14').next.id, 'navisworks');
});

test('learn: one focus track at a time, in order', () => {
  assert.equal(currentFocus(tracks, settings, '2027-03-01').current.id, 'navisworks');
  assert.equal(currentFocus(tracks, settings, '2027-04-30').current.id, 'navisworks');
  assert.equal(currentFocus(tracks, settings, '2027-05-01').current.id, 'pfe-period');
  assert.equal(currentFocus(tracks, settings, '2027-08-01').current.id, 'pfe-period', 'stays until a defense date is set');
  const withDefense = { defenseDate: '2027-06-28', cesiStart: '2027-09-20' };
  assert.equal(currentFocus(tracks, withDefense, '2027-06-28').current.id, 'pfe-period');
  assert.equal(currentFocus(tracks, withDefense, '2027-06-29').current.id, 'rhino');
  assert.deepEqual(trackWindow(tracks.find((t) => t.id === 'rhino'), withDefense), { start: '2027-06-29', end: '2027-09-19' });
  for (const day of ['2026-12-20', '2027-03-15', '2027-05-10', '2027-07-10']) {
    const active = tracks.filter((t) => {
      if (t.kind !== 'focus') return false;
      const w = trackWindow(t, withDefense);
      return w.start && day >= w.start && (!w.end || day <= w.end);
    });
    assert.equal(active.length, 1, `exactly one focus track on ${day}`);
  }
});

test('learn: the program content is complete', () => {
  const count = (id) => tracks.find((t) => t.id === id).modules.length;
  assert.equal(count('dynamo'), 7);
  assert.equal(count('navisworks'), 6);
  assert.equal(count('rhino'), 6);
  assert.equal(count('revit'), 5);
  assert.equal(count('cesi'), 4);
  assert.equal(aiLab.themes.length, 4);
  assert.equal(create.briefs.length, 30);
  assert.equal(create.cycle.length, 4);
  assert.equal(mind.books.length, 8);
  const text = JSON.stringify([tracks, aiLab, create, mind]);
  assert.ok(!/https?:\/\//.test(text), 'no invented links in the program files');
});

test('learn: progress and next module', () => {
  const dynamo = tracks.find((t) => t.id === 'dynamo');
  const p = trackProgress(dynamo, { 'dyn-1': true, 'dyn-2': true });
  assert.equal(p.done, 2);
  assert.equal(p.total, 7);
  assert.close(p.pct, 2 / 7);
  assert.equal(p.nextModule.id, 'dyn-3');
  assert.equal(trackProgress(tracks.find((t) => t.id === 'pfe-period'), {}).pct, null);
});

test('learn: AI lab themes rotate every week', () => {
  assert.equal(aiTheme(aiLab, '2026-12-18').id, 'ai-1');
  assert.equal(aiTheme(aiLab, '2026-12-25').id, 'ai-2');
  assert.equal(aiTheme(aiLab, '2027-01-01').id, 'ai-3');
  assert.equal(aiTheme(aiLab, '2027-01-08').id, 'ai-4');
  assert.equal(aiTheme(aiLab, '2027-01-15').id, 'ai-1');
});

test('learn: minutes per week, weeks start on Monday', () => {
  const sessions = [
    { date: '2026-12-14', minutes: 60 }, { date: '2026-12-20', minutes: 60 },
    { date: '2026-12-21', minutes: 20 }, { date: '2026-12-25', minutes: 30 },
    { date: '2026-10-01', minutes: 500 },
  ];
  const w = weeklyMinutes(sessions, '2026-12-25', 4);
  assert.deepEqual(w.map((x) => x.monday), ['2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21']);
  assert.deepEqual(w.map((x) => x.minutes), [0, 0, 120, 50]);
  assert.equal(minutesBetween(sessions, '2026-12-14', '2026-12-20'), 120);
});

test('create: the Saturday cycle turns every 4 weeks', () => {
  const start = '2026-12-28';
  assert.equal(cycleStep(create.cycle, start, '2027-01-02').id, 'precedent');
  assert.equal(cycleStep(create.cycle, start, '2027-01-09').id, 'visit');
  assert.equal(cycleStep(create.cycle, start, '2027-01-16').id, 'challenge');
  assert.equal(cycleStep(create.cycle, start, '2027-01-23').id, 'explore');
  assert.equal(cycleStep(create.cycle, start, '2027-01-30').id, 'precedent');
});

test('create: a random brief never repeats the recent ones', () => {
  const recent = create.briefs.slice(0, 10).map((b) => b.id);
  for (let i = 0; i < 30; i += 1) {
    const b = pickBrief(create.briefs, recent, () => i / 30);
    assert.ok(!recent.includes(b.id));
  }
  assert.equal(pickBrief(create.briefs, [], () => 0).id, 'b01');
  assert.equal(pickBrief(create.briefs, [], () => 0.999).id, 'b30');
  assert.equal(pickBrief([], []), null);
});
