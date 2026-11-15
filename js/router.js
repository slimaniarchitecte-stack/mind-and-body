// Hash router: #/today, #/week/2026-11-23, #/body/strength/a ...
// A screen is a function (root, route) that fills `root` and may return a cleanup function.

const screens = new Map();
let root = null;
let cleanup = null;
let currentName = null;
let onChange = () => {};
let pending = false;

export function register(name, render) {
  screens.set(name, render);
}

export function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const name = screens.has(parts[0]) ? parts[0] : 'today';
  return { name, params: screens.has(parts[0]) ? parts.slice(1) : [] };
}

export function navigate(path) {
  const target = `#/${path}`;
  if (location.hash === target) refresh();
  else location.hash = target;
}

function render(keepScroll) {
  const route = currentRoute();
  const y = window.scrollY;
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  root.replaceChildren();
  try {
    cleanup = screens.get(route.name)(root, route) ?? null;
  } catch (err) {
    console.error(err);
    const box = document.createElement('p');
    box.className = 'note note-warn';
    box.textContent = `This screen failed to open: ${err.message}`;
    root.append(box);
  }
  const sameScreen = currentName === route.name;
  currentName = route.name;
  window.scrollTo(0, keepScroll && sameScreen ? y : 0);
  onChange(route);
}

// Draw the current screen again (after a data change), keeping the scroll position.
export function refresh() {
  if (pending || !root) return;
  pending = true;
  // A timer, not requestAnimationFrame: it also runs while the app is in the background.
  setTimeout(() => {
    pending = false;
    render(true);
  }, 0);
}

export function start(rootEl, options = {}) {
  root = rootEl;
  onChange = options.onChange ?? onChange;
  window.addEventListener('hashchange', () => render(false));
  render(false);
}
