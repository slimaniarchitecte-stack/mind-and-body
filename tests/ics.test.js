import { test, assert } from './harness.js';
import { makeCtx } from './fixture.js';
import { buildICS, templateEvents, escapeText, foldLine, floating } from '../js/core/ics.js';

const MON = '2026-11-16';
const NOW = new Date(Date.UTC(2026, 10, 15, 19, 30, 0));
const ALL_OPEN = { s2: { activatedOn: '2026-11-16' }, s3: { activatedOn: '2026-11-16' }, s4: { activatedOn: '2026-11-16' }, s5: { activatedOn: '2026-11-16' } };

const unfold = (ics) => ics.replace(/\r\n /g, '');
const eventsOf = (ics) => unfold(ics).split('BEGIN:VEVENT').slice(1).map((chunk) => {
  const out = {};
  for (const line of chunk.split('\r\n')) {
    const i = line.indexOf(':');
    if (i > 0 && !(line.slice(0, i) in out)) out[line.slice(0, i)] = line.slice(i + 1);
  }
  out.raw = chunk;
  return out;
});
const byUid = (events, start) => events.find((e) => e.UID.startsWith(start));

test('ics: a valid calendar file', async () => {
  const ics = buildICS(await makeCtx(), MON, NOW);
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines[1], 'VERSION:2.0');
  assert.ok(lines[2].startsWith('PRODID:'));
  assert.equal(lines[lines.length - 2], 'END:VCALENDAR');
  assert.equal(lines[lines.length - 1], '', 'the file ends with a line break');
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends with CRLF');
  const count = (text) => ics.split(text).length - 1;
  assert.ok(count('BEGIN:VEVENT') > 5);
  assert.equal(count('BEGIN:VEVENT'), count('END:VEVENT'));
  assert.equal(count('BEGIN:VALARM'), count('BEGIN:VEVENT'), 'one alarm per event');
  assert.equal(count('TRIGGER:-PT10M'), count('BEGIN:VEVENT'), 'the alarm is 10 minutes before');
  const tooLong = lines.filter((l) => new TextEncoder().encode(l).length > 75);
  assert.equal(tooLong.length, 0, 'no line is longer than 75 bytes');
});

test('ics: floating local times, weekly repeat', async () => {
  const events = eventsOf(buildICS(await makeCtx(), MON, NOW));
  const mt = byUid(events, 'muaythai-');
  assert.equal(mt.SUMMARY, 'Muay Thai');
  assert.equal(mt.DTSTART, '20261117T190000', 'Tuesday 17 November, 19:00, no time zone');
  assert.equal(mt.DTEND, '20261117T200000');
  assert.equal(mt.RRULE, 'FREQ=WEEKLY;BYDAY=TU,TH,SA');
  assert.equal(mt.DTSTAMP, '20261115T193000Z');
  for (const e of events) {
    assert.ok(/^\d{8}T\d{6}$/.test(e.DTSTART), `${e.SUMMARY}: floating start`);
    assert.ok(/^\d{8}T\d{6}$/.test(e.DTEND), `${e.SUMMARY}: floating end`);
    assert.ok(e.DTEND > e.DTSTART);
    assert.ok(/^FREQ=WEEKLY;BYDAY=[A-Z,]+$/.test(e.RRULE));
  }
  assert.ok(!buildICS(await makeCtx(), MON, NOW).includes('TZID'), 'no time zone anywhere');
});

test('ics: only unlocked blocks, without work and free time', async () => {
  const week1 = templateEvents(await makeCtx(), MON);
  const ids = week1.map((e) => e.uid.split('@')[0]);
  assert.ok(ids.some((id) => id.startsWith('pfe-wed-')));
  assert.ok(!ids.some((id) => id.startsWith('strength-a')), 'locked in week 1');
  assert.ok(!ids.some((id) => id.startsWith('work-')));
  assert.ok(!ids.some((id) => id.startsWith('free-')));
  const open = templateEvents(await makeCtx({ unlocks: ALL_OPEN }), MON);
  assert.ok(open.some((e) => e.uid.startsWith('strength-a-mo@')));
  assert.ok(open.some((e) => e.uid.startsWith('sketch-th@')));
  const onlyBody = templateEvents(await makeCtx({ unlocks: ALL_OPEN }), MON, { categories: ['body'] });
  assert.ok(onlyBody.length > 0 && onlyBody.every((e) => e.category === 'Body'));
});

