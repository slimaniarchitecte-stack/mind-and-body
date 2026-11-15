// The current time. Everything in the app asks this file, never Date.now() directly.
//
// To preview another day, add ?now=2026-11-18T10:30 to the address. The app remembers it.
// Add ?now=off to go back to the real time.

const KEY = 'mb-now';
let offset = 0;

export function initClock() {
  try {
    const param = new URLSearchParams(location.search).get('now');
    if (param === 'off') localStorage.removeItem(KEY);
    else if (param) localStorage.setItem(KEY, JSON.stringify({ at: param, set: Date.now() }));
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved) {
      const t = new Date(saved.at).getTime();
      if (!Number.isNaN(t)) offset = t - saved.set;
    }
  } catch {
    offset = 0;
  }
}

export const now = () => new Date(Date.now() + offset);

export const isSimulated = () => offset !== 0;

export function stopSimulation() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
  offset = 0;
}
