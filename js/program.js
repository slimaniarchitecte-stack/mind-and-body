// Loads the program files from data/ and lays my own edits on top of them.
//
// The files in data/ are the defaults. They are never changed by the app.
// My edits are stored separately as a "layer" per list:
//   { patches: { '<id>': { ...changed fields } }, added: [ ...new items ], removed: [ '<id>', ... ] }
// "Reset to program defaults" just deletes the layers.

// Add a file name here when you add a new file in data/.
export const DATA_FILES = ['program', 'schedule', 'habits', 'training', 'nutrition', 'tracks', 'create', 'mind'];

export async function loadProgram() {
  const entries = await Promise.all(
    DATA_FILES.map(async (name) => {
      const res = await fetch(new URL(`../data/${name}.json`, import.meta.url));
      if (!res.ok) throw new Error(`Could not load data/${name}.json (${res.status})`);
      return [name, await res.json()];
    }),
  );
  return Object.fromEntries(entries);
}

export function applyLayer(items, layer) {
  if (!layer) return items;
  const removed = new Set(layer.removed ?? []);
  const patches = layer.patches ?? {};
  const out = [];
  for (const item of items) {
    if (removed.has(item.id)) continue;
    out.push(patches[item.id] ? { ...item, ...patches[item.id], edited: true } : item);
  }
  for (const item of layer.added ?? []) out.push({ ...item, custom: true });
  return out;
}

// Returns a new layer with one change applied. Used by the editors.
export function layerPatch(layer, id, patch) {
  const next = { patches: {}, added: [], removed: [], ...(layer ?? {}) };
  const i = next.added.findIndex((x) => x.id === id);
  if (i >= 0) {
    next.added = next.added.map((x, j) => (j === i ? { ...x, ...patch } : x));
  } else {
    next.patches = { ...next.patches, [id]: { ...(next.patches[id] ?? {}), ...patch } };
  }
  return next;
}

export function layerAdd(layer, item) {
  const next = { patches: {}, added: [], removed: [], ...(layer ?? {}) };
  next.added = [...next.added, item];
  return next;
}

export function layerRemove(layer, id) {
  const next = { patches: {}, added: [], removed: [], ...(layer ?? {}) };
  if (next.added.some((x) => x.id === id)) {
    next.added = next.added.filter((x) => x.id !== id);
  } else {
    next.removed = [...new Set([...next.removed, id])];
  }
  return next;
}

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Deep merge for settings: b wins, arrays are replaced as a whole.
export function deepMerge(a, b) {
  if (!isObject(a) || !isObject(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObject(v) && isObject(a[k]) ? deepMerge(a[k], v) : v;
  return out;
}
