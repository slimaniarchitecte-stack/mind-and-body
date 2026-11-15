// PFE progress: my own list of steps, each with an optional due date.

import { diffDays } from './dates.js';

// A starting list I can edit or delete. Steps only, no dates: I set those myself.
export const PFE_STARTER = [
  'Choose the subject and the site',
  'Site visit and analysis',
  'Program and references',
  'Concept and first sketches',
  'Plans, sections and elevations',
  '3D model and images',
  'Panels and physical model',
  'Rehearse the presentation',
];

// steps: [{ id, title, due, done }]. deadline: 'YYYY-MM-DD' or null.
export function pfeProgress(steps, today, deadline) {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const open = steps.filter((s) => !s.done);
  const dated = open.filter((s) => s.due).sort((a, b) => a.due.localeCompare(b.due));
  return {
    total,
    done,
    pct: total ? done / total : null,
    // The next step is the open one due first; without dates, the first open one in the list.
    next: dated[0] ?? open[0] ?? null,
    late: dated.filter((s) => s.due < today).length,
    daysToDeadline: deadline ? diffDays(today, deadline) : null,
  };
}
