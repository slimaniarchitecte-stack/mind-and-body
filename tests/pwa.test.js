import { test, assert, loadText, loadJSON } from './harness.js';
import { DATA_FILES } from '../js/program.js';

const sw = await loadText('sw.js');
const FILES = [...sw.slice(sw.indexOf('const FILES'), sw.indexOf('];')).matchAll(/'([^']+)'/g)].map((m) => m[1]);
const listed = new Set(FILES);
const isText = (path) => /\.(html|css|js|json|webmanifest|svg)$/.test(path);

// 'js/screens/today.js' + '../ui/dom.js' -> 'js/ui/dom.js'
const resolve = (from, spec) => new URL(spec, `http://app/${from}`).pathname.slice(1);

// Every local file that `path` loads.
function references(path, text) {
  const out = [];
  if (path.endsWith('.html')) {
    for (const m of text.matchAll(/(?:href|src)="([^"#]+)"/g)) out.push(m[1]);
  } else if (path.endsWith('.css')) {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) out.push(m[1]);
  } else if (path.endsWith('.js')) {
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']+)'/g)) out.push(m[1]);
    for (const m of text.matchAll(/new URL\('(\.{1,2}\/[^'`$]+)',\s*import\.meta\.url\)/g)) out.push(m[1]);
  } else if (path.endsWith('.webmanifest')) {
    for (const icon of JSON.parse(text).icons ?? []) out.push(icon.src);
  }
  return out.filter((s) => !/^(data:|https?:|mailto:)/.test(s)).map((s) => resolve(path, s));
}

test('offline: every file in the offline list exists', async () => {
  assert.ok(FILES.length > 50, 'the list was read from sw.js');
  assert.ok(listed.has('./') && listed.has('index.html'));
  const missing = [];
  for (const file of FILES) {
    if (file === './') continue;
    try { await loadText(file); } catch { missing.push(file); }
  }
  assert.deepEqual(missing, [], 'files listed in sw.js but not found');
});

test('offline: everything the app loads is in the offline list', async () => {
  const seen = new Set();
  const queue = ['index.html', 'manifest.webmanifest', ...DATA_FILES.map((n) => `data/${n}.json`), 'sw.js'];
  const notListed = [];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    if (path !== 'sw.js' && !listed.has(path)) notListed.push(path);
    if (!isText(path) || path === 'sw.js') continue;
    for (const ref of references(path, await loadText(path))) queue.push(ref);
  }
  assert.deepEqual(notListed, [], 'add these files to FILES in sw.js');
  assert.ok(seen.has('js/screens/settings.js') && seen.has('fonts/InterVariable.woff2'), 'the walk reached scripts and the font');
});

test('offline: all paths are relative, so the app works in a sub folder on GitHub Pages', async () => {
  assert.ok(FILES.every((f) => !f.startsWith('/') && !/^https?:/.test(f)));
  const html = await loadText('index.html');
  const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length > 5);
  assert.deepEqual(links.filter((l) => l.startsWith('/') || /^https?:/.test(l)), []);
  const manifest = await loadJSON('manifest.webmanifest');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.every((i) => !i.src.startsWith('/')));
});

test('offline: the manifest has the icons a phone needs', async () => {
  const manifest = await loadJSON('manifest.webmanifest');
  const has = (size, purpose) => manifest.icons.some((i) => i.sizes === size && i.purpose === purpose && i.type === 'image/png');
  assert.ok(has('192x192', 'any'));
  assert.ok(has('512x512', 'any'));
  assert.ok(has('512x512', 'maskable'));
  assert.ok((await loadText('index.html')).includes('rel="apple-touch-icon"'), 'iPhone home screen icon');
});

test('independent: nothing is loaded from another site, and there is no AI or tracking code', async () => {
  const problems = [];
  for (const file of FILES) {
    if (file === './' || !isText(file)) continue;
    const text = await loadText(file);
    if (/(?:fetch|import|importScripts)\s*\(\s*['"`]https?:/.test(text)) problems.push(`${file}: loads a remote address`);
    if (/from\s+['"]https?:/.test(text)) problems.push(`${file}: imports a remote module`);
    if (/@import|url\(\s*["']?https?:/.test(text) && file.endsWith('.css')) problems.push(`${file}: remote style or font`);
    if (/(?:src|href)="https?:/.test(text) && file.endsWith('.html')) problems.push(`${file}: remote resource`);
    if (/anthropic|openai|api\.claude|googletagmanager|google-analytics|gtag\(|sendBeacon/i.test(text)) problems.push(`${file}: AI or tracking reference`);
  }
  assert.deepEqual(problems, []);
});
