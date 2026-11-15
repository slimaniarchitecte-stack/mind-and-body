// Pieces used by more than one screen: water and protein trackers, the targets card,
// the two week calorie check.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { bar, note } from '../ui/parts.js';
import { store } from '../store.js';
import { addDays, fmtDate } from '../core/dates.js';
import { waterTarget } from '../core/schedule.js';
import { targets, roundKcal, roundGrams, average7, weeklyRate, suggestAdjustment, adjustmentDue } from '../core/nutrition.js';
import { totals, proteinDots } from '../core/food.js';

export const PROTEIN_MOMENTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner'];

// ---- food log --------------------------------------------------------------------

// The foods I can log: the program list plus the ones I added myself.
export const foodList = () => store.list('nutrition', 'foods');

// Change the food log of a day. A meal that reaches 20 g of protein ticks its protein dot.
export function changeFoodLog(date, mutate) {
  const threshold = store.state.data.nutrition.proteinMomentG ?? 20;
  return store.updateDay(date, (d) => {
    d.foodLog = mutate(d.foodLog ?? []);
    const earned = proteinDots(d.foodLog, foodList(), threshold);
    d.protein = [0, 1, 2, 3].map((i) => Boolean(d.protein?.[i]) || earned[i]);
  });
}

// What I ate on a date against the targets: { kcal, protein, targetKcal, targetProtein, lines }.
export function foodSummary(ctx, date) {
  const log = store.day(date).foodLog ?? [];
  const t = totals(log, foodList());
  const target = currentTargets(ctx, date);
  return { kcal: t.kcal, protein: t.protein, byMeal: t.byMeal, lines: log.length, targetKcal: roundKcal(target.kcal), targetProtein: roundGrams(target.protein) };
}

