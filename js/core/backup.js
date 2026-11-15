// Backup file: everything I entered, as one JSON object.
//
// {
//   format: 'mind-and-body-backup', schema: 1, exportedAt: '2026-11-22T20:45:00.000Z',
//   kv:      { settings, overrides, weekOverrides, unlocks, learn, ... },
//   days:    [ { date, items, water, journal, ... } ],
//   records: [ { id, type, date, ... } ],
//   photos:  [ { id, width, height, createdAt, data: 'data:image/jpeg;base64,...' } ]
// }

export const FORMAT = 'mind-and-body-backup';
export const SCHEMA = 1;

// Things that belong to one device, not to my data.
const DEVICE_KEYS = new Set(['unlockNotice', 'lastBackup']);

export function buildBackup({ kv, days, records, photos = [] }, exportedAt) {
  const cleanKV = Object.fromEntries(Object.entries(kv).filter(([k, v]) => !DEVICE_KEYS.has(k) && v != null));
  return {
    format: FORMAT,
    schema: SCHEMA,
    app: 'Mind and Body',
    exportedAt,
    kv: cleanKV,
    days: [...days].sort((a, b) => a.date.localeCompare(b.date)),
    records: [...records].sort((a, b) => a.id.localeCompare(b.id)),
    photos,
  };
}

// Each step brings a backup from one schema version to the next one.
// When the data format changes, add a function here and raise SCHEMA.
const MIGRATIONS = {
  // 1: (backup) => ({ ...backup, schema: 2, ...changes }),
};

export function migrate(backup) {
  let b = backup;
  while (b.schema < SCHEMA) {
    const step = MIGRATIONS[b.schema];
    if (!step) throw new Error(`No way to update a backup from version ${b.schema}.`);
    b = step(b);
  }
  return b;
}

// Checks a parsed file and returns a clean backup, or throws an Error with a readable message.
export function readBackup(parsed) {
  if (!parsed || typeof parsed !== 'object' || parsed.format !== FORMAT) {
    throw new Error('This is not a Mind and Body backup file.');
  }
  if (typeof parsed.schema !== 'number' || parsed.schema < 1) throw new Error('The backup has no version number.');
  if (parsed.schema > SCHEMA) throw new Error('This backup comes from a newer version of the app. Update the app first.');
  const b = migrate(parsed);
  const days = Array.isArray(b.days) ? b.days.filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) : [];
  const records = Array.isArray(b.records) ? b.records.filter((r) => r && typeof r.id === 'string' && typeof r.type === 'string') : [];
  const photos = Array.isArray(b.photos) ? b.photos.filter((p) => p && typeof p.id === 'string' && typeof p.data === 'string') : [];
  return { ...b, kv: b.kv && typeof b.kv === 'object' ? b.kv : {}, days, records, photos };
}

const newer = (a, b) => (a?.updatedAt ?? '') >= (b?.updatedAt ?? '');

// Merge: keep everything I have, add what the backup has.
// A day or an entry that exists on both sides: the one changed last wins (the backup wins a tie).
// Settings and my program edits on this device stay; the backup only fills what is missing.
export function mergeData(current, incoming) {
  const days = new Map(current.days.map((d) => [d.date, d]));
  for (const d of incoming.days) {
    const mine = days.get(d.date);
    if (!mine || newer(d, mine)) days.set(d.date, d);
  }
  const records = new Map(current.records.map((r) => [r.id, r]));
  for (const r of incoming.records) {
    const mine = records.get(r.id);
    if (!mine || newer(r, mine)) records.set(r.id, r);
  }
  const kv = { ...incoming.kv, ...current.kv };
  const have = new Set((current.photoIds ?? []));
  return {
    kv,
    days: [...days.values()],
    records: [...records.values()],
    photos: (incoming.photos ?? []).filter((p) => !have.has(p.id)),
  };
}

// The ids of the photos that some entry still points to.
export function usedPhotoIds(records) {
  const ids = new Set();
  for (const r of records) for (const id of r.photos ?? []) ids.add(id);
  return ids;
}

// 'mind-and-body-backup-2026-11-22.json'
export const backupFileName = (dateISO) => `mind-and-body-backup-${dateISO}.json`;

// A short summary shown before an import.
export function describeBackup(b) {
  const dates = b.days.map((d) => d.date).sort();
  return {
    exportedAt: b.exportedAt ?? null,
    days: b.days.length,
    records: b.records.length,
    photos: b.photos.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}
