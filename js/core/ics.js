// Calendar export: the active template week as weekly recurring events (.ics file).
//
// - Times are "floating" local times (no time zone), so an event stays at the same clock time.
// - Every event has a 10 minute alarm.
// - Event ids are stable: the same block on the same days always gets the same UID.
// - Only unlocked blocks are exported, without the "this week only" changes.

import { addDays, pad2 } from './dates.js';
import { blocksForDate } from './schedule.js';

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export const UID_DOMAIN = 'mind-and-body';
export const ALARM_MINUTES = 10;

// Text values: escape backslash, semicolon, comma and line breaks.
export function escapeText(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Lines longer than 75 bytes are folded: line break, then one space.
export function foldLine(line) {
  const bytes = (s) => new TextEncoder().encode(s).length;
  if (bytes(line) <= 75) return line;
  const parts = [];
  let current = '';
  for (const ch of line) {
    const limit = parts.length ? 74 : 75;
    if (bytes(current + ch) > limit) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts.join('\r\n ');
}

// '2026-11-16' + 1095 minutes -> '20261116T181500'. Minutes past midnight roll to the next day.
export function floating(date, minutes) {
  const day = addDays(date, Math.floor(minutes / 1440));
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${day.replace(/-/g, '')}T${pad2(Math.floor(m / 60))}${pad2(m % 60)}00`;
}

const utcStamp = (d) => `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;

// The events of the template week that starts on `monday`.
// A block that has the same times on several days becomes one event that repeats on those days.
//   options.categories: ids of the categories to include (default: everything except work and free time)
// Returns [{ uid, title, description, category, date, start, end, byday: ['TU', 'TH'] }]
export function templateEvents(ctx, monday, options = {}) {
  const include = options.categories ?? ctx.program.categories.map((c) => c.id).filter((id) => id !== 'work' && id !== 'free');
  const template = { ...ctx, weekOverrides: {}, _cache: undefined };
  const groups = new Map();
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(monday, i);
    for (const b of blocksForDate(template, date)) {
      if (b.locked || !include.includes(b.category)) continue;
      // After midnight (lights out at 00:00) the event really happens on the next calendar day.
      const shift = Math.floor(b.start / 1440);
      const weekday = (i + shift) % 7;
      const start = b.start - shift * 1440;
      const end = b.end - shift * 1440;
      const key = `${b.id}|${start}|${end}`;
      let g = groups.get(key);
      if (!g) {
        g = { block: b, start, end, weekdays: [], firstDate: null };
        groups.set(key, g);
      }
      g.weekdays.push(weekday);
      const realDate = addDays(date, shift);
      if (!g.firstDate || realDate < g.firstDate) g.firstDate = realDate;
    }
  }
  const labels = Object.fromEntries(ctx.program.categories.map((c) => [c.id, c.label]));
  return [...groups.values()].map((g) => {
    const days = [...new Set(g.weekdays)].sort((a, b) => a - b);
    const description = [g.block.note, g.block.min ? `Minimum: ${g.block.min}` : ''].filter(Boolean).join('\n');
    return {
      uid: `${g.block.id}-${days.map((d) => BYDAY[d].toLowerCase()).join('')}@${UID_DOMAIN}`,
      title: g.block.title,
      description,
      category: labels[g.block.category] ?? g.block.category,
      date: g.firstDate,
      start: g.start,
      end: g.end,
      byday: days.map((d) => BYDAY[d]),
    };
  }).sort((a, b) => a.uid.localeCompare(b.uid));
}

// The whole .ics file as text. now: a Date, used for the DTSTAMP line.
export function buildICS(ctx, monday, now, options = {}) {
  const stamp = utcStamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mind and Body//Template week//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Mind and Body',
  ];
  for (const e of templateEvents(ctx, monday, options)) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${floating(e.date, e.start)}`,
      `DTEND:${floating(e.date, e.end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${e.byday.join(',')}`,
      `SUMMARY:${escapeText(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push(
      `CATEGORIES:${escapeText(e.category)}`,
      'TRANSP:OPAQUE',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(e.title)}`,
      `TRIGGER:-PT${ALARM_MINUTES}M`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