test('ics: different times on different days give separate events', async () => {
  const events = templateEvents(await makeCtx(), MON);
  const wake = events.filter((e) => e.uid.startsWith('wake-'));
  assert.equal(wake.length, 3, 'workdays, Saturday and Sunday each have their own wake time');
  const weekdays = wake.find((e) => e.byday.includes('MO'));
  const saturday = wake.find((e) => e.byday.includes('SA'));
  const sunday = wake.find((e) => e.byday.includes('SU'));
  assert.deepEqual(weekdays.byday, ['MO', 'TU', 'WE', 'TH', 'FR']);
  assert.equal(weekdays.start, 450);
  assert.deepEqual(saturday.byday, ['SA']);
  assert.equal(saturday.start, 480);
  assert.deepEqual(sunday.byday, ['SU']);
  assert.equal(sunday.start, 510);
  const urbanism = events.find((e) => e.uid === 'urbanism-sa@mind-and-body');
  assert.deepEqual([urbanism.byday, urbanism.start, urbanism.end], [['SA'], 540, 660], 'the Saturday urbanism session is in the calendar');
});

test('ics: lights out after midnight lands on the next calendar day', async () => {
  const events = eventsOf(buildICS(await makeCtx(), MON, NOW));
  const lights = events.filter((e) => e.UID.startsWith('lights-out-'));
  const midnight = lights.find((e) => e.DTSTART.endsWith('T000000'));
  const late = lights.find((e) => e.DTSTART.endsWith('T003000'));
  assert.equal(midnight.DTSTART, '20261117T000000', 'Monday night is Tuesday 00:00');
  assert.equal(midnight.RRULE, 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA');
  assert.equal(late.DTSTART, '20261122T003000', 'Saturday night is Sunday 00:30');
  assert.equal(late.RRULE, 'FREQ=WEEKLY;BYDAY=SU');
});

test('ics: event ids are stable', async () => {
  const a = templateEvents(await makeCtx(), MON).map((e) => e.uid);
  const b = templateEvents(await makeCtx(), '2026-11-23').map((e) => e.uid);
  assert.deepEqual(a, b, 'same template, same ids, whatever the week');
  assert.equal(new Set(a).size, a.length, 'every id is unique');
  const moved = await makeCtx();
  moved.settings.muayThai = { ...moved.settings.muayThai, start: '18:30', end: '19:30' };
  const mt = (list) => list.find((e) => e.uid.startsWith('muaythai-'));
  assert.equal(mt(templateEvents(moved, MON)).uid, mt(templateEvents(await makeCtx(), MON)).uid, 'a new time keeps the id');
  assert.equal(mt(templateEvents(moved, MON)).uid, 'muaythai-tuthsa@mind-and-body');
});

test('ics: "this week only" changes are not exported', async () => {
  const ctx = await makeCtx({ weekOverrides: { [MON]: { patches: { 'pfe-wed': { start: '20:00', end: null, duration: 90 } } } } });
  const pfe = templateEvents(ctx, MON).find((e) => e.uid.startsWith('pfe-wed-'));
  assert.equal(pfe.start, 21 * 60);
});

test('ics: text escaping and folding', async () => {
  assert.equal(escapeText('One win, one lesson; done\\ok\nnext'), 'One win\\, one lesson\\; done\\\\ok\\nnext');
  assert.equal(floating('2026-11-16', 1095), '20261116T181500');
  assert.equal(floating('2026-12-31', 1470), '20270101T003000');
  const folded = foldLine(`DESCRIPTION:${'a'.repeat(200)}`);
  assert.ok(folded.split('\r\n').every((l) => l.length <= 75));
  assert.ok(folded.split('\r\n').slice(1).every((l) => l.startsWith(' ')));
  assert.equal(folded.replace(/\r\n /g, ''), `DESCRIPTION:${'a'.repeat(200)}`);
  const journal = eventsOf(buildICS(await makeCtx(), MON, NOW)).find((e) => e.UID.startsWith('journal-'));
  assert.ok(journal.DESCRIPTION.includes('One win\\, one lesson'), 'commas in notes are escaped');
  assert.ok(journal.DESCRIPTION.includes('\\nMinimum: '));
});
