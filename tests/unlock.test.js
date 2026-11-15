import { test, assert } from './harness.js';
import { loadJSON } from './harness.js';
import { resolveStages, nextLockedStage, lockInfo, evaluateUnlock, forceUnlock, relock } from '../js/core/unlock.js';

const program = await loadJSON('data/program.json');
const due = (unlocks) => Object.fromEntries(Object.values(resolveStages(program, unlocks)).map((s) => [s.id, s.due]));

test('unlock: the planned schedule', () => {
  const st = resolveStages(program, {});
  assert.equal(st.s1.active, true);
  assert.equal(st.s1.activatedOn, '2026-11-16');
  assert.equal(st.s2.active, false);
  assert.deepEqual(due({}), { s1: '2026-11-16', s2: '2026-11-30', s3: '2026-12-14', s4: '2026-12-28', s5: '2027-01-11' });
  assert.equal(nextLockedStage(st).id, 's2');
});

test('unlock: nothing happens before the unlock date', () => {
  assert.equal(evaluateUnlock(program, {}, '2026-11-29', 1), null);
});

test('unlock: 80% or more activates the next stage', () => {
  const r = evaluateUnlock(program, {}, '2026-11-30', 0.8);
  assert.equal(r.action, 'activate');
  assert.equal(r.stage.id, 's2');
  const st = resolveStages(program, r.unlocks);
  assert.equal(st.s2.active, true);
  assert.equal(st.s2.activatedOn, '2026-11-30');
  assert.equal(st.s3.due, '2026-12-14');
  assert.equal(nextLockedStage(st).id, 's3');
  assert.equal(lockInfo(st, 's2', '2026-11-29').locked, true, 'not active before its date');
  assert.equal(lockInfo(st, 's2', '2026-11-30').locked, false);
});

test('unlock: under 80% postpones by one week, and the later stages follow', () => {
  const r = evaluateUnlock(program, {}, '2026-11-30', 0.79);
  assert.equal(r.action, 'postpone');
  assert.equal(r.pct, 0.79);
  assert.deepEqual(due(r.unlocks), { s1: '2026-11-16', s2: '2026-12-07', s3: '2026-12-21', s4: '2027-01-04', s5: '2027-01-18' });
  assert.equal(evaluateUnlock(program, r.unlocks, '2026-12-06', 1), null, 'no new check before the new date');
  const again = evaluateUnlock(program, r.unlocks, '2026-12-07', 0.9);
  assert.equal(again.action, 'activate');
  assert.equal(resolveStages(program, again.unlocks).s2.checks.length, 2, 'both checks are kept in the history');
});

test('unlock: no data means not yet', () => {
  assert.equal(evaluateUnlock(program, {}, '2026-11-30', null).action, 'postpone');
});

test('unlock: a late check activates on the day it happens, the next stage waits for a Monday', () => {
  const r = evaluateUnlock(program, {}, '2026-12-02', 0.95);
  const st = resolveStages(program, r.unlocks);
  assert.equal(st.s2.activatedOn, '2026-12-02');
  assert.equal(st.s3.due, '2026-12-21', '14 days after 2 December is a Wednesday, so the next Monday');
});

test('unlock: forcing a stage, and undoing it', () => {
  const forced = forceUnlock({}, 's2', '2026-11-20');
  const st = resolveStages(program, forced);
  assert.equal(st.s2.active, true);
  assert.equal(st.s2.forced, true);
  assert.equal(st.s3.due, '2026-12-14', 'forcing early does not pull the next stage forward');
  assert.equal(lockInfo(st, 's2', '2026-11-20').locked, false);
  const back = resolveStages(program, relock(forced, 's2'));
  assert.equal(back.s2.active, false);
});

test('unlock: stages open strictly one after the other', () => {
  const r = evaluateUnlock(program, {}, '2026-12-28', 1);
  assert.equal(r.stage.id, 's2', 'even very late, only the next stage is checked');
});
