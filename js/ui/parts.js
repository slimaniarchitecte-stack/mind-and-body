// Small building blocks shared by the screens.

import { h, s, cx } from './dom.js';
import { icon } from './icons.js';
import { normalizeTime } from '../core/dates.js';

// Page title block: small label above, big title, optional thin second part, optional right side.
export function pageHead({ eyebrow, title, thin, side, below }) {
  return h('header', { class: 'head' },
    h('div', { class: 'head-main' },
      eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null,
      h('h1', { class: 'h1' }, title, thin ? h('span', { class: 'thin' }, ' ', thin) : null),
      below ?? null,
    ),
    side ? h('div', { class: 'head-side' }, side) : null,
  );
}

// A numbered section with a strong rule on top, like the title strip of a drawing sheet.
export function section({ no, title, meta, cls }, ...kids) {
  return h('section', { class: cx('sec', cls) },
    h('div', { class: 'sec-head' },
      no ? h('span', { class: 'sec-no' }, no) : null,
      h('h2', { class: 'sec-title' }, title),
      meta != null ? h('span', { class: 'sec-meta' }, meta) : null,
    ),
    kids,
  );
}

// Progress ring. value is 0..1 or null. label goes in the middle.
export function ring(value, { size = 64, stroke = 4, label, color = 'var(--ink)' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  const text = label ?? (value == null ? '–' : `${Math.round(v * 100)}`);
  return h('div', { class: 'ring', style: { width: `${size}px`, height: `${size}px` }, role: 'img', 'aria-label': value == null ? 'No score yet' : `${Math.round(v * 100)} percent` },
    s('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
      s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--line)', 'stroke-width': stroke }),
      s('circle', {
        cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': stroke,
        'stroke-dasharray': `${c * v} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})`,
      }),
    ),
    h('span', { class: 'ring-label' }, text, value == null ? null : h('small', {}, '%')),
  );
}

// The square tick box. status: null | 'done' | 'min' | 'skip'.
export function tick(status, { label, onclick, disabled } = {}) {
  return h('button', {
    class: 'tick', type: 'button', 'data-s': status ?? 'open', 'aria-label': label, 'aria-pressed': status === 'done' || status === 'min' ? 'true' : 'false',
    onclick, disabled,
  }, h('i', {}, status === 'done' ? icon('check', 16) : status === 'skip' ? icon('minus', 16) : null));
}

// Two or more choices in one control. options: [{ value, label }].
export function seg(options, value, onpick, { label } = {}) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': label },
    options.map((o) => h('button', {
      type: 'button', 'aria-pressed': String(o.value === value), onclick: () => onpick(o.value === value ? null : o.value),
    }, o.label)),
  );
}

// A thin progress bar.
export function bar(value, color) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  return h('div', { class: 'bar' }, h('i', { style: { width: `${v * 100}%`, background: color ?? null } }));
}

// Left bordered message box. tone: 'warn' | 'mind' | 'body' | undefined.
export function note({ title, text, tone, actions }) {
  return h('div', { class: cx('note', tone && `note-${tone}`) },
    title ? h('p', { class: 'note-title' }, title) : null,
    text ? h('p', { class: 'note-text' }, text) : null,
    actions ? h('div', { class: 'note-actions' }, actions) : null,
  );
}

// Form field with a label above.
export function field(label, control, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null,
  );
}

// A row of chips to pick from. options: [{ value, label }]. multi: values is an array.
export function chips(options, value, onpick, { multi = false } = {}) {
  const isOn = (v) => (multi ? value.includes(v) : value === v);
  return h('div', { class: 'chips' },
    options.map((o) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(isOn(o.value)), onclick: () => onpick(o.value),
    }, o.label)),
  );
}

// A time field that always shows 24 hour time (the browser's own time field follows the
// phone's language and may show AM / PM). Type 1815 or 18:15. `.value` is always 'HH:MM' or ''.
export function timeInput(value, { onchange, label } = {}) {
  const el = h('input', {
    class: 'input input-time', type: 'text', inputmode: 'numeric', autocomplete: 'off',
    placeholder: 'HH:MM', maxlength: 5, value: value ?? '', 'aria-label': label,
  });
  let last = value ?? '';
  el.addEventListener('input', () => {
    const digits = el.value.replace(/\D/g, '').slice(0, 4);
    el.value = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
  });
  el.addEventListener('change', () => {
    const clean = normalizeTime(el.value);
    if (clean == null) {
      el.value = last;
      return;
    }
    el.value = clean;
    if (clean !== last) {
      last = clean;
      onchange?.(clean);
    }
  });
  return el;
}

// Minus, number, plus. onchange(value) is called after every tap.
export function stepper(value, onchange, { step = 1, min = 0, max = 99, label = 'amount' } = {}) {
  let v = Number(value) || 0;
  const show = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
  const out = h('span', { class: 'stepper-num', 'aria-live': 'polite' }, show(v));
  const el = h('div', { class: 'stepper', role: 'group', 'aria-label': label, 'data-on': String(v > 0) });
  const set = (next) => {
    v = Math.min(max, Math.max(min, Math.round(next * 100) / 100));
    out.textContent = show(v);
    el.dataset.on = String(v > 0);
    onchange(v);
  };
  el.append(
    h('button', { type: 'button', 'aria-label': `Less ${label}`, onclick: () => set(v - step) }, icon('minus', 16)),
    out,
    h('button', { type: 'button', 'aria-label': `More ${label}`, onclick: () => set(v + step) }, icon('plus', 16)),
  );
  return el;
}

export function empty(text) {
  return h('p', { class: 'empty' }, text);
}

export const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
