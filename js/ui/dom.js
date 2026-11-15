// Tiny helpers to build the page without a framework.

const DIRECT = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'open', 'readOnly', 'htmlFor', 'tabIndex']);

function append(el, kids) {
  for (const kid of kids) {
    if (kid == null || kid === false || kid === true) continue;
    if (Array.isArray(kid)) append(el, kid);
    else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

// h('button', { class: 'btn', onclick: fn }, 'Save')
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith('--')) el.style.setProperty(p, val);
        else el.style[p] = val;
      }
    } else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (DIRECT.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

// Build an SVG element from a string that we wrote ourselves (never from user text).
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

// SVG element with attributes, for charts drawn from data.
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    el.setAttribute(k, String(v));
  }
  append(el, kids);
  return el;
}

export const cx = (...names) => names.filter(Boolean).join(' ');

// Run fn at most once per `ms` after the last call (for saving while typing).
// flush() runs a waiting call right away (on blur, or when leaving the screen).
export function debounce(fn, ms = 400) {
  let t = null;
  let lastArgs = [];
  const wrapped = (...args) => {
    lastArgs = args;
    clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...lastArgs);
    }, ms);
  };
  wrapped.flush = () => {
    if (t == null) return;
    clearTimeout(t);
    t = null;
    fn(...lastArgs);
  };
  return wrapped;
}
