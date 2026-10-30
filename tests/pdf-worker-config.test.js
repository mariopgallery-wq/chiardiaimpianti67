import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('PDF.js uses the version-matched public worker under the Vite base path', async () => {
  const app = await read('../src/App.jsx');
  assert.match(app, /pdf\.worker\.min\.mjs/);
  assert.match(app, /import\.meta\.env\.BASE_URL/);
  assert.match(app, /pdfjsLib\.GlobalWorkerOptions\.workerSrc/);
  assert.doesNotMatch(app, /pdf\.worker\.min\.mjs\?url/);
});

test('package lifecycle prepares the worker before Vite dev and production build', async () => {
  const pkg = JSON.parse(await read('../package.json'));
  assert.equal(pkg.scripts.predev, 'node scripts/prepare-pdf-worker.mjs');
  assert.equal(pkg.scripts.prebuild, 'node scripts/prepare-pdf-worker.mjs');
  assert.ok(pkg.dependencies['pdfjs-dist']);
});

test('worker preparation script copies the worker from the installed PDF.js version and rejects HTML', async () => {
  const script = await read('../scripts/prepare-pdf-worker.mjs');
  assert.match(script, /node_modules\/pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs/);
  assert.match(script, /public\/pdf\.worker\.min\.mjs/);
  assert.match(script, /first === '<'/);
  assert.match(script, /destinationStats\.size !== sourceStats\.size/);
});

test('GitHub Pages workflow fails safely when a worker is missing or contains HTML', async () => {
  const workflow = await read('../.github/workflows/deploy.yml');
  assert.match(workflow, /test -s dist\/pdf\.worker\.min\.mjs/);
  assert.match(workflow, /worker_bytes/);
  assert.match(workflow, /worker PDF contiene HTML/);
});
