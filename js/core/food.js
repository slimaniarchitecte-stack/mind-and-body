// Food log: what I ate, in portions, added up in calories and protein.
//
// One entry of the log:  { id, meal: 'breakfast', food: 'egg', qty: 3 }
// A food (data/nutrition.json):  { id: 'egg', name, unit, kcal, protein }   -> values for ONE portion
// The numbers are approximate. They give a clear picture, not an exact count.

import { addDays } from './dates.js';

// The five moments of the day. `dot` is the protein dot on Today that belongs to the meal.
export const MEALS = [
  { id: 'breakfast', title: 'Breakfast', dot: 0 },
  { id: 'lunch', title: 'Lunch', dot: 1 },
  { id: 'snack', title: 'Snack', dot: 2 },
  { id: 'dinner', title: 'Dinner', dot: 3 },
  { id: 'evening', title: 'Before bed', dot: null },
];

// Calories and protein of a list of entries, in total and per meal.
export function totals(entries, foods) {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const out = { kcal: 0, protein: 0, byMeal: {} };
  for (const e of entries ?? []) {
    const f = byId.get(e.food);
    const qty = Number(e.qty) || 0;
    if (!f || qty <= 0) continue;
    const kcal = f.kcal * qty;
    const protein = f.protein * qty;
    out.kcal += kcal;
    out.protein += protein;
    const meal = (out.byMeal[e.meal] ??= { kcal: 0, protein: 0, count: 0 });
    meal.kcal += kcal;
    meal.protein += protein;
    meal.count += 1;
  }
  return out;
}

// A model day as a flat list of entries (without ids).
export function planEntries(plan, mealId) {
  return plan.meals
    .filter((m) => !mealId || m.id === mealId)
    .flatMap((m) => m.items.map((it) => ({ meal: m.id, food: it.food, qty: it.qty })));
}

// Add entries to a log. The same food in the same meal is summed, not listed twice.
// makeId() gives an id to a new line.
export function addEntries(log, entries, makeId) {
  const next = (log ?? []).map((e) => ({ ...e }));
  for (const e of entries) {
    const qty = Number(e.qty) || 0;
    if (qty <= 0) continue;
    const same = next.find((x) => x.meal === e.meal && x.food === e.food);
    if (same) same.qty += qty;
    else next.push({ id: makeId(), meal: e.meal, food: e.food, qty });
  }
  return next;
}

// Which of the 4 protein dots are earned by the log: a meal with `threshold` grams of protein or more.
export function proteinDots(entries, foods, threshold = 20) {
  const t = totals(entries, foods);
  return MEALS.filter((m) => m.dot != null).map((m) => (t.byMeal[m.id]?.protein ?? 0) >= threshold);
}

// The meal that fits the time of day (minutes since midnight).
export function mealAt(minutes) {
  if (minutes < 10 * 60 + 30) return 'breakfast';
  if (minutes < 15 * 60 + 30) return 'lunch';
  if (minutes < 19 * 60) return 'snack';
  if (minutes < 22 * 60) return 'dinner';
  return 'evening';
}

// The model day that fits a date: Muay Thai day, workday or weekend.
export function planFor(plans, { isWorkday, isMuayThai }) {
  const id = isMuayThai && isWorkday ? 'muaythai' : isWorkday ? 'workday' : 'weekend';
  return plans.find((p) => p.id === id) ?? plans[0];
}

// The last n days (ending yesterday or today), with averages over the days that have a log.
export function recentFood(getDay, foods, lastDate, n = 7) {
  const days = [];
  let kcal = 0;
  let protein = 0;
  let logged = 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    const date = addDays(lastDate, -i);
    const log = getDay(date)?.foodLog ?? [];
    const t = totals(log, foods);
    const has = log.length > 0;
    days.push({ date, kcal: t.kcal, protein: t.protein, logged: has });
    if (has) {
      kcal += t.kcal;
      protein += t.protein;
      logged += 1;
    }
  }
  return { days, logged, avgKcal: logged ? kcal / logged : null, avgProtein: logged ? protein / logged : null };
}

// What I spent in a month ('2026-11'). records: [{ date, amount }].
export function monthSpend(records, month) {
  return records.reduce((sum, r) => (r.date?.startsWith(month) ? sum + (Number(r.amount) || 0) : sum), 0);
}

// 2.5 -> '2.5', 3 -> '3'
export const fmtQty = (qty) => (Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 10) / 10));
