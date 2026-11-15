// Backup in the browser: build the file, download or share it, and load one back.
// Nothing is sent anywhere. The file stays on my device until I move it myself.

import { store } from './store.js';
import { db } from './db.js';
import * as clock from './clock.js';
import { buildBackup, readBackup, mergeData, usedPhotoIds, backupFileName } from './core/backup.js';
import { toISO } from './core/dates.js';
import { resetPhotoCache } from './photos.js';
import { applyTheme } from './theme.js';

const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

function dataURLToBlob(dataURL) {
  const comma = dataURL.indexOf(',');
  const mime = /^data:(.*?)(;|,)/.exec(dataURL)?.[1] || 'image/jpeg';
  const binary = atob(dataURL.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// The whole backup as an object. Photos are included as text, only the ones still in use.
export async function createBackup({ withPhotos = true } = {}) {
  const snap = store.snapshot();
  const photos = [];
  if (withPhotos) {
    const used = usedPhotoIds(snap.records);
    for (const p of await db.all('photos')) {
      if (!used.has(p.id) || !p.blob) continue;
      photos.push({ id: p.id, width: p.width, height: p.height, createdAt: p.createdAt, data: await blobToDataURL(p.blob) });
    }
  }
  return buildBackup({ ...snap, photos }, clock.now().toISOString());
}

// Give a file to the browser to save.
export function saveFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Can this device hand a file to the share sheet (useful on a phone: "Save to Files", Drive ...)?
export function canShareFiles() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File(['{}'], 'test.json', { type: 'application/json' })] }));
  } catch {
    return false;
  }
}

async function remember(backup) {
  await store.setKV('lastBackup', { at: backup.exportedAt, days: backup.days.length, records: backup.records.length, photos: backup.photos.length });
}

export async function downloadBackup(options) {
  const backup = await createBackup(options);
  saveFile(backupFileName(toISO(clock.now())), JSON.stringify(backup), 'application/json');
  await remember(backup);
  return backup;
}

export async function shareBackup(options) {
  const backup = await createBackup(options);
  const file = new File([JSON.stringify(backup)], backupFileName(toISO(clock.now())), { type: 'application/json' });
  await navigator.share({ files: [file], title: 'Mind and Body backup' });
  await remember(backup);
  return backup;
}

// Read a file picked by the user. Throws an Error with a readable message when it is not a backup.
export async function parseBackupFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('This file could not be read as a backup.');
  }
  return readBackup(parsed);
}

const toStored = (p) => ({ id: p.id, blob: dataURLToBlob(p.data), width: p.width, height: p.height, createdAt: p.createdAt });

// mode: 'replace' deletes everything here first. 'merge' adds the backup to what is here.
export async function importBackup(backup, mode) {
  if (mode === 'replace') {
    await db.clear('photos');
    for (const p of backup.photos) await db.put('photos', toStored(p));
    await store.replaceAll({ kv: backup.kv, days: backup.days, records: backup.records });
  } else {
    const snap = store.snapshot();
    const photoIds = (await db.all('photos')).map((p) => p.id);
    const merged = mergeData({ ...snap, photoIds }, backup);
    for (const p of merged.photos) await db.put('photos', toStored(p));
    await store.replaceAll(merged);
  }
  resetPhotoCache();
  applyTheme(store.settings.theme);
}

// Delete photos that no entry points to any more (left behind when a photo is removed from an entry).
export async function cleanUnusedPhotos() {
  const used = usedPhotoIds([...store.state.records.values()]);
  let removed = 0;
  for (const p of await db.all('photos')) {
    if (!used.has(p.id)) {
      await db.del('photos', p.id);
      removed += 1;
    }
  }
  return removed;
}
