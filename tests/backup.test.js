import { test, assert } from './harness.js';
import { FORMAT, SCHEMA, buildBackup, readBackup, mergeData, usedPhotoIds, backupFileName, describeBackup } from '../js/core/backup.js';

const sample = () => ({
  kv: { settings: { theme: 'dark' }, unlocks: { s2: { activatedOn: '2026-11-30' } }, unlockNotice: { stageId: 's2' }, lastBackup: { at: 'x' }, empty: null },
  days: [
    { date: '2026-11-17', items: { muaythai: { s: 'done' } }, water: 3500, updatedAt: '2026-11-17T21:00:00.000Z' },
    { date: '2026-11-16', items: { wake: { s: 'min' } }, weight: 70.2, journal: { win: 'a', lesson: 'b', priority: 'c' }, updatedAt: '2026-11-16T22:00:00.000Z' },
  ],
  records: [
    { id: 'sketch-2', type: 'sketch', date: '2026-11-19', title: 'Stair', photos: ['ph-1'], updatedAt: '2026-11-19T21:50:00.000Z' },
    { id: 'idea-1', type: 'idea', date: '2026-11-18', text: 'Reed shading', tags: ['facade'], updatedAt: '2026-11-18T10:00:00.000Z' },
  ],
  photos: [{ id: 'ph-1', width: 1280, height: 853, createdAt: '2026-11-19T21:49:00.000Z', data: 'data:image/jpeg;base64,AAAA' }],
});

test('backup: the file has a format, a version and everything in it', () => {
  const b = buildBackup(sample(), '2026-11-22T20:45:00.000Z');
  assert.equal(b.format, FORMAT);
  assert.equal(b.schema, SCHEMA);
  assert.equal(b.exportedAt, '2026-11-22T20:45:00.000Z');
  assert.deepEqual(b.days.map((d) => d.date), ['2026-11-16', '2026-11-17'], 'days are sorted');
  assert.deepEqual(b.records.map((r) => r.id), ['idea-1', 'sketch-2']);
  assert.equal(b.photos.length, 1);
  assert.deepEqual(Object.keys(b.kv).sort(), ['settings', 'unlocks'], 'device only keys and empty values are left out');
});

test('backup: export, clear, import gives back the same data', () => {
  const original = sample();
  const text = JSON.stringify(buildBackup(original, '2026-11-22T20:45:00.000Z'));
  const restored = readBackup(JSON.parse(text));
  const byDate = (a, b) => a.date.localeCompare(b.date);
  const byId = (a, b) => a.id.localeCompare(b.id);
  assert.deepEqual(restored.days, [...original.days].sort(byDate));
  assert.deepEqual(restored.records, [...original.records].sort(byId));
  assert.deepEqual(restored.photos, original.photos);
  assert.deepEqual(restored.kv, { settings: original.kv.settings, unlocks: original.kv.unlocks });
});

test('backup: a wrong file is refused with a clear message', () => {
  const fails = (value, part) => {
    let message = '';
    try { readBackup(value); } catch (err) { message = err.message; }
    assert.ok(message.includes(part), `expected an error about "${part}", got "${message}"`);
  };
  fails(null, 'not a Mind and Body backup');
  fails({ hello: 'world' }, 'not a Mind and Body backup');
  fails({ format: FORMAT }, 'no version number');
  fails({ format: FORMAT, schema: SCHEMA + 1 }, 'newer version');
});

test('backup: broken entries are dropped, the rest is kept', () => {
  const b = readBackup({
    format: FORMAT, schema: 1,
    days: [{ date: '2026-11-16' }, { date: 'yesterday' }, null],
    records: [{ id: 'a', type: 'idea' }, { id: 5, type: 'idea' }, { type: 'idea' }],
    photos: [{ id: 'p', data: 'data:image/jpeg;base64,AA' }, { id: 'q' }],
  });
  assert.equal(b.days.length, 1);
  assert.equal(b.records.length, 1);
  assert.equal(b.photos.length, 1);
  assert.deepEqual(b.kv, {});
});

test('backup: merge keeps what I have and adds what is missing', () => {
  const current = {
    kv: { settings: { theme: 'light' } },
    days: [
      { date: '2026-11-16', water: 1000, updatedAt: '2026-11-16T23:00:00.000Z' },
      { date: '2026-11-20', water: 2000, updatedAt: '2026-11-20T20:00:00.000Z' },
    ],
    records: [{ id: 'idea-1', type: 'idea', text: 'my newer text', updatedAt: '2026-11-21T10:00:00.000Z' }],
    photoIds: ['ph-0'],
  };
  const incoming = readBackup(JSON.parse(JSON.stringify(buildBackup(sample(), 'x'))));
  const m = mergeData(current, incoming);
  const day = (date) => m.days.find((d) => d.date === date);
  assert.equal(m.days.length, 3);
  assert.equal(day('2026-11-16').water, 1000, 'my copy was changed later, it stays');
  assert.equal(day('2026-11-17').water, 3500, 'a day I did not have is added');
  assert.equal(day('2026-11-20').water, 2000);
  assert.equal(m.records.find((r) => r.id === 'idea-1').text, 'my newer text');
  assert.ok(m.records.some((r) => r.id === 'sketch-2'));
  assert.equal(m.kv.settings.theme, 'light', 'settings on this device stay');
  assert.deepEqual(m.kv.unlocks, { s2: { activatedOn: '2026-11-30' } }, 'missing keys are filled from the backup');
  assert.deepEqual(m.photos.map((p) => p.id), ['ph-1']);
  const again = mergeData({ ...current, photoIds: ['ph-1'] }, incoming);
  assert.equal(again.photos.length, 0, 'a photo I already have is not copied twice');
});

test('backup: the newer side wins, the backup wins a tie', () => {
  const mine = { kv: {}, days: [{ date: '2026-11-16', water: 1, updatedAt: '2026-11-16T10:00:00.000Z' }], records: [] };
  const newer = { kv: {}, days: [{ date: '2026-11-16', water: 2, updatedAt: '2026-11-16T12:00:00.000Z' }], records: [], photos: [] };
  const same = { kv: {}, days: [{ date: '2026-11-16', water: 3, updatedAt: '2026-11-16T10:00:00.000Z' }], records: [], photos: [] };
  assert.equal(mergeData(mine, newer).days[0].water, 2);
  assert.equal(mergeData(mine, same).days[0].water, 3);
});

test('backup: small helpers', () => {
  assert.deepEqual([...usedPhotoIds(sample().records)], ['ph-1']);
  assert.equal(backupFileName('2026-11-22'), 'mind-and-body-backup-2026-11-22.json');
  const d = describeBackup(readBackup(buildBackup(sample(), '2026-11-22T20:45:00.000Z')));
  assert.deepEqual(d, { exportedAt: '2026-11-22T20:45:00.000Z', days: 2, records: 2, photos: 1, from: '2026-11-16', to: '2026-11-17' });
});
