import { test, assert } from './harness.js';
import { dataFiles } from './fixture.js';
import { availableVariations, lastPerformance, currentVariation, hitTop, progression, targetText } from '../js/core/strength.js';

const { training } = await dataFiles();
const sessionA = training.sessions.find((s) => s.id === 'a');
const sessionB = training.sessions.find((s) => s.id === 'b');
const pushUp = sessionA.exercises.find((e) => e.id === 'push-up');
const splitSquat = sessionA.exercises.find((e) => e.id === 'split-squat');
const plank = sessionA.exercises.find((e) => e.id === 'plank');
const pull = sessionB.exercises.find((e) => e.id === 'pull');

const log = (date, sets, variation = 'Push ups', extra = {}) => ({
  type: 'strength', date, session: 'a', minimum: false, exercises: [{ id: 'push-up', variation, sets }], ...extra,
});

test('strength: the program has both sessions with five exercises', () => {
  assert.equal(sessionA.exercises.length, 5);
  assert.equal(sessionB.exercises.length, 5);
  assert.equal(targetText(splitSquat), '3 x 8 to 12 per leg');
  assert.equal(targetText(plank), '3 x 30 to 45 s');
});

test('strength: last performance is the latest session before today', () => {
  const records = [log('2026-11-30', [10, 9, 8]), log('2026-12-07', [12, 10, 9]), log('2026-12-14', [13, 11, 10])];
  assert.deepEqual(lastPerformance(records, 'a', 'push-up', '2026-12-14').sets, [12, 10, 9]);
  assert.equal(lastPerformance(records, 'a', 'push-up', '2026-12-21').date, '2026-12-14');
  assert.equal(lastPerformance(records, 'a', 'push-up', '2026-11-30'), null);
  assert.equal(lastPerformance(records, 'b', 'push-up', '2026-12-21'), null, 'another session does not count');
  const withMinimum = [...records, { type: 'strength', date: '2026-12-21', session: 'a', minimum: true, exercises: [] }];
  assert.equal(lastPerformance(withMinimum, 'a', 'push-up', '2026-12-28').date, '2026-12-14', 'a minimum day has no numbers');
});

test('strength: progression only when every set reaches the top', () => {
  assert.equal(hitTop(pushUp, [15, 15, 14]), false);
  assert.equal(hitTop(pushUp, [15, 15]), false, 'all three sets are needed');
  assert.equal(hitTop(pushUp, [15, 16, 15]), true);
  assert.equal(progression(pushUp, 'Push ups', [15, 15, 14]), null);
  assert.deepEqual(progression(pushUp, 'Push ups', [15, 15, 15]), { kind: 'variation', next: 'Decline push ups' });
  assert.deepEqual(progression(pushUp, 'Incline push ups', [15, 15, 15]), { kind: 'variation', next: 'Push ups' });
  assert.deepEqual(progression(pushUp, 'Archer push ups', [15, 15, 15]), { kind: 'harder' }, 'last variation of the list');
  assert.deepEqual(progression(splitSquat, 'Bulgarian split squats', [12, 12, 12]), { kind: 'harder' });
  assert.equal(progression(plank, 'Plank', [45, 45, 40]), null);
});

test('strength: pull ups need a bar', () => {
  assert.deepEqual(availableVariations(pull, { pullUpBar: false }), ['Table rows']);
  assert.deepEqual(availableVariations(pull, { pullUpBar: true }), ['Table rows', 'Pull ups']);
  assert.deepEqual(progression(pull, 'Table rows', [10, 10, 10], { pullUpBar: false }), { kind: 'harder' });
  assert.deepEqual(progression(pull, 'Table rows', [10, 10, 10], { pullUpBar: true }), { kind: 'variation', next: 'Pull ups' });
});

test('strength: the variation shown is the one used last time', () => {
  assert.equal(currentVariation(pushUp, null, {}), 'Push ups', 'starts with standard push ups');
  assert.equal(currentVariation(pushUp, { variation: 'Decline push ups', sets: [8, 8, 8] }, {}), 'Decline push ups');
  assert.equal(currentVariation(pull, null, { pullUpBar: false }), 'Table rows');
  assert.equal(currentVariation(pull, { variation: 'Pull ups', sets: [5, 4, 4] }, { pullUpBar: false }), 'Table rows', 'no bar any more');
});
