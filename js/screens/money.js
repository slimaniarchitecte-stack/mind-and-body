// Money: my income for the month, what I spent by category, and what is left per day.
// Every amount is typed by me. The app knows no prices.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, section, bar, chips, empty } from '../ui/parts.js';
import { openSheet, toast } from '../ui/sheet.js';
import { recordRow } from '../ui/form.js';
import { store } from '../store.js';
import * as clock from '../clock.js';
import { appDate, fmtDate } from '../core/dates.js';
import { MONEY_CATS, catOf, monthMoney } from '../core/money.js';

export const dh = (v) => `${Math.round(v).toLocaleString('en-US')} DH`;
const catLabel = (id) => MONEY_CATS.find((c) => c.id === id)?.label ?? 'Other';

// One sheet to add or edit a spending: amount first (the keyboard opens at once), then one tap
// on a category. The last category I used is picked already.
export function openSpendSheet({ existing, cat } = {}) {
  const today = appDate(clock.now(), store.ctx().program.dayStartHour);
  const state = { cat: existing ? catOf(existing) : cat ?? store.kv('lastSpendCat', 'food') };
  const amount = h('input', {
    class: 'input input-big', type: 'number', inputmode: 'decimal', min: 0, max: 100000, step: 0.5,
    placeholder: '0', value: existing?.amount ?? '', 'aria-label': 'Amount in DH',
  });
  const what = h('input', { class: 'input', type: 'text', maxlength: 80, placeholder: 'What (optional)', value: existing?.what ?? '', 'aria-label': 'What' });
  const date = h('input', { class: 'input', type: 'date', max: today, value: existing?.date ?? today, 'aria-label': 'Date' });
  const catSlot = h('div');
  const drawCats = () => catSlot.replaceChildren(chips(MONEY_CATS.map((c) => ({ value: c.id, label: c.label })), state.cat, (v) => { state.cat = v; drawCats(); }));
  drawCats();

  const save = async () => {
    const value = Number(amount.value);
    if (!(value > 0)) {
      amount.focus();
      toast('Type the amount first.');
      return;
    }
    await store.putRecord({ ...(existing ?? {}), type: 'spend', amount: value, cat: state.cat, what: what.value.trim(), date: date.value || today }, { silent: true });
    await store.setKV('lastSpendCat', state.cat);
    sheet.close();
    toast(`${dh(value)} on ${catLabel(state.cat).toLowerCase()} saved.`);
  };
  amount.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

  const sheet = openSheet({
    eyebrow: 'Money',
    title: existing ? 'Edit spending' : 'I spent',
    body: [
      h('div', { class: 'money-amount' }, amount, h('span', {}, 'DH')),
      catSlot,
      h('div', { class: 'field' }, what),
      existing ? h('div', { class: 'field' }, date) : null,
    ],
    footer: [
      existing
        ? h('button', {
          class: 'btn btn-quiet btn-icon', type: 'button', 'aria-label': 'Delete this spending',
          onclick: async () => { await store.deleteRecord(existing.id); sheet.close(); toast('Deleted.'); },
        }, icon('trash', 18))
        : null,
      h('button', { class: 'btn btn-solid btn-grow', type: 'button', onclick: save }, 'Save'),
    ],
  });
  setTimeout(() => amount.focus(), 60);
  return sheet;
}

export function money(root) {
  const today = appDate(clock.now(), store.ctx().program.dayStartHour);
  const month = today.slice(0, 7);
  const income = store.settings.income ?? null;
  const spends = store.records('spend');
  const m = monthMoney(spends, month, income, today);
  const monthName = fmtDate(`${month}-01`, 'dayMonth').split(' ')[1];

  const incomeIn = h('input', {
    class: 'input', type: 'number', inputmode: 'decimal', min: 0, max: 1000000, step: 50, value: income ?? '',
    placeholder: 'DH per month', 'aria-label': 'My income per month in DH',
    onchange: (e) => {
      const v = Number(e.target.value);
      store.setSettings({ income: e.target.value === '' || !(v >= 0) ? null : v });
    },
  });

  const over = m.left != null && m.left < 0;
  const head = h('div', { class: 'money-hero' },
    h('span', { class: 'eyebrow' }, over ? 'Over this month' : `Left in ${monthName}`),
    h('b', { class: 'money-left' }, m.left == null ? '–' : dh(Math.abs(m.left))),
    income ? bar(m.total / income, over ? 'var(--danger)' : 'var(--accent)') : null,
    h('div', { class: 'money-sub' },
      h('span', {}, `Spent ${dh(m.total)}${income ? ` of ${dh(income)}` : ''}`),
      m.perDay != null && !over ? h('strong', {}, `${dh(m.perDay)} a day for ${m.daysLeft} ${m.daysLeft === 1 ? 'day' : 'days'}`) : null,
    ),
    h('button', { class: 'btn btn-solid btn-block', type: 'button', onclick: () => openSpendSheet() }, icon('plus', 18), 'I spent'),
  );

  const catsSec = section({ title: 'Where it went', meta: monthName },
    h('div', { class: 'money-cats' }, MONEY_CATS.map((c) => {
      const v = m.byCat[c.id];
      return h('button', { class: 'money-cat', type: 'button', onclick: () => openSpendSheet({ cat: c.id }) },
        h('span', { class: 'money-cat-top' }, h('span', {}, c.label), h('b', {}, dh(v))),
        bar(m.total ? v / m.total : 0, 'var(--primary)'),
      );
    })),
    h('p', { class: 'form-hint' }, 'Tap a category to add to it. Food here is the same as in Food, Shop.'),
  );

  const recent = spends.filter((r) => r.date?.startsWith(month));
  const listSec = section({ title: 'This month', meta: recent.length ? `${recent.length} ${recent.length === 1 ? 'entry' : 'entries'}` : null },
    recent.length
      ? h('div', { class: 'loglist' }, recent.slice(0, 30).map((r) => recordRow({
        date: fmtDate(r.date, 'day'), title: dh(Number(r.amount) || 0), detail: [catLabel(catOf(r)), r.what].filter(Boolean).join(' · '),
        onclick: () => openSpendSheet({ existing: r }),
      })))
      : empty('Nothing spent yet this month.'),
  );

  const incomeSec = section({ title: 'My income' },
    h('div', { class: 'inline-form' }, h('span', { class: 'field-label' }, 'Per month'), incomeIn, h('span', { class: 'field-label' }, 'DH')),
    h('p', { class: 'form-hint' }, 'What you get each month. "Left" is this minus what you spent this month.'),
  );

  root.append(
    pageHead({ eyebrow: 'Mind and Body', title: 'Money', thin: monthName }),
    h('div', { class: 'two-col' }, h('div', { class: 'col' }, head, catsSec), h('div', { class: 'col' }, listSec, incomeSec)),
  );
}
