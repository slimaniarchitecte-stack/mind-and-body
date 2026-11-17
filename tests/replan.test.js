import { test, assert } from './harness.js';
import { makeCtx } from './fixture.js';
import { classify, dayEndOf, replanDay, pullForward, restOfDay } from '../js/core/replan.js';
import { blocksForDate } from '../js/core/schedule.js';

const templates = [
  { id: 'work', start: '@work.start' }, { id: 'lunch', start: '13:00' }, { id: 'run', start: '18:00' },
  { id: 'mt', start: '@muayThai.start' }, { id: 'dinner', start: '20:15' }, { id: 'pfe', start: '21:00' },
  { id: 'free', start: '22:00' }, { id: 'journal', start: '@sleep-75' },
];
const B = (id, category, start, end, track) => ({ id, key: id, category, start, end, track, locked: false });
const day = [
  B('work', 'work', 540, 1020, false),
  B('lunch', 'food', 780, 810, true),
  B('run', 'body', 1080, 1110, true),
  B('mt', 'body', 1140, 1200, true),
  B('dinner', 'food', 1215, 1245, false),
  B('pfe', 'pfe', 1260, 1320, true),
  B('free', 'free', 1320, 1350, false),
  B('journal', 'mind', 1365, 1380, true),
];
const none = () => null;
const at = (r, id) => r.moved.find((m) => m.block.id === id)?.start;

test('replan: what is fixed and what can move', () => {
  const kinds = Object.fromEntries(classify(day, templates).map((x) => [x.b.id, x.kind]));
  assert.deepEqual(kinds, { work: 'fixed', lunch: 'fixed', run: 'flex', mt: 'fixed', dinner: 'flex', pfe: 'flex', free: 'ignore', journal: 'fixed' });
  assert.equal(dayEndOf(classify(day, templates)), 1365, 'flexible blocks end before the evening routine');
});

const late = (now, m) => replanDay(day, templates, { now, statusOf: none, busyUntil: now + m, markMissed: false });

test('replan: running late only moves what is in the way', () => {
  const r = late(1070, 30);
  assert.equal(at(r, 'run'), 1100);
  assert.equal(at(r, 'dinner'), undefined, 'far enough away, it keeps its time');
  assert.equal(at(r, 'pfe'), undefined);
  assert.equal(r.moved.length, 1);
  assert.equal(late(1000, 30).moved.length, 0, 'nothing in the way, nothing moves');
});

test('replan: an hour late, training jumps over Muay Thai and pushes dinner a little', () => {
  const r = late(1070, 60);
  assert.equal(at(r, 'run'), 1200, 'after Muay Thai, not on top of it');
  assert.equal(at(r, 'dinner'), 1230);
  assert.equal(at(r, 'pfe'), undefined);
  assert.equal(r.missed.length, 0, 'running late: I may still make it to Muay Thai');
  assert.equal(r.dropped.length, 0);
});

test('replan: busy until late evening, what no longer fits is dropped', () => {
  const r = replanDay(day, templates, { now: 1070, statusOf: none, busyUntil: 1300 });
  assert.equal(at(r, 'run'), 1300);
  assert.equal(at(r, 'dinner'), 1330);
  assert.deepEqual(r.dropped.map((b) => b.id), ['pfe'], 'it would end after the evening routine starts');
  assert.deepEqual(r.missed.map((b) => b.id), ['mt']);
});

test('replan: something came up until 19:30', () => {
  const r = replanDay(day, templates, { now: 1050, statusOf: none, busyUntil: 1170 });
  assert.equal(at(r, 'run'), 1170);
  assert.equal(at(r, 'dinner'), undefined, 'dinner was not in the way');
  assert.deepEqual(r.missed.map((b) => b.id), ['mt'], 'Muay Thai falls inside the busy time');
});

test('replan: done blocks and past blocks never move', () => {
  const status = (k) => (k === 'run' ? 'done' : null);
  const r = replanDay(day, templates, { now: 1070, statusOf: status, busyUntil: 1130 });
  assert.equal(at(r, 'run'), undefined);
  assert.equal(at(r, 'lunch'), undefined);
});

test('replan: free time now brings the next block forward when it fits', () => {
  assert.equal(pullForward(day, templates, { now: 1110, statusOf: none }).reason, 'nofit', 'Muay Thai is in the way');
  const r = pullForward(day, templates, { now: 1250, statusOf: none });
  assert.equal(r.reason, null);
  assert.equal(at(r, 'pfe'), 1250);
});

test('replan: day off lists what is still open', () => {
  const left = restOfDay(day, { now: 1100, statusOf: (k) => (k === 'run' ? 'done' : null) });
  assert.deepEqual(left.map((b) => b.id), ['mt', 'pfe', 'journal']);
});

test('replan: with the real schedule, work and Muay Thai are fixed, PFE moves', async () => {
  const ctx = await makeCtx();
  const tue = blocksForDate(ctx, '2026-11-17');
  const kinds = Object.fromEntries(classify(tue, ctx.blocks).map((x) => [x.b.id, x.kind]));
  assert.equal(kinds.work, 'fixed');
  assert.equal(kinds.lunchbox, 'fixed', 'inside work');
  assert.equal(kinds.muaythai, 'fixed');
  assert.equal(kinds.journal, 'fixed');
  const wed = blocksForDate(ctx, '2026-11-18');
  assert.equal(Object.fromEntries(classify(wed, ctx.blocks).map((x) => [x.b.id, x.kind]))['pfe-wed'], 'flex');
});
