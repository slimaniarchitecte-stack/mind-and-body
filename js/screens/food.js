// Food has three tabs:
//   Today    what I ate (in portions), water, protein, the small checklist, the last 7 days
//   My plan  what to eat: one model day per kind of day, the targets, ideas
//   Shop     my food budget, what I spent, the grocery list, the note for my family
//
// Nothing here uses prices from the app. I type what I spend myself.

import { h, cx, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, section, seg, tick, bar, chips, empty, stepper } from '../ui/parts.js';
import { openSheet, toast } from '../ui/sheet.js';
import { chart, barChart } from '../ui/charts.js';
import { recordSheet, recordRow } from '../ui/form.js';
import { store } from '../store.js';
import * as clock from '../clock.js';
import { navigate } from '../router.js';
import { layerAdd, layerRemove } from '../program.js';
import { appDate, appMinutes, addDays, dow, mondayOf, fmtDate, DAY_SHORT } from '../core/dates.js';
import { blocksForDate } from '../core/schedule.js';
import { MEALS, totals, planEntries, addEntries, mealAt, planFor, recentFood, monthSpend, fmtQty } from '../core/food.js';
import { waterCell, proteinCell, targetsCard, adjustmentCard, foodList, changeFoodLog, foodSummary } from './shared.js';

const TABS = [{ id: 'today', label: 'Today' }, { id: 'plan', label: 'My plan' }, { id: 'shop', label: 'Shop' }];
const num = (v) => Math.round(v).toLocaleString('en-US');

// The model day open in "My plan". Kept while the app is open.
let planId = null;

export function food(root, route) {
  const view = TABS.some((t) => t.id === route.params[0]) ? route.params[0] : 'today';
  const ctx = store.ctx();
  const today = appDate(clock.now(), ctx.program.dayStartHour);
  const data = store.state.data.nutrition;
  const isWorkday = ctx.settings.work.days.includes(dow(today));
  const isMuayThai = blocksForDate(ctx, today).some((b) => b.id === 'muaythai');
  const todayPlan = planFor(data.mealPlans, { isWorkday, isMuayThai });

  root.append(
    pageHead({ eyebrow: 'Mind and Body', title: 'Food', thin: view === 'today' ? fmtDate(today, 'short') : view === 'plan' ? 'what to eat' : 'budget and groceries' }),
    h('nav', { class: 'subtabs', 'aria-label': 'Food sections' }, TABS.map((t) => h('a', {
      href: t.id === 'today' ? '#/food' : `#/food/${t.id}`, 'aria-current': t.id === view ? 'page' : null,
    }, t.label))),
  );

  const env = { ctx, today, data, todayPlan };
  if (view === 'plan') return planView(root, env);
  if (view === 'shop') return shopView(root, env);
  return todayView(root, env);
}

// ---- small shared pieces --------------------------------------------------------------

const mealTitle = (id) => MEALS.find((m) => m.id === id)?.title ?? id;

// Log all the foods of one planned meal, in one tap.
async function logPlannedMeal(today, plan, mealId) {
  await changeFoodLog(today, (log) => addEntries(log, planEntries(plan, mealId), () => store.uid('f')));
  toast(`${mealTitle(mealId)} logged as planned.`);
}

function meter(label, value, goal, unit, color) {
  return h('div', { class: 'meter' },
    h('div', { class: 'cell-top' },
      h('span', { class: 'eyebrow' }, label),
      h('span', { class: 'cell-figure' }, h('b', {}, num(value)), ` / ${num(goal)} ${unit}`),
    ),
    bar(goal ? value / goal : 0, color),
  );
}

// ---- Today -----------------------------------------------------------------------------

