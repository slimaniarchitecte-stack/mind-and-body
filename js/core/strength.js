// Strength sessions: what I did last time, and when to move to a harder variation.
//
// A saved session looks like:
//   { type: 'strength', date, session: 'a', minimum: false,
//     exercises: [{ id: 'push-up', variation: 'Push ups', sets: [12, 10, 9] }] }

// The variations I can do (pull ups need a bar).
export function availableVariations(exercise, settings) {
  const all = exercise.variations ?? [exercise.name];
  const needsBar = new Set(exercise.needsBar ?? []);
  const usable = all.filter((v) => settings?.pullUpBar || !needsBar.has(v));
  return usable.length ? usable : all.slice(0, 1);
}

// The last time this exercise was logged before `date` (or null).
export function lastPerformance(records, sessionId, exerciseId, date) {
  const past = records
    .filter((r) => r.type === 'strength' && r.session === sessionId && !r.minimum && r.date < date)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const r of past) {
    const ex = (r.exercises ?? []).find((e) => e.id === exerciseId && e.sets?.some((v) => v > 0));
    if (ex) return { date: r.date, variation: ex.variation, sets: ex.sets };
  }
  return null;
}

// The variation to show today: the one used last time, or the starting one.
export function currentVariation(exercise, last, settings) {
  const usable = availableVariations(exercise, settings);
  if (last?.variation && usable.includes(last.variation)) return last.variation;
  const start = (exercise.variations ?? [exercise.name])[exercise.start ?? 0];
  return usable.includes(start) ? start : usable[0];
}

// Did every planned set reach the top of the range?
export function hitTop(exercise, sets) {
  if (!sets || sets.length < exercise.sets) return false;
  return sets.slice(0, exercise.sets).every((v) => v >= exercise.range[1]);
}

// What to suggest after a session with these sets.
//   null                              keep going
//   { kind: 'variation', next }       move to the next variation
//   { kind: 'harder' }                no harder variation in the list: make it harder another way
export function progression(exercise, variation, sets, settings) {
  if (!hitTop(exercise, sets)) return null;
  const usable = availableVariations(exercise, settings);
  const i = usable.indexOf(variation);
  if (i >= 0 && i < usable.length - 1) return { kind: 'variation', next: usable[i + 1] };
  return { kind: 'harder' };
}

// '3 x 8 to 12 per leg' or '3 x 30 to 45 s'.
export function targetText(exercise) {
  const [low, high] = exercise.range;
  const unit = exercise.unit === 's' ? ' s' : '';
  return `${exercise.sets} x ${low} to ${high}${unit}${exercise.per ? ` ${exercise.per}` : ''}`;
}
