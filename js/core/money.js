// My money for one month: what came in, what went out, what is left.
// Every amount is typed by me. The app knows no prices.

export const MONEY_CATS = [
  { id: 'food', label: 'Food' },
  { id: 'transport', label: 'Transport' },
  { id: 'phone', label: 'Phone' },
  { id: 'going-out', label: 'Going out' },
  { id: 'rotaract', label: 'Rotaract' },
  { id: 'other', label: 'Other' },
];

const KNOWN = new Set(MONEY_CATS.map((c) => c.id));

// Spending saved before categories existed was all food.
export const catOf = (r) => (KNOWN.has(r.cat) ? r.cat : r.cat ? 'other' : 'food');

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// month: '2026-11'. records: [{ date, amount, cat }]. income: number or null.
export function monthMoney(records, month, income, today) {
  const byCat = Object.fromEntries(MONEY_CATS.map((c) => [c.id, 0]));
  let total = 0;
  for (const r of records) {
    if (!r.date?.startsWith(month)) continue;
    const amount = Number(r.amount) || 0;
    byCat[catOf(r)] += amount;
    total += amount;
  }
  const left = income == null ? null : income - total;
  // Days left counts today, so on the last day the whole rest is for today.
  const daysLeft = today?.startsWith(month) ? daysInMonth(month) - Number(today.slice(8)) + 1 : null;
  const perDay = left != null && daysLeft ? Math.max(0, left) / daysLeft : null;
  return { byCat, total, left, daysLeft, perDay };
}

// What I spent between two dates (both included).
export function spentBetween(records, from, to) {
  return records.reduce((sum, r) => (r.date >= from && r.date <= to ? sum + (Number(r.amount) || 0) : sum), 0);
}
