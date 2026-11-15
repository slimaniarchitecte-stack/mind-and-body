// IndexedDB, wrapped in a few small promise functions.
//
// Stores:
//   kv       key -> value   settings, my edits to the program, unlock state, lists
//   days     one record per date (block status, water, journal, ...)
//   records  every log entry (training, learning, sketches, books, ...), each with a `type`
//   photos   JPEG blobs
//
// If the browser has no IndexedDB (some private modes), the app still runs, in memory only.

const DB_NAME = 'mind-and-body';
const DB_VERSION = 1;
export const STORES = ['kv', 'days', 'records', 'photos'];

let handle = null;
let memory = null;

function upgrade(database) {
  if (!database.objectStoreNames.contains('kv')) database.createObjectStore('kv');
  if (!database.objectStoreNames.contains('days')) database.createObjectStore('days', { keyPath: 'date' });
  if (!database.objectStoreNames.contains('records')) {
    const s = database.createObjectStore('records', { keyPath: 'id' });
    s.createIndex('type', 'type');
  }
  if (!database.objectStoreNames.contains('photos')) database.createObjectStore('photos', { keyPath: 'id' });
}

const wait = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

function run(storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = handle.transaction(storeName, mode);
    let result;
    Promise.resolve(fn(tx.objectStore(storeName))).then((r) => { result = r; }, reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const keyOf = (storeName, value) => (storeName === 'days' ? value.date : value.id);

export const db = {
  persistent: true,

  async open() {
    if (handle || memory) return;
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => upgrade(req.result);
      handle = await wait(req);
      handle.onversionchange = () => handle.close();
    } catch (err) {
      console.warn('IndexedDB is not available, data will not be saved.', err);
      memory = Object.fromEntries(STORES.map((s) => [s, new Map()]));
      this.persistent = false;
    }
  },

  // All values of a store.
  async all(storeName) {
    if (memory) return [...memory[storeName].values()];
    return run(storeName, 'readonly', (s) => wait(s.getAll()));
  },

  // The kv store as a plain object { key: value }.
  async entries(storeName = 'kv') {
    if (memory) return Object.fromEntries(memory[storeName]);
    return run(storeName, 'readonly', async (s) => {
      const [keys, values] = await Promise.all([wait(s.getAllKeys()), wait(s.getAll())]);
      return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
    });
  },

  async get(storeName, key) {
    if (memory) return memory[storeName].get(key);
    return run(storeName, 'readonly', (s) => wait(s.get(key)));
  },

  // For kv pass the key; days and records carry their own key.
  async put(storeName, value, key) {
    if (memory) {
      memory[storeName].set(key ?? keyOf(storeName, value), value);
      return;
    }
    await run(storeName, 'readwrite', (s) => wait(key === undefined ? s.put(value) : s.put(value, key)));
  },

  async putMany(storeName, values) {
    if (memory) {
      for (const v of values) memory[storeName].set(keyOf(storeName, v), v);
      return;
    }
    await run(storeName, 'readwrite', (s) => Promise.all(values.map((v) => wait(s.put(v)))));
  },

  async del(storeName, key) {
    if (memory) {
      memory[storeName].delete(key);
      return;
    }
    await run(storeName, 'readwrite', (s) => wait(s.delete(key)));
  },

  async clear(storeName) {
    if (memory) {
      memory[storeName].clear();
      return;
    }
    await run(storeName, 'readwrite', (s) => wait(s.clear()));
  },
};
