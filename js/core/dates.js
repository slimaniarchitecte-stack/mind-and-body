// Dates and times, always in local time.
// A "date" is a 'YYYY-MM-DD' string. A "time" is a number of minutes since 00:00
// of that date (it can go past 1440 for things that happen after midnight, like lights out).
// Weeks start on Monday. Weekdays are numbered 1 (Monday) to 7 (Sunday).

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const pad2 = (n) => String(n).padStart(2, '0');

export const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function toISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Noon, so a clock change (summer time, Ramadan) can never push us onto another day.
export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

// Number of days from a to b (positive when b is later).
export function diffDays(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

// 1 = Monday ... 7 = Sunday.
export function dow(iso) {
  const g = parseISO(iso).getDay();
  return g === 0 ? 7 : g;
}

export function mondayOf(iso) {
  return addDays(iso, 1 - dow(iso));
}

export function weekDates(iso) {
  const monday = mondayOf(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function mondayOnOrAfter(iso) {
  const w = dow(iso);
  return w === 1 ? iso : addDays(iso, 8 - w);
}

// Week 1 is the week of the start date. Weeks before the start are 0, -1, ...
export function programWeek(startISO, iso) {
  return Math.floor(diffDays(mondayOf(startISO), mondayOf(iso)) / 7) + 1;
}

// The "app day" changes at dayStartHour (04:00), not at midnight,
// so the journal at 00:10 still belongs to the evening you are finishing.
export function appDate(now, dayStartHour = 4) {
  return toISO(new Date(now.getTime() - dayStartHour * 3600000));
}

// Minutes since 00:00 of the app day. 00:30 after midnight gives 1470.
export function appMinutes(now, dayStartHour = 4) {
  const m = now.getHours() * 60 + now.getMinutes();
  return now.getHours() < dayStartHour ? m + 1440 : m;
}

// 'HH:MM' -> minutes. Returns null when the text is not a time.
export function parseHM(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 29 || mm > 59) return null;
  return hh * 60 + mm;
}

// What someone typed -> 'HH:MM' on a 24 hour clock, or null.
// Accepts '7:30', '07:30', '0730', '730', '7' and '19'.
export function normalizeTime(text) {
  const raw = String(text ?? '').trim();
  let m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== raw.length || !digits.length || digits.length > 4) return null;
    m = digits.length <= 2 ? [null, digits, '00'] : [null, digits.slice(0, -2), digits.slice(-2)];
  }
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return `${pad2(hh)}:${pad2(mm)}`;
}

// minutes -> 'HH:MM' on a 24 hour clock (1470 -> '00:30').
export function fmtHM(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

// 25 -> '25 min', 60 -> '1 h', 90 -> '1 h 30'.
export function fmtDur(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${pad2(rest)}` : `${h} h`;
}

export function ageOn(birthISO, iso) {
  const [by, bm, bd] = birthISO.split('-').map(Number);
  const [y, m, d] = iso.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

// style: 'long' Monday 16 November | 'full' Monday 16 November 2026 | 'short' Mon 16 Nov
//        'day' 16 Nov | 'dayYear' 16 Nov 2026 | 'weekday' Monday
export function fmtDate(iso, style = 'long') {
  const d = parseISO(iso);
  const wd = dow(iso) - 1;
  const day = d.getDate();
  const mo = d.getMonth();
  switch (style) {
    case 'full': return `${DAY_NAMES[wd]} ${day} ${MONTH_NAMES[mo]} ${d.getFullYear()}`;
    case 'short': return `${DAY_SHORT[wd]} ${day} ${MONTH_SHORT[mo]}`;
    case 'day': return `${day} ${MONTH_SHORT[mo]}`;
    case 'dayMonth': return `${day} ${MONTH_NAMES[mo]}`;
    case 'dayYear': return `${day} ${MONTH_SHORT[mo]} ${d.getFullYear()}`;
    case 'weekday': return DAY_NAMES[wd];
    default: return `${DAY_NAMES[wd]} ${day} ${MONTH_NAMES[mo]}`;
  }
}

// '16 to 22 Nov' or '30 Nov to 6 Dec'.
export function fmtWeekRange(mondayISO) {
  const a = parseISO(mondayISO);
  const b = parseISO(addDays(mondayISO, 6));
  const left = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MONTH_SHORT[a.getMonth()]}`;
  return `${left} to ${b.getDate()} ${MONTH_SHORT[b.getMonth()]} ${b.getFullYear()}`;
}
