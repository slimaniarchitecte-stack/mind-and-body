// Runs every test file. In the browser: open tests/index.html. With Node: node tests/run.js

import { run } from './harness.js';
import './dates.test.js';
import './schedule.test.js';
import './unlock.test.js';
import './adherence.test.js';
import './nutrition.test.js';
import './strength.test.js';
import './food.test.js';
import './learn.test.js';
import './stats.test.js';
import './backup.test.js';
import './ics.test.js';
import './pwa.test.js';
import './money.test.js';
import './replan.test.js';

const out = await run();

if (typeof document !== 'undefined') {
  window.__tests = out;
  const summary = document.getElementById('summary');
  const list = document.getElementById('list');
  summary.textContent = out.failed ? `${out.failed} failed, ${out.passed} passed` : `All ${out.passed} tests passed`;
  summary.className = out.failed ? 'fail' : 'pass';
  for (const r of out.results) {
    const li = document.createElement('li');
    li.className = r.ok ? 'pass' : 'fail';
    li.textContent = r.ok ? r.name : `${r.name}: ${r.error}`;
    list.append(li);
  }
} else {
  for (const r of out.results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : `\n     ${r.error}`}`);
  console.log(`\n${out.passed} passed, ${out.failed} failed`);
  if (out.failed) process.exitCode = 1;
}
