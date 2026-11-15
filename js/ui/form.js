// One form sheet for every kind of log entry (sketch, study, visit, idea, book, session ...).
//
// recordSheet({
//   type: 'sketch', title: 'Sketch', eyebrow: 'Create', existing, defaults: { date },
//   fields: [
//     { key: 'date', label: 'Date', kind: 'date' },
//     { key: 'title', label: 'Subject', kind: 'text', required: true },
//     { key: 'note', label: 'Note', kind: 'textarea' },
//     { key: 'subject', label: 'Kind', kind: 'chips', options: ['A space', 'A building'] },
//     { key: 'tags', label: 'Tags', kind: 'tags' },
//     { key: 'minutes', label: 'Minutes', kind: 'number', min: 1, max: 600 },
//     { key: 'photos', label: 'Photos', kind: 'photos' },
//   ],
//   onSave(record) {}, onDelete(record) {},
// })

import { h } from './dom.js';
import { icon } from './icons.js';
import { openSheet, toast } from './sheet.js';
import { chips, field } from './parts.js';
import { store } from '../store.js';
import { photoPicker, deletePhoto } from '../photos.js';

const optionOf = (o) => (typeof o === 'string' ? { value: o, label: o } : o);

// persist: false means "do not store a record, just give the values to onSave".
export function recordSheet({ type, title, eyebrow, fields, existing, defaults = {}, onSave, onDelete, saveLabel = 'Save', savedText, persist = true }) {
  const values = { ...defaults, ...(existing ?? {}) };
  const readers = [];
  const error = h('p', { class: 'form-error', hidden: true });

  const controls = fields.map((f) => {
    if (f.kind === 'chips') {
      const slot = h('div');
      const draw = () => slot.replaceChildren(chips(f.options.map(optionOf), values[f.key] ?? null, (v) => {
        values[f.key] = values[f.key] === v && !f.required ? null : v;
        draw();
      }));
      draw();
      return h('div', { class: 'field' }, h('span', { class: 'field-label' }, f.label), slot, f.hint ? h('span', { class: 'field-hint' }, f.hint) : null);
    }
    if (f.kind === 'photos') {
      values[f.key] = [...(values[f.key] ?? [])];
      return h('div', { class: 'field' }, h('span', { class: 'field-label' }, f.label), photoPicker(values[f.key]));
    }
    let input;
    if (f.kind === 'textarea') {
      input = h('textarea', { class: 'input', rows: f.rows ?? 3, maxlength: f.max ?? 2000, placeholder: f.placeholder, value: values[f.key] ?? '' });
      readers.push(() => { values[f.key] = input.value.trim(); });
    } else if (f.kind === 'number') {
      input = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: f.min, max: f.max, step: f.step ?? 'any', placeholder: f.placeholder, value: values[f.key] ?? '' });
      readers.push(() => { values[f.key] = input.value === '' ? null : Number(input.value); });
    } else if (f.kind === 'date') {
      input = h('input', { class: 'input', type: 'date', value: values[f.key] ?? '', max: f.max });
      readers.push(() => { values[f.key] = input.value; });
    } else if (f.kind === 'tags') {
      input = h('input', { class: 'input', type: 'text', maxlength: 120, placeholder: f.placeholder ?? 'Separated by commas', value: (values[f.key] ?? []).join(', ') });
      readers.push(() => {
        values[f.key] = [...new Set(input.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
      });
    } else {
      input = h('input', { class: 'input', type: f.kind === 'url' ? 'url' : 'text', maxlength: f.max ?? 160, placeholder: f.placeholder, value: values[f.key] ?? '', inputmode: f.kind === 'url' ? 'url' : null });
      readers.push(() => { values[f.key] = input.value.trim(); });
    }
    return field(f.label, input, f.hint);
  });

  async function save() {
    for (const read of readers) read();
    const missing = fields.find((f) => f.required && (values[f.key] == null || values[f.key] === '' || (Array.isArray(values[f.key]) && !values[f.key].length)));
    if (missing) {
      error.textContent = `${missing.label}: this one is needed.`;
      error.hidden = false;
      return;
    }
    const rec = persist ? await store.putRecord({ ...values, type }) : { ...values };
    await onSave?.(rec);
    sheet.close();
    toast(savedText ?? 'Saved.');
  }

  const sheet = openSheet({
    eyebrow,
    title,
    body: [...controls, error],
    footer: [
      existing && (persist || onDelete)
        ? h('button', {
          class: 'btn btn-quiet btn-icon', type: 'button', 'aria-label': 'Delete this entry',
          onclick: async () => {
            if (persist) {
              for (const f of fields) if (f.kind === 'photos') for (const id of existing[f.key] ?? []) await deletePhoto(id);
              await store.deleteRecord(existing.id);
            }
            await onDelete?.(existing);
            sheet.close();
            toast('Deleted.');
          },
        }, icon('trash', 18))
        : null,
      h('button', { class: 'btn btn-solid btn-grow', type: 'button', onclick: save }, saveLabel),
    ],
  });
  return sheet;
}

// A list row that opens an entry. date is optional.
export function recordRow({ date, title, detail, onclick, right }) {
  return h('button', { class: 'logrow', type: 'button', onclick },
    h('span', { class: 'logrow-date' }, date ?? ''),
    h('span', { class: 'logrow-main' }, h('b', {}, title), detail ? h('small', {}, detail) : null),
    right ?? icon('right', 16),
  );
}