const num = (v) => Math.round(v).toLocaleString('en-US');
const signed = (v, digits = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;

// ---- water ---------------------------------------------------------------------

export function waterCell(ctx, date, day) {
  const target = waterTarget(ctx, date);
  const step = ctx.water?.stepMl ?? 250;
  const add = (ml) => store.updateDay(date, (d) => { d.water = Math.max(0, (d.water ?? 0) + ml); });
  return h('div', { class: 'cell cell-wide' },
    h('div', { class: 'cell-top' },
      h('span', { class: 'eyebrow' }, 'Water'),
      h('span', { class: 'cell-figure' }, h('b', {}, ((day.water ?? 0) / 1000).toFixed(2)), ` / ${(target / 1000).toFixed(1)} L`),
    ),
    bar((day.water ?? 0) / target, 'var(--c-learn)'),
    h('div', { class: 'cell-actions' },
      h('button', { class: 'btn btn-quiet btn-icon', type: 'button', 'aria-label': `Remove ${step} ml`, onclick: () => add(-step), disabled: !(day.water > 0) }, icon('minus', 18)),
      h('button', { class: 'btn btn-grow', type: 'button', onclick: () => add(step) }, icon('plus', 18), `${step} ml`),
    ),
  );
}

// ---- protein -------------------------------------------------------------------

export function proteinCell(date, day) {
  const toggle = (i) => store.updateDay(date, (d) => {
    d.protein = PROTEIN_MOMENTS.map((_, j) => (j === i ? !d.protein?.[j] : Boolean(d.protein?.[j])));
  });
  return h('div', { class: 'cell cell-wide protein-meals' },
    h('span', { class: 'eyebrow' }, 'Protein with my meals'),
    h('div', { class: 'dots' }, PROTEIN_MOMENTS.map((name, i) => h('button', {
      class: 'dot', type: 'button', 'aria-pressed': String(Boolean(day.protein?.[i])), 'aria-label': `Protein at ${name.toLowerCase()}`,
      onclick: () => toggle(i),
    }, h('i', {}), h('span', {}, name)))),
    h('span', { class: 'cell-hint' }, `${(day.protein ?? []).filter(Boolean).length} of 4 meals checked. Tap a meal if you ate protein, such as eggs, fish, beans or chicken. Logging 20 g for a meal checks it automatically. These checks do not measure grams.`),
  );
}

// ---- targets -------------------------------------------------------------------

export function nutritionState() {
  return { adjust: 0, lastCheck: null, history: [], ...store.kv('nutrition', {}) };
}

export function currentTargets(ctx, date) {
  const formula = store.state.data.nutrition.formula;
  return targets(ctx.settings.profile, date, formula, nutritionState().adjust);
}

// The card with calories and macros, and the formula spelled out.
export function targetsCard(ctx, date) {
  const formula = store.state.data.nutrition.formula;
  const p = ctx.settings.profile;
  const t = currentTargets(ctx, date);
  const goal = formula.goals[p.goal] ?? { label: p.goal, delta: 0 };
  const figure = (label, value, unit) => h('div', { class: 'tg-cell' },
    h('span', { class: 'eyebrow' }, label),
    h('span', { class: 'tg-num' }, h('b', {}, value), unit),
  );
  return h('div', { class: 'targets' },
    h('div', { class: 'tg-main' },
      h('span', { class: 'eyebrow' }, `${goal.label} · daily target`),
      h('span', { class: 'tg-kcal' }, h('b', {}, num(roundKcal(t.kcal))), ' kcal'),
    ),
    h('div', { class: 'tg-row' },
      figure('Protein', roundGrams(t.protein), ' g'),
      figure('Fat', roundGrams(t.fat), ' g'),
      figure('Carbs', roundGrams(t.carbs), ' g'),
    ),
    h('details', { class: 'tg-how' },
      h('summary', {}, 'How it is calculated'),
      h('ol', {},
        h('li', {}, `Resting energy (Mifflin St Jeor): 10 × ${p.weightKg} kg + 6.25 × ${p.heightCm} cm − 5 × ${t.age} years + 5 = ${num(t.bmr)} kcal.`),
        h('li', {}, `Activity factor ${p.activityFactor}: ${num(t.bmr)} × ${p.activityFactor} = ${num(t.maintenance)} kcal to stay the same.`),
        h('li', {}, `${goal.label}: ${t.delta >= 0 ? '+' : '−'}${Math.abs(t.delta)} kcal${t.adjust ? `, and ${t.adjust > 0 ? '+' : '−'}${Math.abs(t.adjust)} kcal from my two week checks` : ''} = ${num(t.kcal)} kcal.`),
        h('li', {}, `Protein ${formula.proteinPerKg} g per kg, fat ${formula.fatPerKg} g per kg, carbs fill the rest.`),
      ),
    ),
    h('p', { class: 'tg-note' }, 'Estimates from a standard formula, not medical advice.'),
    hasOwnProfile()
      ? null
      : h('p', { class: 'tg-note is-todo' }, 'These targets use the rough starting values of the program. ',
        h('a', { href: '#/settings' }, 'Type your real birth date, height and weight in Settings'), '. They stay on this device.'),
  );
}

// Did I type my own birth date, height or weight in Settings? (The program file only holds rough values.)
export function hasOwnProfile() {
  const mine = store.kv('settings')?.profile ?? {};
  return mine.birthDate != null || mine.heightCm != null || mine.weightKg != null;
}

// ---- two week check ------------------------------------------------------------

// Returns a note element, or null when there is nothing to say today.
export function adjustmentCard(ctx, today) {
  const cfg = store.state.data.nutrition.formula.adjust;
  const state = nutritionState();
  const start = ctx.program.startDate;
  if (today < start) return null;
  const lastCheck = state.lastCheck ?? start;
  const nextDate = addDays(lastCheck, cfg.everyDays);
  if (!adjustmentDue(lastCheck, today, cfg.everyDays)) {
    return h('p', { class: 'tg-next' }, `Next two week check: ${fmtDate(nextDate, 'long')}.`);
  }

  const weights = store.weights();
  const rate = weeklyRate(weights, today, cfg.minWeighIns);
  const close = (entry, patch = {}) => store.setKV('nutrition', {
    ...state, ...patch, lastCheck: today, history: [...state.history, { date: today, ...entry }],
  });

  if (!rate) {
    return note({
      title: 'Two week check: not enough weigh-ins',
      text: 'The check compares two 7 day averages. Weigh yourself at least 4 mornings a week and it will come back here.',
      actions: h('button', { class: 'btn btn-small btn-quiet', type: 'button', onclick: () => close({ skipped: true }) }, 'Check again in two weeks'),
    });
  }

  const s = suggestAdjustment(rate.perWeek, ctx.settings.profile.goal, cfg);
  const trend = `Your 7 day average went from ${rate.then.toFixed(1)} to ${rate.now.toFixed(1)} kg in two weeks: ${signed(rate.perWeek)} kg per week.`;
  if (!s) {
    return note({
      tone: 'mind',
      title: ctx.settings.profile.goal === 'leanBulk' ? 'Two week check: on track' : 'Two week check',
      text: ctx.settings.profile.goal === 'leanBulk'
        ? `${trend} That is inside the ${cfg.low} to ${cfg.high} kg range. Keep the targets.`
        : `${trend} The program only has an automatic rule for the lean bulk.`,
      actions: h('button', { class: 'btn btn-small', type: 'button', onclick: () => close({ perWeek: rate.perWeek, kcal: 0 }) }, 'OK'),
    });
  }
  const more = s.kcal > 0;
  return note({
    tone: 'body',
    title: `Two week check: ${more ? '+' : '−'}${Math.abs(s.kcal)} kcal suggested`,
    text: `${trend} ${more ? `That is under ${cfg.low} kg. Add one calorie booster a day (olive oil, nuts, peanut butter, a glass of milk).` : `That is over ${cfg.high} kg. Take one booster or one extra portion out of the day.`}`,
    actions: [
      h('button', {
        class: 'btn btn-small btn-solid', type: 'button',
        onclick: () => close({ perWeek: rate.perWeek, kcal: s.kcal, accepted: true }, { adjust: state.adjust + s.kcal }),
      }, `Accept ${more ? '+' : '−'}${Math.abs(s.kcal)} kcal`),
      h('button', { class: 'btn btn-small btn-quiet', type: 'button', onclick: () => close({ perWeek: rate.perWeek, kcal: s.kcal, accepted: false }) }, 'Not now'),
    ],
  });
}

// Short text about the weight trend: { avgText, rateText, avg }.
export function trendSummary(today) {
  const weights = store.weights();
  const { avg, n } = average7(weights, today);
  const rate = weeklyRate(weights, today);
  return {
    avg,
    n,
    avgText: avg == null ? 'No weigh-in this week' : `${avg.toFixed(1)} kg`,
    rateText: rate ? `${signed(rate.perWeek)} kg per week` : 'Trend needs 2 weeks of weigh-ins',
  };
}