function todayView(root, { ctx, today, data, todayPlan }) {
  const day = store.day(today);
  const foods = foodList();
  const byId = new Map(foods.map((f) => [f.id, f]));
  const sum = foodSummary(ctx, today);
  const log = day.foodLog ?? [];
  const tomorrowIsWork = ctx.settings.work.days.includes(dow(addDays(today, 1)));

  const eatenSec = section({ no: '01', title: 'Eaten today', meta: log.length ? `${log.length} ${log.length === 1 ? 'line' : 'lines'}` : 'Nothing yet' },
    h('div', { class: 'meters' },
      meter('Calories', sum.kcal, sum.targetKcal, 'kcal', 'var(--body)'),
      meter('Protein', sum.protein, sum.targetProtein, 'g', 'var(--mind)'),
    ),
    h('button', { class: 'btn btn-solid btn-block', type: 'button', style: { marginTop: '14px' }, onclick: () => openFoodSheet(today) }, icon('plus', 18), 'Log food'),
    h('p', { class: 'form-hint' }, 'Tap what you ate, in portions. No scale needed. The numbers are approximate.'),
  );

  const mealsSec = section({ no: '02', title: 'Meals', meta: `Plan: ${todayPlan.title.toLowerCase()}` },
    MEALS.map((m) => {
      const lines = log.filter((e) => e.meal === m.id);
      const planned = todayPlan.meals.find((x) => x.id === m.id);
      const got = sum.byMeal[m.id];
      const plannedTotals = planned ? totals(planEntries(todayPlan, m.id), foods) : null;
      return h('div', { class: cx('mealbox', lines.length && 'is-logged') },
        h('div', { class: 'mealbox-head' },
          h('h3', {}, planned?.title ?? m.title),
          h('span', { class: 'mealbox-sum' }, got ? `${num(got.kcal)} kcal · ${num(got.protein)} g protein` : 'Not logged'),
        ),
        lines.length
          ? h('div', { class: 'foodlines' }, lines.map((e) => {
            const f = byId.get(e.food);
            return h('button', { class: 'foodline', type: 'button', onclick: () => openEntry(today, e, f) },
              h('span', { class: 'foodline-qty' }, `${fmtQty(e.qty)} ×`),
              h('span', { class: 'foodline-name' }, f?.name ?? 'Removed food', f ? h('small', {}, f.unit) : null),
              h('span', { class: 'foodline-kcal' }, f ? num(f.kcal * e.qty) : ''),
            );
          }))
          : planned ? h('p', { class: 'mealbox-plan' }, planned.text, ` (${num(plannedTotals.kcal)} kcal, ${num(plannedTotals.protein)} g protein)`) : null,
        h('div', { class: 'mealbox-actions' },
          !lines.length && planned
            ? h('button', { class: 'btn btn-small btn-solid', type: 'button', onclick: () => logPlannedMeal(today, todayPlan, m.id) }, 'I ate this')
            : null,
          h('button', { class: 'btn btn-small btn-quiet', type: 'button', onclick: () => openFoodSheet(today, m.id) }, icon('plus', 14), lines.length ? 'Add' : 'Something else'),
        ),
      );
    }),
  );

  const checks = data.checklist.filter((c) => c.days !== 'beforeWork' || tomorrowIsWork);
  const bodySec = section({ no: '03', title: 'Water and checklist' },
    h('div', { class: 'cells' }, waterCell(ctx, today, day), proteinCell(today, day),
      h('div', { class: 'cell' },
        h('span', { class: 'eyebrow' }, 'Checklist'),
        h('span', { class: 'cell-figure' }, h('b', {}, String(checks.filter((c) => day.food?.[c.id]).length)), ` / ${checks.length}`),
        h('span', { class: 'cell-hint' }, 'A meal with 20 g of protein ticks its dot.'),
      ),
    ),
    h('div', { class: 'habs' }, checks.map((c) => {
      const on = Boolean(day.food?.[c.id]);
      return h('div', { class: cx('hab', on && 'is-done') },
        h('div', { class: 'hab-main' }, h('span', { class: 'hab-title' }, c.title), c.detail ? h('span', { class: 'blk-meta' }, c.detail) : null),
        tick(on ? 'done' : null, {
          label: `${c.title}: ${on ? 'clear' : 'mark done'}`,
          onclick: () => store.updateDay(today, (d) => {
            d.food ??= {};
            if (on) delete d.food[c.id];
            else d.food[c.id] = true;
          }),
        }),
      );
    })),
  );

  const recent = recentFood(store.getDay, foods, today, 7);
  const weekSec = section({ no: '04', title: 'Last 7 days', meta: `${recent.logged} ${recent.logged === 1 ? 'day' : 'days'} logged` },
    recent.logged
      ? [
        h('div', { class: 'stat-row' },
          h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, 'Average calories'), h('b', {}, `${num(recent.avgKcal)} kcal`)),
          h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, 'Average protein'), h('b', {}, `${num(recent.avgProtein)} g`)),
        ),
        chart((w, hgt) => barChart(w, hgt, {
          bars: recent.days.map((d) => ({ label: DAY_SHORT[dow(d.date) - 1].slice(0, 2), v: Math.round(d.kcal), strong: d.date === today })),
          goal: sum.targetKcal, color: 'var(--body)',
        }), { height: 160 }),
        h('p', { class: 'form-hint' }, 'Calories per day. Dashed line: the target. Averages only use the days you logged.'),
      ]
      : empty('Log a few days and the averages show up here.'),
  );

  root.append(h('div', { class: 'two-col' }, h('div', { class: 'col' }, eatenSec, mealsSec), h('div', { class: 'col' }, bodySec, weekSec)));
  return undefined;
}

