// Calorie and macro targets, the weight trend, and the two week adjustment.
// These are estimates from a standard formula, not medical advice.

import { addDays, ageOn } from './dates.js';

// Mifflin St Jeor, male: 10 x weight + 6.25 x height - 5 x age + 5.
export function bmr({ weightKg, heightCm, age }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
}

// profile: { birthDate, heightCm, weightKg, goal, activityFactor }
// formula: the "formula" part of data/nutrition.json
// adjust:  the calories I accepted from the two week suggestions (can be negative)
export function targets(profile, date, formula, adjust = 0) {
  const age = ageOn(profile.birthDate, date);
  const base = bmr({ weightKg: profile.weightKg, heightCm: profile.heightCm, age });
  const maintenance = base * profile.activityFactor;
  const delta = formula.goals[profile.goal]?.delta ?? 0;
  const kcal = maintenance + delta + adjust;
  const protein = formula.proteinPerKg * profile.weightKg;
  const fat = formula.fatPerKg * profile.weightKg;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return { age, bmr: base, maintenance, delta, adjust, kcal, protein, fat, carbs };
}

// Round for display: calories to the nearest 50, grams to the nearest 5.
export const roundKcal = (v) => Math.round(v / 50) * 50;
export const roundGrams = (v) => Math.round(v / 5) * 5;

// ---- weight trend --------------------------------------------------------------
// entries: [{ date, kg }], any order.

// Average of the weigh-ins of the 7 days ending on `date`. Returns { avg, n } (avg is null with no data).
export function average7(entries, date) {
  const from = addDays(date, -6);
  let sum = 0;
  let n = 0;
  for (const e of entries) {
    if (e.date >= from && e.date <= date) {
      sum += e.kg;
      n += 1;
    }
  }
  return { avg: n ? sum / n : null, n };
}

// The 7 day average for every day between from and to that has enough weigh-ins behind it.
export function averageSeries(entries, from, to, minN = 2) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const { avg, n } = average7(entries, d);
    if (n >= minN) out.push({ date: d, avg });
  }
  return out;
}

// Change of the 7 day average over the last two weeks, in kg per week.
// Returns null when one of the two weeks has too few weigh-ins.
export function weeklyRate(entries, date, minN = 3) {
  const now = average7(entries, date);
  const then = average7(entries, addDays(date, -14));
  if (now.n < minN || then.n < minN) return null;
  return { now: now.avg, then: then.avg, perWeek: (now.avg - then.avg) / 2 };
}

// The app suggests, I confirm. Only the lean bulk has a rule in the program.
// Returns null (nothing to change) or { kcal: +150 | -150, why }.
export function suggestAdjustment(perWeek, goal, adjustCfg) {
  if (goal !== 'leanBulk' || perWeek == null) return null;
  if (perWeek < adjustCfg.low) return { kcal: adjustCfg.step, why: 'slow' };
  if (perWeek > adjustCfg.high) return { kcal: -adjustCfg.step, why: 'fast' };
  return null;
}

// Is it time for the two week check? lastCheck is the date of the last one (or the program start).
export function adjustmentDue(lastCheck, today, everyDays = 14) {
  return today >= addDays(lastCheck, everyDays);
}
