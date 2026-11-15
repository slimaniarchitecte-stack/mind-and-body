// Mind: reading list and log, journal history with search, the optional modules
// (chess or Spanish, one at a time) and the monthly "learn something new".

import { h, cx } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/sheet.js';
import { pageHead, section, seg, note, empty, pct } from '../ui/parts.js';
import { chart, timeChart } from '../ui/charts.js';
import { recordSheet, recordRow } from '../ui/form.js';
import { store } from '../store.js';
import * as clock from '../clock.js';
import { markKept, setStatus } from '../actions.js';
import { layerAdd } from '../program.js';
import { appDate, weekDates, fmtDate, fmtDur } from '../core/dates.js';
import { blocksForDate } from '../core/schedule.js';
import { adherenceLast, isKept } from '../core/adherence.js';
import { lockInfo } from '../core/unlock.js';
import { minutesBetween } from '../core/learn.js';

const BOOK_STATES = [{ value: 'toread', label: 'To read' }, { value: 'reading', label: 'Reading' }, { value: 'done', label: 'Done' }];

// Kept while the app is open.
let journalLimit = 14;
let journalQuery = '';

const bookState = () => store.kv('books', {});

export function mind(root) {
  const ctx = store.ctx();
  const today = appDate(clock.now(), ctx.program.dayStartHour);
  const data = store.state.data.mind;
  const week = weekDates(today);

  root.append(pageHead({ eyebrow: 'Mind and Body', title: 'Mind', thin: 'read, write, stay curious' }));

  // ---- reading ----------------------------------------------------------------

  const books = store.list('mind', 'books');
  const states = bookState();
  const statusOf = (b) => states[b.id]?.status ?? 'toread';
  const reading = books.filter((b) => statusOf(b) === 'reading');
  const logs = store.records('reading');
  const bookTitle = (id) => books.find((b) => b.id === id)?.title ?? 'A book';

  const logReading = (existing, defaults = {}) => recordSheet({
    type: 'reading', eyebrow: 'Reading log', title: existing ? 'Edit reading' : 'Log reading', existing,
    defaults: { date: today, minutes: data.reading.minutes, bookId: reading[0]?.id ?? books[0]?.id, ...defaults },
    fields: [
      { key: 'bookId', label: 'Book', kind: 'chips', required: true, options: [...reading, ...books.filter((b) => statusOf(b) !== 'reading')].slice(0, 8).map((b) => ({ value: b.id, label: b.title })) },
      { key: 'minutes', label: 'Minutes', kind: 'number', min: 1, max: 600, step: 1 },
      { key: 'pages', label: 'Pages', kind: 'number', min: 1, max: 2000, step: 1, placeholder: 'Optional' },
      { key: 'note', label: 'One thing I keep from it', kind: 'textarea' },
      { key: 'date', label: 'Date', kind: 'date', max: today, required: true },
    ],
    savedText: 'Reading saved.',
    onSave: async (rec) => {
      const block = blocksForDate(store.ctx(), rec.date).find((b) => b.id === data.reading.block && !b.locked);
      if (block) await markKept(rec.date, block.key);
      if (statusOf({ id: rec.bookId }) === 'toread') await setBook(rec.bookId, 'reading');
    },
  });

  async function setBook(id, status) {
    const cur = bookState();
    const entry = { ...(cur[id] ?? {}), status };
    if (status === 'reading') entry.startedOn ??= today;
    if (status === 'done') entry.finishedOn = today;
    await store.setKV('books', { ...cur, [id]: entry });
  }

  // A new book goes into my layer of the reading list (see program.js), not into the log.
  const addBook = () => recordSheet({
    type: 'book', eyebrow: 'Reading list', title: 'Add a book', persist: false,
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'author', label: 'Author', kind: 'text' },
    ],
    savedText: 'Book added.',
    onSave: (rec) => store.setLayer('books', layerAdd(store.layer('books'), { id: store.uid('bk'), title: rec.title, author: rec.author })),
  });

  const weekMinutes = minutesBetween(logs, week[0], week[6]);
  const doneCount = books.filter((b) => statusOf(b) === 'done').length;
  const sortOrder = { reading: 0, toread: 1, done: 2 };
  const readingSec = section({ no: '01', title: 'Reading', meta: '20 min before sleep' },
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, 'This week'), h('b', {}, fmtDur(weekMinutes))),
      h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, 'Books finished'), h('b', {}, String(doneCount))),
    ),
    h('div', { class: 'focus is-small' },
      h('span', { class: 'eyebrow' }, 'Now reading'),
      reading.length
        ? reading.map((b) => h('h3', { class: 'ai-theme' }, b.title, h('small', {}, b.author ? ` ${b.author}` : '')))
        : h('h3', { class: 'ai-theme is-quiet' }, 'Pick a book from the list'),
      h('div', { class: 'focus-actions' },
        h('button', { class: 'btn btn-solid btn-grow', type: 'button', onclick: () => logReading() }, 'Log reading'),
        h('button', { class: 'btn btn-grow', type: 'button', onclick: addBook }, icon('plus', 16), 'Book'),
      ),
    ),
    h('div', { class: 'books' }, [...books].sort((a, b) => sortOrder[statusOf(a)] - sortOrder[statusOf(b)]).map((b) => h('div', { class: cx('book', `is-${statusOf(b)}`) },
      h('div', { class: 'book-main' }, h('b', {}, b.title), h('small', {}, b.author ?? '')),
      seg(BOOK_STATES, statusOf(b), (v) => v && setBook(b.id, v), { label: `Status of ${b.title}` }),
    ))),
    logs.length
      ? h('div', { class: 'loglist' }, logs.slice(0, 5).map((r) => recordRow({
        date: fmtDate(r.date, 'day'), title: bookTitle(r.bookId),
        detail: [r.minutes ? fmtDur(r.minutes) : null, r.pages ? `${r.pages} pages` : null, r.note].filter(Boolean).join(' · '),
        onclick: () => logReading(r),
      })))
      : null,
  );

  // ---- journal history --------------------------------------------------------

  const entries = [...store.state.days.values()]
    .filter((d) => d.journal && (d.journal.win || d.journal.lesson || d.journal.priority))
    .sort((a, b) => b.date.localeCompare(a.date));
  const list = h('div', { class: 'journal' });
  const drawJournal = () => {
    const q = journalQuery.trim().toLowerCase();
    const found = q
      ? entries.filter((d) => `${d.journal.win} ${d.journal.lesson} ${d.journal.priority}`.toLowerCase().includes(q))
      : entries;
    const line = (label, text) => (text ? h('p', {}, h('span', { class: 'field-label' }, label), ' ', text) : null);
    const rows = found.length
      ? found.slice(0, journalLimit).map((d) => h('a', { class: 'jentry', href: `#/today/${d.date}` },
        h('span', { class: 'jentry-date' }, fmtDate(d.date, 'short')),
        h('div', { class: 'jentry-text' }, line('Win', d.journal.win), line('Lesson', d.journal.lesson), line('No. 1', d.journal.priority)),
      ))
      : [empty(q ? 'Nothing found for this search.' : 'The 3 lines you write every night on Today will show up here.')];
    if (found.length > journalLimit) {
      rows.push(h('button', { class: 'btn-text', type: 'button', onclick: () => { journalLimit += 30; drawJournal(); } }, `Show more (${found.length - journalLimit} older)`));
    }
    list.replaceChildren(...rows);
  };
  drawJournal();
  const search = h('input', {
    class: 'input', type: 'search', placeholder: 'Search the journal', value: journalQuery, 'aria-label': 'Search the journal',
    oninput: (e) => { journalQuery = e.target.value; drawJournal(); },
  });
  const journalSec = section({ no: '02', title: 'Journal', meta: `${entries.length} ${entries.length === 1 ? 'night' : 'nights'}` },
    h('div', { class: 'inline-form' }, search),
    list,
  );

  // ---- optional modules -------------------------------------------------------

  const lock = lockInfo(ctx.stages, 's5', today);
  const cfg = ctx.program.unlock;
  const last14 = adherenceLast(ctx, store.getDay, today, cfg.windowDays);
  const allowed = !lock.locked && last14.pct != null && last14.pct >= cfg.threshold;
  const opt = store.kv('optional', {});
  const ratings = store.records('rating');

  const logRating = (existing) => recordSheet({
    type: 'rating', eyebrow: 'Chess', title: existing ? 'Edit rating' : 'Monthly rating', existing, defaults: { date: today },
    fields: [
      { key: 'rating', label: 'Puzzle or game rating', kind: 'number', min: 0, max: 4000, step: 1, required: true },
      { key: 'date', label: 'Date', kind: 'date', max: today, required: true },
    ],
    savedText: 'Rating saved.',
  });

  const moduleCard = (m) => {
    const isOn = opt.active === m.id;
    const key = `h:opt-${m.id}`;
    const count = week.filter((d) => isKept(store.day(d).items[key]?.s)).length;
    const doneToday = isKept(store.day(today).items[key]?.s);
    return h('div', { class: cx('module', isOn && 'is-on') },
      h('div', { class: 'module-head' },
        h('b', {}, m.title, isOn ? h('span', { class: 'tag' }, 'Active') : null),
        h('small', {}, m.about),
      ),
      isOn
        ? [
          h('p', { class: 'focus-meta' }, `This week: ${count} of ${m.perWeek}. It shows in the Habits list on Today. It does not count in the adherence.`),
          h('div', { class: 'focus-actions' },
            h('button', {
              class: cx('btn btn-grow', !doneToday && 'btn-solid'), type: 'button',
              onclick: () => setStatus(today, key, doneToday ? null : 'done'),
            }, doneToday ? 'Done today (undo)' : `${m.minutes} min done today`),
            h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => store.setKV('optional', { active: null }) }, 'Stop'),
          ),
          m.ratingLog
            ? [
              h('div', { class: 'sub-head' }, h('h3', {}, 'Rating, once a month'), h('button', { class: 'btn btn-small', type: 'button', onclick: () => logRating() }, icon('plus', 16), 'Rating')),
              ratings.length >= 2
                ? chart((w, hgt) => timeChart(w, hgt, {
                  from: ratings[ratings.length - 1].date, to: today,
                  dots: ratings.map((r) => ({ date: r.date, v: r.rating })),
                  lines: [{ data: [...ratings].reverse().map((r) => ({ date: r.date, v: r.rating })), color: 'var(--mind)' }],
                }), { height: 150 })
                : null,
              ratings.length
                ? h('div', { class: 'loglist' }, ratings.slice(0, 4).map((r) => recordRow({ date: fmtDate(r.date, 'dayYear'), title: String(r.rating), onclick: () => logRating(r) })))
                : h('p', { class: 'form-hint' }, 'Start by writing down your rating today.'),
            ]
            : null,
        ]
        : h('div', { class: 'focus-actions' }, h('button', {
          class: 'btn', type: 'button', disabled: !allowed || Boolean(opt.active),
          onclick: () => {
            store.setKV('optional', { active: m.id, since: today });
            toast(`${m.title} is on. Only one optional module at a time.`);
          },
        }, 'Start this module')),
    );
  };

  const gateText = lock.locked
    ? `Optional modules open with stage 5, on ${fmtDate(lock.unlockDate, 'long')} at the earliest.`
    : !allowed
      ? `Not yet. Your adherence over the last ${cfg.windowDays} days is ${pct(last14.pct)}. Optional modules need ${pct(cfg.threshold)}.`
      : opt.active
        ? 'One module is active. Stop it before you start the other one.'
        : `Adherence over the last ${cfg.windowDays} days: ${pct(last14.pct)}. You can start one module.`;
  const optionalSec = section({ no: '03', title: 'Optional modules', meta: 'One at a time' },
    note({ text: gateText, tone: allowed ? 'mind' : undefined }),
    data.optional.map(moduleCard),
  );

  // ---- learn something new ----------------------------------------------------

  const topics = store.records('newtopic');
  const month = today.slice(0, 7);
  const doneThisMonth = topics.some((t) => t.date.startsWith(month));
  const logTopic = (existing) => recordSheet({
    type: 'newtopic', eyebrow: data.newTopic.title, title: existing ? 'Edit topic' : 'New topic', existing, defaults: { date: today },
    fields: [
      { key: 'topic', label: 'Topic', kind: 'text', required: true },
      { key: 't1', label: 'Takeaway 1', kind: 'textarea', rows: 2, required: true },
      { key: 't2', label: 'Takeaway 2', kind: 'textarea', rows: 2 },
      { key: 't3', label: 'Takeaway 3', kind: 'textarea', rows: 2 },
      { key: 'date', label: 'Date', kind: 'date', max: today, required: true },
    ],
    savedText: 'Topic saved.',
  });
  const topicSec = section({ no: '04', title: data.newTopic.title, meta: doneThisMonth ? 'Done this month' : 'Open this month' },
    h('p', { class: 'form-hint' }, data.newTopic.about),
    h('div', { class: 'focus-actions' }, h('button', { class: cx('btn', !doneThisMonth && 'btn-solid'), type: 'button', onclick: () => logTopic() }, icon('plus', 16), 'Topic')),
    topics.length
      ? h('div', { class: 'loglist' }, topics.slice(0, 6).map((t) => recordRow({
        date: fmtDate(t.date, 'day'), title: t.topic, detail: [t.t1, t.t2, t.t3].filter(Boolean).join(' · '), onclick: () => logTopic(t),
      })))
      : null,
  );

  root.append(h('div', { class: 'two-col' },
    h('div', { class: 'col' }, readingSec, journalSec),
    h('div', { class: 'col' }, optionalSec, topicSec),
  ));
}
