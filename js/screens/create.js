// Create: the Saturday cycle, the design challenge generator with its timer,
// sketches, precedent studies, visits, free explorations and the idea bank.

import { h, cx } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/sheet.js';
import { pageHead, section, chips, bar, empty } from '../ui/parts.js';
import { recordSheet, recordRow } from '../ui/form.js';
import { photoImg } from '../photos.js';
import { store } from '../store.js';
import * as clock from '../clock.js';
import { navigate } from '../router.js';
import { markKept } from '../actions.js';
import { appDate, fmtDate, fmtDur, dow, addDays } from '../core/dates.js';
import { blocksForDate } from '../core/schedule.js';
import { cycleStep, pickBrief } from '../core/learn.js';

const CITIES = ['Rabat', 'Salé', 'Casablanca', 'Other'];
const EXPLORE_KINDS = ['Model making', 'Material study', 'AI assisted concept'];

// The tag used to filter the idea bank. Kept while the app is open.
let ideaTag = null;

// Tick a Create block (sketch, architecture session) when a matching entry is saved.
async function tickBlock(date, blockId) {
  const block = blocksForDate(store.ctx(), date).find((b) => b.id === blockId && !b.locked);
  if (block) await markKept(date, block.key);
}

const thumb = (r) => (r.photos?.length ? photoImg(r.photos[0], { cls: 'row-thumb', alt: '' }) : icon('right', 16));

