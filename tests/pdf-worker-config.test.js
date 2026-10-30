import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('PDF.js uses the bundled ES module worker directly and follows the configured Pages base path', async () => {
  const app = await read('../src/App.jsx');
  const vite = await read('../vite.config.js');
  assert.ok(app.includes("import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'"));
  assert.ok(app.includes("pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(pdfWorkerUrl, { type: 'module' });"));
  assert.ok(!app.includes('GlobalWorkerOptions.workerSrc = pdfWorkerUrl'));
  assert.ok(vite.includes("base: './'") || vite.includes('base: "./"'));
});

test('line dragging remembers pointer movement during the long press and starts from the number handle', async () => {
  const app = await read('../src/App.jsx');
  assert.ok(app.includes('lastClientX: event.clientX, lastClientY: event.clientY,'));
  assert.ok(app.includes('reorderLineAtPoint(drag, drag.lastClientX, drag.lastClientY);'));
  assert.ok(app.includes('onPointerDown={e => startLineDrag(e, line.id)}'));
});

test('the customer name keeps the exact letter case entered and printed', async () => {
  const app = await read('../src/App.jsx');
  const css = await read('../src/styles.css');
  assert.ok(app.includes('client: draft.client.trim()'));
  assert.ok(app.includes("<strong>{draft.client || 'NOME CLIENTE'}</strong>"));
  assert.ok(!css.includes('.quote-recipient>strong{font-size:12px;text-transform:uppercase}'));
});

test('printing shows only the A4 quote template and excludes editor revision history', async () => {
  const css = await read('../src/styles.css');
  assert.match(css, /@page\s*\{\s*size\s*:\s*A4 portrait/i);
  assert.match(css, /\.page-editor\s*>\s*:not\(\.editor-layout\)\s*\{\s*display:\s*none\s*!important/i);
  assert.match(css, /\.revision-history-card\s*,[\s\S]*?display:\s*none\s*!important/i);
  assert.match(css, /\.editor-layout\s*>\s*\.edit-panel\s*\{\s*display:\s*none\s*!important/i);
  assert.match(css, /\.editor-layout\s*>\s*\.preview-panel\s*>\s*:not\(\.preview-paper-wrap\)/);
  assert.match(css, /#quote-document\s*\{[\s\S]*?width:\s*184mm\s*!important/i);
});

test('PDF save suggests a filename from quote number, customer, address, category and company', async () => {
  const app = await read('../src/App.jsx');
  assert.ok(app.includes('function safeFilenamePart(value)'));
  assert.ok(app.includes('function buildQuotePdfBasename(quote = {})'));
  assert.ok(app.includes("safeFilenamePart(quote.number) || 'Preventivo'"));
  assert.ok(app.includes('safeFilenamePart(quote.client)'));
  assert.ok(app.includes('safeFilenamePart(quote.address)'));
  assert.ok(app.includes('safeFilenamePart(quote.category)'));
  assert.ok(app.includes("'Chiaradia Impianti'"));
  assert.ok(app.includes('document.title = buildQuotePdfBasename(draft);'));
  assert.ok(app.includes("window.addEventListener('afterprint', restoreTitle, { once: true });"));
  assert.equal((app.match(/onClick=\{printQuote\}/g) || []).length, 3);
  assert.doesNotMatch(app, /onClick=\{\(\) => window\.print\(\)\}/);
});

test('GitHub Pages workflow checks the Vite-emitted worker asset instead of an unrelated public file path', async () => {
  const workflow = await read('../.github/workflows/deploy.yml');
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /pdf\.worker\*\.mjs/);
  assert.match(workflow, /dist\/assets/);
  assert.doesNotMatch(workflow, /test -s dist\/pdf\.worker\.min\.mjs/);
});

test('the package exposes test and build scripts and includes PDF.js', async () => {
  const pkg = JSON.parse(await read('../package.json'));
  assert.equal(pkg.scripts.test, 'node --test');
  assert.equal(pkg.scripts.build, 'vite build');
  assert.ok(pkg.dependencies['pdfjs-dist']);
});


test('GitHub Pages deploy runs only on manual request after all files are uploaded', async () => {
  const workflow = await read('../.github/workflows/deploy.yml');
  assert.match(workflow, /on:\s*workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+push:/m, 'per-file commits must not start intermediate builds');
  assert.match(workflow, /if:\s*github\.ref == ['"]refs\/heads\/main['"]/);
  assert.match(workflow, /cancel-in-progress:\s*false/, 'a later upload must not cancel a deployment already requested');
});