// ---- log sheet: pick foods and portions -------------------------------------------------

function openFoodSheet(today, meal) {
  const foods = foodList();
  const state = { meal: meal ?? mealAt(appMinutes(clock.now(), 0) % 1440), qty: {}, query: '' };
  const sumLine = h('span', { class: 'sheet-sum' });
  const list = h('div', { class: 'foodpick' });
  const mealSlot = h('div');

  const drawSum = () => {
    const t = totals(Object.entries(state.qty).map(([foodId, qty]) => ({ meal: state.meal, food: foodId, qty })), foods);
    sumLine.textContent = t.kcal ? `${num(t.kcal)} kcal · ${num(t.protein)} g protein` : 'Nothing picked yet';
  };
  const drawMeals = () => mealSlot.replaceChildren(chips(MEALS.map((m) => ({ value: m.id, label: m.title })), state.meal, (v) => {
    state.meal = v;
    drawMeals();
  }));
  const drawList = () => {
    const q = state.query.trim().toLowerCase();
    const shown = q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods;
    list.replaceChildren(...(shown.length
      ? shown.map((f) => h('div', { class: 'foodrow' },
        h('div', { class: 'foodrow-main' },
          h('b', {}, f.name),
          h('small', {}, `${f.unit} · ${f.kcal} kcal · ${f.protein} g protein`),
        ),
        stepper(state.qty[f.id] ?? 0, (v) => {
          if (v > 0) state.qty[f.id] = v;
          else delete state.qty[f.id];
          drawSum();
        }, { step: f.step ?? 1, label: f.name }),
      ))
      : [empty('No food with this name. Add your own below.')]));
  };
  drawMeals();
  drawList();
  drawSum();

  const sheet = openSheet({
    eyebrow: 'Food log',
    title: 'What did you eat?',
    body: [
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Meal'), mealSlot),
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'Foods, in portions'),
        h('input', {
          class: 'input', type: 'search', placeholder: 'Search a food', 'aria-label': 'Search a food',
          oninput: (e) => { state.query = e.target.value; drawList(); },
        }),
      ),
      list,
      h('button', { class: 'btn-text', type: 'button', onclick: () => { sheet.close(); openOwnFood(); } }, 'Add my own food'),
    ],
    footer: [
      sumLine,
      h('button', {
        class: 'btn btn-solid', type: 'button',
        onclick: async () => {
          const entries = Object.entries(state.qty).map(([foodId, qty]) => ({ meal: state.meal, food: foodId, qty }));
          if (!entries.length) {
            toast('Tap + next to what you ate.');
            return;
          }
          await changeFoodLog(today, (log) => addEntries(log, entries, () => store.uid('f')));
          sheet.close();
          toast(`${mealTitle(state.meal)} logged.`);
        },
      }, 'Add'),
    ],
  });
}

