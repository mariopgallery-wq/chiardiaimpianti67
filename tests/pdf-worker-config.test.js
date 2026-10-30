import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('PDF.js worker is imported as a Vite asset and follows the configured Pages base path', async () => {
  const app = await read('../src/App.jsx');
  const vite = await read('../vite.config.js');
  assert.match(app, /import pdfWorkerUrl from ['"]pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs\?url['"]/);
  assert.match(app, /pdfjsLib\.GlobalWorkerOptions\.workerSrc = pdfWorkerUrl/);
  assert.match(vite, /base:\s*['"]\.\/['"]/);
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