export function create(root) {
  const ctx = store.ctx();
  const today = appDate(clock.now(), ctx.program.dayStartHour);
  const data = store.state.data.create;
  const briefs = store.list('create', 'briefs');
  const s4 = ctx.stages.s4;
  const cycleStart = s4?.active ? s4.activatedOn : s4?.due ?? ctx.program.startDate;
  const saturday = addDays(today, (6 - dow(today) + 7) % 7);
  const step = cycleStep(data.cycle, cycleStart, saturday < cycleStart ? cycleStart : saturday);

  root.append(pageHead({ eyebrow: 'Mind and Body', title: 'Create', thin: 'draw, study, visit' }));

  // ---- forms ------------------------------------------------------------------

  const sketchForm = (existing) => recordSheet({
    type: 'sketch', eyebrow: 'Create', title: existing ? 'Edit sketch' : 'New sketch', existing, defaults: { date: today },
    fields: [
      { key: 'title', label: 'What I drew', kind: 'text', required: true },
      { key: 'subject', label: 'Subject', kind: 'chips', options: data.sketchSubjects },
      { key: 'mode', label: 'Drawn', kind: 'chips', options: ['From life', 'From memory'] },
      { key: 'note', label: 'Note', kind: 'textarea' },
      { key: 'photos', label: 'Photo', kind: 'photos' },
      { key: 'date', label: 'Date', kind: 'date', max: today, required: true },
    ],
    savedText: 'Sketch saved.',
    onSave: (rec) => tickBlock(rec.date, 'sketch'),
  });

  const precedentForm = (existing) => recordSheet({
    type: 'precedent', eyebrow: 'Precedent study', title: existing ? 'Edit study' : 'New precedent study', existing, defaults: { date: today },
    fields: [
      { key: 'project', label: 'Project', kind: 'text', required: true },
      ...data.precedentFields.map((f) => ({ key: f.key, label: f.label, kind: f.long ? 'textarea' : 'text', rows: 2 })),
      { key: 'photos', label: 'Photos and drawings', kind: 'photos' },
      { key: 'date', label: 'Date', kind: 'date', max: today, required: true },
    ],
    savedText: 'Study saved.',
    onSave: (rec) => tickBlock(rec.date, 'arch-session'),
  });

  const visitForm = (existing) => recordSheet({
    type: 'visit', eyebrow: 'Building visit', title: existing ? 'Edit visit' : 'New visit', existing, defaults: { date: today },
    fields: [
      { key: 'building', label: 'Building', kind: 'text', required: true },
      { key: 'city', label: 'City', kind: 'chips', options: CITIES },
      { key: 'note', label: 'What I noticed', kind: 'textarea', rows: 4 },
      { key: 'photos', label: 'Sketches and photos', kind: 'photos' },
      { key: 'date', label: 'Date', kind: 'date', max: today, required: true },
    ],
    savedText: 'Visit saved.',
    onSave: (rec) => tickBlock(rec.date, 'arch-session'),
  });

  const exploreForm = (existing) => recordSheet({
    type: 'explore', eyebrow: 'Free exploration', title: existing ? 'Edit exploration' : 'New exploration', existing, defaults: { date: today },
    fields: [
      { key: 'title', label: 'What I explored', kind: 'text', required: true },
      { key: 'kind', label: 'Kind', kind: 'chips', options: EXPLORE_KINDS },
      { key: 'note', label: 'Notes', kind: 'textarea', rows: 4 },
      { key: 'photos', label: 'Photos', kind: 'photos' },
      { key: 'date', label: 'Date', kind: 'date', max: today, required: true },
    ],
    savedText: 'Exploration saved.',
    onSave: (rec) => tickBlock(rec.date, 'arch-session'),
  });

  const challengeForm = (existing, defaults = {}) => recordSheet({
    type: 'challenge', eyebrow: 'Speed design challenge', title: existing ? 'Edit challenge' : 'Log the challenge', existing,
    defaults: { date: today, ...defaults },
    fields: [
      { key: 'brief', label: 'Brief', kind: 'textarea', rows: 2, required: true },
      { key: 'minutes', label: 'Minutes spent', kind: 'number', min: 1, max: 600, step: 1 },
      { key: 'note', label: 'The idea in two lines, and what I would change', kind: 'textarea', rows: 4 },
      { key: 'photos', label: 'Drawings', kind: 'photos' },
      { key: 'date', label: 'Date', kind: 'date', max: today, required: true },
    ],
    savedText: 'Challenge saved.',
    onSave: async (rec) => {
      await store.setKV('challenge', null);
      await tickBlock(rec.date, 'arch-session');
    },
  });

  const ideaForm = (existing) => recordSheet({
    type: 'idea', eyebrow: 'Idea bank', title: existing ? 'Edit idea' : 'New idea', existing, defaults: { date: today },
    fields: [
      { key: 'text', label: 'Idea', kind: 'textarea', rows: 4, required: true },
      { key: 'tags', label: 'Tags', kind: 'tags' },
      { key: 'photos', label: 'Photo', kind: 'photos' },
    ],
    savedText: 'Idea saved.',
  });

  // ---- this Saturday ------------------------------------------------------------

  const stepAction = { precedent: () => precedentForm(), visit: () => visitForm(), challenge: () => drawBrief(), explore: () => exploreForm() };
  const stepLabel = { precedent: 'Start a study', visit: 'Log a visit', challenge: 'Draw a brief', explore: 'Log an exploration' };
  const cycleSec = section({ no: '01', title: 'Saturday session', meta: s4?.active ? fmtDate(saturday, 'short') : `Unlocks ${fmtDate(s4?.due ?? today, 'day')}` },
    h('div', { class: 'focus is-small' },
      h('span', { class: 'eyebrow' }, s4?.active ? 'This week' : 'First session'),
      h('h3', { class: 'ai-theme' }, step.title),
      h('p', { class: 'focus-meta' }, step.text),
      h('div', { class: 'focus-actions' }, h('button', { class: 'btn btn-solid', type: 'button', onclick: stepAction[step.id] }, stepLabel[step.id])),
    ),
    h('ol', { class: 'themes' }, data.cycle.map((c, i) => h('li', { class: cx(c.id === step.id && 'is-on') }, `Week ${i + 1}: ${c.title}`))),
  );

  // ---- design challenge -----------------------------------------------------------

  const active = store.kv('challenge');
  const recentBriefs = store.records('challenge').map((r) => r.briefId).filter(Boolean);
  function drawBrief() {
    const pick = pickBrief(briefs, [active?.briefId, ...recentBriefs].filter(Boolean));
    if (!pick) return;
    store.setKV('challenge', { briefId: pick.id, text: pick.text, startedAt: null, minutes: data.challengeMinutes });
  }
  const timerSlot = h('div');
  const drawTimer = () => {
    if (!active?.startedAt) return;
    const elapsed = Math.max(0, (clock.now().getTime() - new Date(active.startedAt).getTime()) / 60000);
    const left = Math.max(0, active.minutes - elapsed);
    timerSlot.replaceChildren(
      h('div', { class: 'countdown' },
        h('b', {}, left > 0 ? fmtDur(Math.ceil(left)) : 'Time is up'),
        h('span', {}, left > 0 ? 'left' : `${fmtDur(Math.round(elapsed))} since the start`),
      ),
      bar(Math.min(1, elapsed / active.minutes), 'var(--c-create)'),
    );
  };
  drawTimer();
  const challengeSec = section({ no: '02', title: 'Design challenge', meta: `${briefs.length} briefs` },
    active
      ? h('div', { class: 'brief' },
        h('span', { class: 'eyebrow' }, 'Your brief'),
        h('p', { class: 'brief-text' }, active.text),
        timerSlot,
        h('div', { class: 'focus-actions' },
          active.startedAt
            ? h('button', {
              class: 'btn btn-solid btn-grow', type: 'button',
              onclick: () => {
                const spent = Math.max(1, Math.round((clock.now().getTime() - new Date(active.startedAt).getTime()) / 60000));
                challengeForm(null, { brief: active.text, briefId: active.briefId, minutes: spent });
              },
            }, 'Finish and log')
            : h('button', {
              class: 'btn btn-solid btn-grow', type: 'button',
              onclick: () => {
                store.setKV('challenge', { ...active, startedAt: clock.now().toISOString() });
                toast(`${fmtDur(active.minutes)} on the clock. Go.`);
              },
            }, icon('timer', 18), `Start ${fmtDur(active.minutes)}`),
          h('button', { class: 'btn btn-grow', type: 'button', onclick: drawBrief }, icon('shuffle', 18), 'Another brief'),
        ),
        active.startedAt ? null : h('button', { class: 'btn-text', type: 'button', onclick: () => store.setKV('challenge', null) }, 'Put the brief away'),
      )
      : h('div', { class: 'brief' },
        h('p', { class: 'form-hint' }, 'A random brief, rooted in Morocco and everyday life, with a 2 hour timer.'),
        h('div', { class: 'focus-actions' }, h('button', { class: 'btn btn-solid', type: 'button', onclick: drawBrief }, icon('shuffle', 18), 'Draw a brief')),
      ),
    listOf('challenge', (r) => ({ title: r.brief, detail: [r.minutes ? fmtDur(r.minutes) : null, r.note].filter(Boolean).join(' · ') }), challengeForm),
  );

  // ---- lists --------------------------------------------------------------------

  function listOf(type, describe, form, limit = 6) {
    const all = store.records(type);
    if (!all.length) return null;
    return h('div', { class: 'loglist' }, all.slice(0, limit).map((r) => recordRow({
      date: fmtDate(r.date, 'day'), ...describe(r), right: thumb(r), onclick: () => form(r),
    })), all.length > limit ? h('p', { class: 'form-hint' }, `${all.length - limit} older entries are kept in the backup.`) : null);
  }
  const head = (title, label, onclick) => h('div', { class: 'sub-head' },
    h('h3', {}, title),
    h('button', { class: 'btn btn-small', type: 'button', onclick }, icon('plus', 16), label),
  );

  const sketches = store.records('sketch');
  const sketchSec = section({ no: '04', title: 'Sketches', meta: `${sketches.length} logged` },
    h('div', { class: 'focus-actions' },
      h('button', { class: 'btn btn-solid', type: 'button', onclick: () => sketchForm() }, icon('plus', 16), 'Sketch'),
      h('span', { class: 'form-hint' }, '15 minutes. One space, building or detail.'),
    ),
    sketches.some((r) => r.photos?.length)
      ? h('div', { class: 'gallery' }, sketches.filter((r) => r.photos?.length).slice(0, 9).map((r) => h('button', {
        class: 'gallery-item', type: 'button', 'aria-label': `${r.title}, ${fmtDate(r.date, 'long')}`, onclick: () => sketchForm(r),
      }, photoImg(r.photos[0], { cls: 'gallery-img', alt: r.title }))))
      : null,
    listOf('sketch', (r) => ({ title: r.title, detail: [r.subject, r.mode, r.note].filter(Boolean).join(' · ') }), sketchForm)
      ?? empty('No sketch yet. A 2 minute thumbnail counts.'),
  );

  const studySec = section({ no: '05', title: 'Studies and visits' },
    head('Precedent studies', 'Study', () => precedentForm()),
    listOf('precedent', (r) => ({ title: r.project, detail: [r.architect, r.year, r.place].filter(Boolean).join(' · ') }), precedentForm)
      ?? empty('One project, analyzed with the template: concept, plan, section, structure, light, materials.'),
    head('Building visits', 'Visit', () => visitForm()),
    listOf('visit', (r) => ({ title: r.building, detail: [r.city, r.note].filter(Boolean).join(' · ') }), visitForm)
      ?? empty('Rabat, Salé or Casablanca, with sketches and photos.'),
    head('Free explorations', 'Exploration', () => exploreForm()),
    listOf('explore', (r) => ({ title: r.title, detail: [r.kind, r.note].filter(Boolean).join(' · ') }), exploreForm)
      ?? empty('Model making, a material study, or AI assisted concept exploration.'),
  );

  // ---- idea bank ----------------------------------------------------------------

  const ideas = store.records('idea');
  const tags = [...new Set(ideas.flatMap((i) => i.tags ?? []))].sort();
  if (ideaTag && !tags.includes(ideaTag)) ideaTag = null;
  const quick = h('input', { class: 'input', type: 'text', maxlength: 300, placeholder: 'Catch an idea', 'aria-label': 'New idea' });
  const addQuick = async () => {
    const text = quick.value.trim();
    if (!text) return;
    await store.putRecord({ type: 'idea', date: today, text, tags: ideaTag ? [ideaTag] : [] });
    toast('Idea saved.');
  };
  quick.addEventListener('keydown', (e) => { if (e.key === 'Enter') addQuick(); });
  const shownIdeas = ideaTag ? ideas.filter((i) => i.tags?.includes(ideaTag)) : ideas;
  const ideaSec = section({ no: '03', title: 'Idea bank', meta: `${ideas.length} ideas` },
    h('div', { class: 'inline-form' }, quick, h('button', { class: 'btn', type: 'button', onclick: addQuick }, 'Add')),
    tags.length
      ? h('div', { class: 'tagbar' }, chips(tags.map((t) => ({ value: t, label: t })), ideaTag, (t) => {
        ideaTag = ideaTag === t ? null : t;
        navigate('create');
      }))
      : null,
    shownIdeas.length
      ? h('div', { class: 'loglist' }, shownIdeas.slice(0, 20).map((i) => recordRow({
        date: fmtDate(i.date, 'day'), title: i.text, detail: (i.tags ?? []).map((t) => `#${t}`).join(' '), right: thumb(i), onclick: () => ideaForm(i),
      })))
      : empty('Any idea, any time. Open one to add tags.'),
  );

  root.append(h('div', { class: 'two-col' },
    h('div', { class: 'col' }, cycleSec, challengeSec, ideaSec),
    h('div', { class: 'col' }, sketchSec, studySec),
  ));

  const tickTimer = active?.startedAt ? setInterval(drawTimer, 15000) : null;
  return () => clearInterval(tickTimer);
}
