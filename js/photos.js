// Photos: resized to about 1280 px, saved as JPEG in IndexedDB (never uploaded anywhere).

import { db } from './db.js';
import { h } from './ui/dom.js';
import { icon } from './ui/icons.js';

export const MAX_SIDE = 1280;
const QUALITY = 0.82;
const urls = new Map();

const uid = () => `ph-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall back to <img> below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The size after scaling the longest side down to `maxSide` (never up).
export function fitSize(width, height, maxSide = MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Resize and store a picture file. Returns the id of the stored photo.
export async function addPhoto(file) {
  const source = await decode(file);
  const size = fitSize(source.width, source.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d').drawImage(source, 0, 0, size.width, size.height);
  source.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('This picture could not be read.');
  const id = uid();
  await db.put('photos', { id, blob, width: size.width, height: size.height, createdAt: new Date().toISOString() });
  return id;
}

export async function photoURL(id) {
  if (urls.has(id)) return urls.get(id);
  const rec = await db.get('photos', id);
  if (!rec?.blob) return null;
  const url = URL.createObjectURL(rec.blob);
  urls.set(id, url);
  return url;
}

export async function deletePhoto(id) {
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
  await db.del('photos', id);
}

// Forget the cached picture addresses (after an import or "clear all data").
export function resetPhotoCache() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}

// An <img> that loads the stored photo. Tap opens it full size in a new tab.
export function photoImg(id, { alt = 'Photo', cls = 'photo' } = {}) {
  const img = h('img', { class: cls, alt, loading: 'lazy' });
  photoURL(id).then((url) => {
    if (url) img.src = url;
    else img.replaceWith(h('span', { class: `${cls} is-missing` }, 'Photo missing'));
  });
  return img;
}

// A row of thumbnails with an "add" button. ids is changed in place; onchange() is called after each change.
export function photoPicker(ids, onchange) {
  const box = h('div', { class: 'photos' });
  const input = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const draw = () => {
    box.replaceChildren(
      ...ids.map((id) => h('div', { class: 'photo-item' },
        photoImg(id, { cls: 'photo-thumb' }),
        h('button', {
          class: 'photo-x', type: 'button', 'aria-label': 'Remove this photo',
          onclick: () => {
            ids.splice(ids.indexOf(id), 1);
            draw();
            onchange?.();
          },
        }, icon('close', 14)),
      )),
      h('button', { class: 'photo-add', type: 'button', onclick: () => input.click() }, icon('photo', 20), h('span', {}, 'Add photo')),
      input,
    );
  };
  input.addEventListener('change', async () => {
    for (const file of input.files) {
      try {
        ids.push(await addPhoto(file));
      } catch (err) {
        console.warn(err);
      }
    }
    input.value = '';
    draw();
    onchange?.();
  });
  draw();
  return box;
}
