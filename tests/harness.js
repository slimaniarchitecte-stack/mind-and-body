// A very small test runner. It works in the browser (open tests/index.html)
// and in Node, if you install it later (node tests/run.js).

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

const show = (v) => JSON.stringify(v);

export const assert = {
  ok(value, message) {
    if (!value) throw new Error(message ?? `expected a true value, got ${show(value)}`);
  },
  equal(actual, expected, message) {
    if (actual !== expected) throw new Error(`${message ? `${message}: ` : ''}expected ${show(expected)}, got ${show(actual)}`);
  },
  deepEqual(actual, expected, message) {
    if (show(actual) !== show(expected)) throw new Error(`${message ? `${message}: ` : ''}expected ${show(expected)}, got ${show(actual)}`);
  },
  close(actual, expected, tolerance = 0.001, message) {
    if (Math.abs(actual - expected) > tolerance) throw new Error(`${message ? `${message}: ` : ''}expected about ${expected}, got ${actual}`);
  },
};

// Load a file of the project, by its path from the project folder (for example 'data/program.json').
export async function loadText(path) {
  const url = new URL(`../${path}`, import.meta.url);
  if (typeof window !== 'undefined') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`could not load ${path}`);
    return res.text();
  }
  const { readFile } = await import('node:fs/promises');
  return readFile(url, 'utf8');
}

export const loadJSON = async (path) => JSON.parse(await loadText(path));

export async function run() {
  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err.message });
    }
  }
  return { passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}