// One line of the log: change the amount or remove it.
function openEntry(today, entry, foodItem) {
  let qty = entry.qty;
  const sheet = openSheet({
    eyebrow: mealTitle(entry.meal),
    title: foodItem?.name ?? 'Removed food',
    body: [
      foodItem ? h('p', { class: 'sheet-text' }, `One portion: ${foodItem.unit}. About ${foodItem.kcal} kcal and ${foodItem.protein} g of protein.`) : null,
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'Portions'),
        stepper(qty, (v) => { qty = v; }, { step: foodItem?.step ?? 1, label: 'portions' }),
      ),
    ],
    footer: [
      h('button', {
        class: 'btn btn-quiet btn-icon', type: 'button', 'aria-label': 'Remove this line',
        onclick: async () => {
          await changeFoodLog(today, (log) => log.filter((e) => e.id !== entry.id));
          sheet.close();
        },
      }, icon('trash', 18)),
      h('button', {
        class: 'btn btn-solid btn-grow', type: 'button',
        onclick: async () => {
          await changeFoodLog(today, (log) => (qty > 0 ? log.map((e) => (e.id === entry.id ? { ...e, qty } : e)) : log.filter((e) => e.id !== entry.id)));
          sheet.close();
        },
      }, 'Save'),
    ],
  });
}

// A food that is not in the list: I read the numbers on the pack.
function openOwnFood(existing) {
  recordSheet({
    type: 'food', persist: false, eyebrow: 'My own food', title: existing ? 'Edit my food' : 'Add my own food', existing,
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'unit', label: 'One portion is', kind: 'text', required: true, placeholder: 'For example: 1 pot, or 2 slices' },
      { key: 'kcal', label: 'Calories in one portion', kind: 'number', min: 1, max: 2000, step: 1, required: true },
      { key: 'protein', label: 'Protein in one portion, g', kind: 'number', min: 0, max: 200, step: 1, required: true, hint: 'Read them on the pack.' },
    ],
    savedText: 'Food saved. It is now in the list.',
    onSave: (v) => {
      const item = { id: existing?.id ?? store.uid('food'), name: v.name, unit: v.unit, kcal: Number(v.kcal), protein: Number(v.protein) || 0, step: 1 };
      const layer = existing ? layerRemove(store.layer('foods'), existing.id) : store.layer('foods');
      return store.setLayer('foods', layerAdd(layer, item));
    },
    onDelete: existing ? () => store.setLayer('foods', layerRemove(store.layer('foods'), existing.id)) : null,
  });
}

// ---- My plan -------------------------------------------------------------------------------

