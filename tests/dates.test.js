import { test, assert } from './harness.js';
import {
  toISO, addDays, diffDays, dow, mondayOf, weekDates, mondayOnOrAfter, programWeek,
  appDate, appMinutes, parseHM, normalizeTime, fmtHM, fmtDur, ageOn, fmtDate, fmtWeekRange,
} from '../js/core/dates.js';

test('dates: 16 November 2026 is a Monday', () => {
  assert.equal(dow('2026-11-16'), 1);
  assert.equal(dow('2026-11-22'), 7);
  assert.equal(dow('2027-05-01'), 6);
});

test('dates: weeks start on Monday', () => {
  assert.equal(mondayOf('2026-11-16'), '2026-11-16');
  assert.equal(mondayOf('2026-11-22'), '2026-11-16', 'Sunday belongs to the week that started on Monday');
  assert.equal(mondayOf('2026-11-23'), '2026-11-23');
  assert.deepEqual(weekDates('2026-11-19'), [
    '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22',
  ]);
});

test('dates: adding days crosses months and years', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-28', 14), '2027-01-11');
  assert.equal(addDays('2027-03-01', -1), '2027-02-28');
  assert.equal(diffDays('2026-11-16', '2027-01-11'), 56);
  assert.equal(diffDays('2026-11-16', '2026-11-11'), -5);
});

test('dates: next Monday on or after a date', () => {
  assert.equal(mondayOnOrAfter('2026-11-30'), '2026-11-30');
  assert.equal(mondayOnOrAfter('2026-12-02'), '2026-12-07');
  assert.equal(mondayOnOrAfter('2026-12-06'), '2026-12-07');
});

test('dates: program week numbers', () => {
  const start = '2026-11-16';
  assert.equal(programWeek(start, '2026-11-16'), 1);
  assert.equal(programWeek(start, '2026-11-22'), 1);
  assert.equal(programWeek(start, '2026-11-23'), 2);
  assert.equal(programWeek(start, '2026-12-14'), 5);
  assert.equal(programWeek(start, '2027-01-11'), 9);
  assert.equal(programWeek(start, '2026-11-15'), 0, 'the week before the start is week 0');
});

test('dates: the app day changes at 04:00, in local time', () => {
  assert.equal(appDate(new Date(2026, 10, 17, 0, 30)), '2026-11-16', '00:30 still belongs to the evening before');
  assert.equal(appDate(new Date(2026, 10, 17, 3, 59)), '2026-11-16');
  assert.equal(appDate(new Date(2026, 10, 17, 4, 0)), '2026-11-17');
  assert.equal(appDate(new Date(2026, 10, 17, 23, 59)), '2026-11-17');
  assert.equal(appMinutes(new Date(2026, 10, 17, 7, 30)), 450);
  assert.equal(appMinutes(new Date(2026, 10, 17, 0, 30)), 1470);
  assert.equal(toISO(new Date(2027, 0, 1, 12)), '2027-01-01');
});

test('dates: 24 hour times', () => {
  assert.equal(parseHM('18:15'), 1095);
  assert.equal(parseHM('7:05'), 425);
  assert.equal(parseHM('nope'), null);
  assert.equal(parseHM('12:60'), null);
  assert.equal(fmtHM(1095), '18:15');
  assert.equal(fmtHM(1440), '00:00');
  assert.equal(fmtHM(1470), '00:30');
  assert.equal(fmtDur(25), '25 min');
  assert.equal(fmtDur(60), '1 h');
  assert.equal(fmtDur(90), '1 h 30');
});

test('dates: typed times become 24 hour times', () => {
  assert.equal(normalizeTime('18:15'), '18:15');
  assert.equal(normalizeTime('7:30'), '07:30');
  assert.equal(normalizeTime('0730'), '07:30');
  assert.equal(normalizeTime('730'), '07:30');
  assert.equal(normalizeTime('19'), '19:00');
  assert.equal(normalizeTime('0'), '00:00');
  assert.equal(normalizeTime('24:00'), null);
  assert.equal(normalizeTime('12:60'), null);
  assert.equal(normalizeTime('7 pm'), null);
  assert.equal(normalizeTime(''), null);
});

test('dates: age follows the birthday', () => {
  assert.equal(ageOn('2000-06-15', '2026-11-16'), 26);
  assert.equal(ageOn('2000-06-15', '2027-06-14'), 26);
  assert.equal(ageOn('2000-06-15', '2027-06-15'), 27);
});

test('dates: readable formats', () => {
  assert.equal(fmtDate('2026-11-16'), 'Monday 16 November');
  assert.equal(fmtDate('2026-11-16', 'short'), 'Mon 16 Nov');
  assert.equal(fmtDate('2026-11-16', 'full'), 'Monday 16 November 2026');
  assert.equal(fmtWeekRange('2026-11-16'), '16 to 22 Nov 2026');
  assert.equal(fmtWeekRange('2026-11-30'), '30 Nov to 6 Dec 2026');
});
