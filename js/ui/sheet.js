// A sheet slides up from the bottom on a phone and sits in the middle on a desktop.
// It uses the browser's <dialog>, so Escape and focus handling come for free.

import { h } from './dom.js';
import { icon } from './icons.js';

const layer = () => document.getElementById('layer');

// openSheet({ eyebrow, title, body, footer, onClose }) -> { close, setBody, setFooter, el }
// body and footer are DOM nodes (or arrays of nodes).
export function openSheet({ eyebrow, title, body, footer, onClose } = {}) {
  const bodyEl = h('div', { class: 'sheet-body' }, body);
  const footEl = h('div', { class: 'sheet-foot', hidden: !footer }, footer);
  const titleEl = h('h2', { class: 'sheet-title' }, title);
  const dlg = h('dialog', { class: 'sheet' },
    h('div', { class: 'sheet-in' },
      h('div', { class: 'sheet-head' },
        h('div', { class: 'sheet-heading' }, eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null, titleEl),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => dlg.close() }, icon('close')),
      ),
      bodyEl,
      footEl,
    ),
  );
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => {
    dlg.remove();
    onClose?.();
  });
  layer().append(dlg);
  dlg.showModal();
  return {
    el: dlg,
    close: () => dlg.close(),
    setTitle(text) { titleEl.textContent = text; },
    setBody(...nodes) { bodyEl.replaceChildren(...nodes.flat().filter(Boolean)); },
    setFooter(...nodes) {
      const list = nodes.flat().filter(Boolean);
      footEl.replaceChildren(...list);
      footEl.hidden = list.length === 0;
    },
  };
}

// A yes / no question. Resolves to true or false.
export function confirmSheet({ title, message, confirm = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const sheet = openSheet({
      title,
      body: h('p', { class: 'sheet-text' }, message),
      footer: [
        h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => sheet.close() }, cancel),
        h('button', {
          class: danger ? 'btn btn-danger' : 'btn btn-solid',
          type: 'button',
          onclick: () => { answer = true; sheet.close(); },
        }, confirm),
      ],
      onClose: () => resolve(answer),
    });
  });
}

// Small message at the bottom of the screen. action: { label, run }.
let toastTimer = null;
export function toast(message, { action, ms = 3200 } = {}) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' },
    h('span', {}, message),
    action ? h('button', { class: 'toast-btn', type: 'button', onclick: () => { el.remove(); action.run(); } }, action.label) : null,
  );
  // Inside an open sheet the toast must sit in the top layer too, or it hides behind it.
  (document.querySelector('dialog.sheet[open]') ?? layer()).append(el);
  toastTimer = setTimeout(() => el.remove(), ms);
}