function planView(root, { ctx, today, data, todayPlan }) {
  const foods = foodList();
  const byId = new Map(foods.map((f) => [f.id, f]));
  planId ??= todayPlan.id;
  const plan = data.mealPlans.find((p) => p.id === planId) ?? todayPlan;
  const sum = foodSummary(ctx, today);
  const planSum = totals(planEntries(plan), foods);
  const isToday = plan.id === todayPlan.id;

  const daySec = section({ no: '01', title: 'A model day', meta: isToday ? 'This is today' : null },
    h('div', { class: 'seg-wrap' }, seg(data.mealPlans.map((p) => ({ value: p.id, label: p.title })), plan.id, (v) => {
      if (v) planId = v;
      navigate('food/plan');
    }, { label: 'Kind of day' })),
    h('div', { class: 'focus is-small' },
      h('span', { class: 'eyebrow' }, 'This day adds up to'),
      h('h3', { class: 'ai-theme' }, `${num(planSum.kcal)} kcal · ${num(planSum.protein)} g protein`),
      h('p', { class: 'focus-meta' }, `Your target: ${num(sum.targetKcal)} kcal and ${num(sum.targetProtein)} g of protein.`),
    ),
    plan.meals.map((m) => {
      const t = totals(planEntries(plan, m.id), foods);
      return h('div', { class: 'mealbox' },
        h('div', { class: 'mealbox-head' },
          h('h3', {}, h('span', { class: 'mealbox-time' }, m.time), m.title),
          h('span', { class: 'mealbox-sum' }, `${num(t.kcal)} kcal · ${num(t.protein)} g`),
        ),
        h('p', { class: 'mealbox-plan' }, m.text),
        h('ul', { class: 'planlist' }, m.items.map((it) => {
          const f = byId.get(it.food);
          return h('li', {}, h('b', {}, `${fmtQty(it.qty)} ×`), ` ${f?.name ?? it.food}`, f ? h('small', {}, ` ${f.unit}`) : null);
        })),
        isToday
          ? h('div', { class: 'mealbox-actions' }, h('button', { class: 'btn btn-small', type: 'button', onclick: () => logPlannedMeal(today, plan, m.id) }, 'I ate this today'))
          : null,
      );
    }),
    h('p', { class: 'form-hint' }, data.planNote),
  );

  const guideSec = section({ no: '02', title: 'Portions by hand' },
    h('ul', { class: 'ideas-list' }, data.portionGuide.map((line) => h('li', {}, line))),
    h('p', { class: 'form-hint' }, data.foodNote),
  );

  const targetsSec = section({ no: '03', title: 'Targets' }, targetsCard(ctx, today), adjustmentCard(ctx, today));

  const ideasSec = section({ no: '04', title: 'Ideas' },
    h('div', { class: 'ideas' },
      h('h3', { class: 'ideas-title' }, data.lowCost.title),
      h('ul', { class: 'ideas-list' }, data.lowCost.items.map((text) => h('li', {}, text))),
      h('p', { class: 'form-hint' }, data.lowCost.note),
    ),
    data.ideas.map((group) => h('div', { class: 'ideas' },
      h('h3', { class: 'ideas-title' }, group.title),
      group.note ? h('p', { class: 'form-hint' }, group.note) : null,
      h('ul', { class: cx('ideas-list', group.id === 'boosters' && 'is-inline') }, group.items.map((text) => h('li', {}, text))),
    )),
  );

  const mine = foods.filter((f) => f.custom);
  const ownSec = section({ no: '05', title: 'My own foods', meta: mine.length ? String(mine.length) : null },
    mine.length
      ? h('div', { class: 'loglist' }, mine.map((f) => recordRow({ title: f.name, detail: `${f.unit} · ${f.kcal} kcal · ${f.protein} g protein`, onclick: () => openOwnFood(f) })))
      : empty('Foods you add yourself are listed here.'),
    h('div', { class: 'focus-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => openOwnFood() }, icon('plus', 16), 'Food')),
  );

  root.append(h('div', { class: 'two-col' }, h('div', { class: 'col' }, daySec, guideSec), h('div', { class: 'col' }, targetsSec, ideasSec, ownSec)));
  return undefined;
}

// ---- Shop: budget, spending, grocery list, family note ----------------------------------------

function shopView(root, { today, data }) {
  const month = today.slice(0, 7);
  const monthName = fmtDate(`${month}-01`, 'dayMonth').split(' ')[1];
  const budget = store.kv('foodBudget', {}).monthly ?? null;
  const spends = store.records('spend');
  const spent = monthSpend(spends, month);
  const dh = (v) => `${(Math.round(v * 100) / 100).toLocaleString('en-US')} DH`;

  const logSpend = (existing) => recordSheet({
    type: 'spend', eyebrow: 'Food money', title: existing ? 'Edit' : 'I bought food', existing, defaults: { date: today },
    fields: [
      { key: 'amount', label: 'Amount, DH', kind: 'number', min: 0, max: 100000, step: 0.5, required: true },
      { key: 'what', label: 'What', kind: 'text', placeholder: 'For example: eggs, milk, oats' },
      { key: 'date', label: 'Date', kind: 'date', max: today, required: true },
    ],
    savedText: 'Saved.',
  });

  const budgetIn = h('input', {
    class: 'input', type: 'number', inputmode: 'decimal', min: 0, max: 100000, step: 10, placeholder: 'DH per month', value: budget ?? '',
    'aria-label': 'Food budget per month in dirhams',
    onchange: (e) => {
      const v = Number(e.target.value);
      store.setKV('foodBudget', { monthly: e.target.value === '' || !(v >= 0) ? null : v });
    },
  });

  const left = budget != null ? budget - spent : null;
  const moneySec = section({ no: '01', title: 'Food money', meta: monthName },
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, 'Spent this month'), h('b', {}, dh(spent))),
      h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, left != null && left < 0 ? 'Over the budget' : 'Left'), h('b', {}, left == null ? 'Set a budget' : dh(Math.abs(left)))),
    ),
    budget ? bar(spent / budget, spent > budget ? 'var(--danger)' : 'var(--c-food)') : null,
    h('div', { class: 'inline-form' },
      h('span', { class: 'field-label' }, 'My budget'),
      budgetIn,
      h('button', { class: 'btn btn-solid', type: 'button', onclick: () => logSpend() }, icon('plus', 16), 'Spent'),
    ),
    h('p', { class: 'form-hint' }, 'Only the food you pay for yourself: eggs, milk, oats, fruit. The app does not know prices. You decide the budget and type what you spend.'),
    spends.length
      ? h('div', { class: 'loglist' }, spends.slice(0, 8).map((r) => recordRow({ date: fmtDate(r.date, 'day'), title: dh(Number(r.amount) || 0), detail: r.what, onclick: () => logSpend(r) })))
      : null,
  );

  const grocery = store.kv('grocery') ?? { items: data.grocery.map((g) => ({ ...g, have: false })) };
  const saveGrocery = (items) => store.setKV('grocery', { items });
  const addIn = h('input', { class: 'input', type: 'text', maxlength: 40, placeholder: 'Add an item', 'aria-label': 'New grocery item' });
  const addItem = () => {
    const name = addIn.value.trim();
    if (name) saveGrocery([...grocery.items, { id: store.uid('g'), name, have: false }]);
  };
  addIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') addItem(); });
  const missing = grocery.items.filter((g) => !g.have).length;
  const grocerySec = section({ no: '02', title: 'Grocery list', meta: missing ? `${missing} to buy` : 'All at home' },
    h('div', { class: 'habs' }, grocery.items.map((g) => h('div', { class: cx('hab', g.have && 'is-done') },
      h('div', { class: 'hab-main' }, h('span', { class: 'hab-title' }, g.name)),
      h('div', { class: 'hab-act' },
        h('button', { class: 'icon-btn is-quiet', type: 'button', 'aria-label': `Remove ${g.name} from the list`, onclick: () => saveGrocery(grocery.items.filter((x) => x.id !== g.id)) }, icon('close', 16)),
        tick(g.have ? 'done' : null, {
          label: `${g.name}: ${g.have ? 'mark as missing' : 'mark as at home'}`,
          onclick: () => saveGrocery(grocery.items.map((x) => (x.id === g.id ? { ...x, have: !x.have } : x))),
        }),
      ),
    ))),
    h('div', { class: 'inline-form' }, addIn, h('button', { class: 'btn', type: 'button', onclick: addItem }, 'Add')),
    h('button', {
      class: 'btn-text', type: 'button',
      onclick: () => {
        saveGrocery(grocery.items.map((x) => ({ ...x, have: false })));
        toast('New week: everything is back on the list.');
      },
    }, 'Untick everything for a new week'),
  );

  const monday = mondayOf(today);
  const saveNote = debounce((text) => {
    store.setKV('familyNotes', { ...store.kv('familyNotes', {}), [monday]: text }, { silent: true });
  }, 500);
  const familySec = section({ no: '03', title: data.familyNote.title, meta: `Week of ${fmtDate(monday, 'day')}` },
    h('textarea', {
      class: 'input', rows: 3, maxlength: 600, placeholder: data.familyNote.placeholder, value: store.kv('familyNotes', {})[monday] ?? '',
      'aria-label': data.familyNote.title, oninput: (e) => saveNote(e.target.value), onblur: () => saveNote.flush(),
    }),
    h('p', { class: 'form-hint' }, 'Write it on Sunday, with the lunchbox planning.'),
  );

  root.append(h('div', { class: 'two-col' }, h('div', { class: 'col' }, moneySec), h('div', { class: 'col' }, grocerySec, familySec)));
  return () => saveNote.flush();
}
