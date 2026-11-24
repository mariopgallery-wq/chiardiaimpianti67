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

test('scanned PDFs use full-page OCR segmentation for multi-column quote headers', async () => {
  const app = await read('../src/App.jsx');
  assert.match(app, /worker\.setParameters\(\{[^}]*preserve_interword_spaces:\s*'1'[^}]*tessedit_pageseg_mode:\s*'3'/);
});

test('final print stylesheet uses a block document root and page-safe native table rows', async () => {
  const css = await read('../src/styles.css');
  const printStyles = css.slice(css.lastIndexOf('@media print'));
  assert.match(printStyles, /#quote-document[\s\S]*?display:\s*block\s*!important/);
  assert.match(printStyles, /\.quote-work-table thead[\s\S]*?display:\s*table-header-group\s*!important/);
  assert.match(printStyles, /\.quote-work-table tbody tr[\s\S]*?page-break-inside:\s*avoid\s*!important/);
  assert.match(printStyles, /\.quote-doc-footer[\s\S]*?page-break-inside:\s*avoid\s*!important/);
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
  assert.ok(app.includes("<div>{draft.client || 'NOME CLIENTE'}</div>"));
  assert.ok(!css.includes('.quote-recipient>strong{font-size:12px;text-transform:uppercase}'));
});

test('printing shows only the A4 quote template and excludes editor revision history', async () => {
  const app = await read('../src/App.jsx');
  const css = await read('../src/styles.css');
  assert.match(app, /document\.body\.classList\.add\('print-quote-only'\)/);
  assert.match(app, /document\.body\.classList\.remove\('print-quote-only'\)/);
  assert.match(css, /body\.print-quote-only \*\s*\{\s*visibility:\s*hidden\s*!important/i);
  assert.match(css, /body\.print-quote-only #quote-document,\s*body\.print-quote-only #quote-document \*\s*\{\s*visibility:\s*visible\s*!important/i);
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
  assert.ok(app.includes("window.addEventListener('afterprint', restorePrintState, { once: true });"));
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


test('quote line descriptions preserve line breaks in native table cells', async () => {
  const app = await read('../src/App.jsx');
  const css = await read('../src/styles.css');
  assert.ok(app.includes('<td className="quote-work-description">{line.desc}</td>'));
  assert.match(css, /\.quote-work-description\s*\{[^}]*white-space:\s*pre-wrap/s);
  assert.ok(app.includes("desc: String(line.desc || '').trim()"));
});

test('client phone, email and PEC are optional quote fields saved and printed', async () => {
  const app = await read('../src/App.jsx');
  const domain = await read('../src/lib/domain.js');
  for (const field of ['phone', 'email', 'pec']) {
    assert.ok(app.includes(`id="q-${field}"`));
    assert.ok(app.includes(`{draft.${field} && <div>`));
    assert.ok(domain.includes(`${field}: ''`));
    assert.ok(domain.includes(`String(q.${field} || '')`));
  }
});

test('editor catalog suggestions combine catalog and saved quotes only within the selected category', async () => {
  const app = await read('../src/App.jsx');
  assert.match(app, /filter\(item => item && item\.cat === category\)/);
  assert.match(app, /filter\(quote => quote && quote\.category === category\)/);
  assert.ok(app.includes('[db.items, db.quotes, draft?.category]'));
  assert.ok(app.includes('const options = editorCatalogItems'));
});

test('quote print table reserves conditional quantity and price columns', async () => {
  const css = await read('../src/styles.css');
  const app = await read('../src/App.jsx');
  assert.match(app, /const hasQuantity = visibleLines\.some/);
  assert.match(app, /const hasVisibleLinePrice = visibleLines\.some/);
  assert.match(app, /hasQuantity && <col className="quote-col-quantity" \/>/);
  assert.match(app, /hasVisibleLinePrice && <col className="quote-col-price" \/>/);
  assert.match(css, /\.quote-work-table\.has-quantity \.quote-col-quantity\s*\{[^}]*width:/s);
  assert.match(css, /\.quote-work-table\.has-price \.quote-col-price\s*\{[^}]*width:/s);
  assert.match(css, /\.quote-work-table\s*\{[^}]*table-layout:\s*fixed/s);
});


test('editor always shows a dedicated history toggle and keeps the history and restore panel closed by default', async () => {
  const app = await read('../src/App.jsx');
  const css = await read('../src/styles.css');
  assert.match(app, /const \[revisionHistoryOpen, setRevisionHistoryOpen\] = useState\(false\)/);
  assert.match(app, /<div className="editor-revision-toolbar">/);
  assert.match(app, /aria-expanded=\{revisionHistoryOpen\}/);
  assert.match(app, /aria-controls="revision-history-panel"/);
  assert.match(app, /onClick=\{\(\) => setRevisionHistoryOpen\(open => !open\)\}/);
  assert.match(app, /revisionHistoryOpen && \(/);
  assert.match(app, /Cronologia e ripristino/);
  assert.match(app, /Chiudi cronologia e ripristino/);
  assert.match(app, /Salva prima il preventivo/);
  assert.match(css, /\.editor-revision-toolbar \{[^}]*display:flex/s);
  assert.match(css, /\.editor-revision-toolbar \.revision-toggle\[aria-expanded="true"\]/);
  const printStyles = css.slice(css.lastIndexOf('@media print'));
  assert.match(printStyles, /\.editor-revision-toolbar,[\s\S]*?\.revision-history-card[\s\S]*?display:\s*none\s*!important/);
});

test('Descrizione remains left aligned when optional columns are absent', async () => {
  const css = await read('../src/styles.css');
  assert.match(css, /\.quote-work-table th:first-child\s*\{[^}]*text-align:\s*left/s);
  assert.match(css, /\.quote-work-table \.quote-quantity-heading\s*\{[^}]*text-align:\s*center/s);
  assert.match(css, /\.quote-work-table \.quote-price-heading\s*\{[^}]*text-align:\s*right/s);
});


test('deploy build emits an auto-updating service worker and registers it for the GitHub Pages base path', async () => {
  const vite = await read('../vite.config.js');
  const main = await read('../src/main.jsx');
  assert.match(vite, /emitFile\(\{ type: 'asset', fileName: 'sw\.js'/);
  assert.match(vite, /assets\.map\(file => `\.\/\$\{file\}`\)/);
  assert.match(vite, /self\.skipWaiting\(\)/);
  assert.match(vite, /self\.clients\.claim\(\)/);
  assert.match(main, /navigator\.serviceWorker\.register\(`\$\{import\.meta\.env\.BASE_URL\}sw\.js`/);
  assert.match(main, /registration\.update\(\)/);
  assert.match(main, /window\.addEventListener\('online', checkForAppUpdate\)/);
  assert.match(main, /visibilitychange/);
  assert.match(main, /window\.location\.reload\(\)/);
});

test('new quote template does not prefill sample title, intro or payment examples', async () => {
  const domain = await read('../src/lib/domain.js');
  const app = await read('../src/App.jsx');
  assert.match(domain, /title: ''/);
  assert.match(domain, /subtitle: '', intro: ''/);
  assert.match(domain, /payment: ''/);
  assert.doesNotMatch(app, /title: parsed\.title \|\| 'Preventivo per fornitura e posa in opera'/);
  assert.doesNotMatch(app, /payment: initial\.payment \|\| '70% a conferma lavoro/);
});
