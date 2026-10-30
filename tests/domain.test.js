import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CATEGORIES, DEFAULT_SETTINGS, defaultDb, normalizeDb, calcTotal,
  quoteNumber, newDraft, escapeName, formatDate,
} from '../src/lib/domain.js';

test('default workspace contains all six sectors and company settings', () => {
  const db = defaultDb();
  assert.equal(CATEGORIES.length, 6);
  assert.deepEqual(db.quotes, []);
  assert.deepEqual(db.items, []);
  assert.deepEqual(db.clients, []);
  assert.equal(db.settings.name, DEFAULT_SETTINGS.name);
  assert.equal(db.settings.defaultVat, 10);
});

test('new quote inherits the configured VAT and payment terms', () => {
  const db = defaultDb();
  db.settings.defaultVat = 22;
  db.settings.payment = 'Bonifico bancario';
  const draft = newDraft(db);
  assert.equal(draft.vatRate, 22);
  assert.equal(draft.payment, 'Bonifico bancario');
  assert.equal(draft.status, 'Bozza');
  assert.equal(draft.id, null);
  assert.match(draft.number, /^P 01\.\d{2}$/);
});

test('VAT and grand total calculate to cents and clamp invalid values', () => {
  assert.deepEqual(calcTotal({ net: '199.99', vatRate: 22 }), {
    net: 199.99, vat: 44, rate: 22, total: 243.99,
  });
  assert.deepEqual(calcTotal({ net: -12, vatRate: -5 }), {
    net: 0, vat: 0, rate: 0, total: 0,
  });
  assert.deepEqual(calcTotal({ net: 10, vatRate: 150 }), {
    net: 10, vat: 10, rate: 100, total: 20,
  });
});

test('quote numbering increments the largest number in the current year only', () => {
  const yy = String(new Date().getFullYear()).slice(-2);
  assert.equal(quoteNumber([]), `P 01.${yy}`);
  assert.equal(quoteNumber([{ number: `P 01.${yy}` }, { number: `P 03.${yy}` }, { number: 'P 99.99' }]), `P 04.${yy}`);
});

test('database normalization tolerates malformed or legacy records without losing valid data', () => {
  const db = normalizeDb({
    quotes: [null, { number: 'P 07.26', client: 'Mario Rossi', net: '100.00', vatRate: 10, lines: [{ desc: 'Installazione' }] }],
    items: [null, { desc: 'Presa elettrica', cat: 'non noto' }],
    clients: [null, { name: '   ' }, { name: 'Mario Rossi', address: 'Via Roma' }],
    settings: { defaultVat: '150' },
  });
  assert.equal(db.quotes.length, 1);
  assert.equal(db.quotes[0].client, 'Mario Rossi');
  assert.equal(db.quotes[0].vat, 10);
  assert.equal(db.quotes[0].total, 110);
  assert.ok(db.quotes[0].lines[0].id);
  assert.equal(db.items.length, 1);
  assert.equal(db.items[0].cat, CATEGORIES[0]);
  assert.deepEqual(db.clients.map(c => c.name), ['Mario Rossi']);
  assert.equal(db.settings.defaultVat, 100);
});

test('client matching ignores leading/trailing whitespace and capitalization', () => {
  assert.equal(escapeName('  MARIO Rossi '), 'mario rossi');
  assert.equal(escapeName(null), '');
});

test('date formatting safely handles missing and invalid dates', () => {
  assert.equal(formatDate(''), '—');
  assert.equal(formatDate('not-a-date'), 'not-a-date');
  assert.match(formatDate('2026-10-27'), /27/);
});

test('normalization preserves editor-only line costs without adding them to the quote total', () => {
  const db = normalizeDb({
    quotes: [{
      number: 'P 08.26', client: 'Mario Rossi', net: 100, vatRate: 10, total: 110,
      lines: [{ id: 'line-1', desc: 'Installazione', internalPrice: 23.5 }],
    }],
  });
  assert.equal(db.quotes[0].lines[0].internalPrice, 23.5);
  assert.equal(calcTotal(db.quotes[0]).total, 110);
});

test('normalization preserves deleted items and confirmed category templates without schema changes', () => {
  const entry = { id: 'trash-1', type: 'quote', label: 'P 01.26 · Cliente', deletedAt: '2026-10-28T10:00:00.000Z', data: { id: 'q1', number: 'P 01.26', client: 'Cliente' } };
  const template = { confirmed: true, confirmedAt: '2026-10-28T10:00:00.000Z', lines: ['Installazione quadro', 'Verifica impianto'] };
  const db = normalizeDb({ quotes: [], clients: [], items: [], trash: [entry], settings: { categoryTemplates: { 'Impianto elettrico': template } } });
  assert.equal(db.trash.length, 1);
  assert.equal(db.trash[0].data.id, 'q1');
  assert.deepEqual(db.settings.categoryTemplates['Impianto elettrico'].lines, template.lines);
  assert.equal(db.settings.categoryTemplates['Impianto elettrico'].confirmed, true);
});

test('normalization ignores malformed trash entries but keeps valid workspace data', () => {
  const db = normalizeDb({ quotes: [{ id: 'q1', client: 'Mario', lines: [] }], trash: [null, { type: 'unknown', data: {} }, { type: 'client', data: { name: 'Anna' } }] });
  assert.equal(db.quotes.length, 1);
  assert.equal(db.trash.length, 1);
  assert.equal(db.trash[0].type, 'client');
});


test('the description number is the drag handle and text editing does not start a drag', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const handleIndex = app.indexOf('className="description-bullet description-drag-handle"');
  assert.ok(handleIndex >= 0, 'numbered drag handle should exist beside each description');
  const handle = app.slice(handleIndex, app.indexOf('</button>', handleIndex));
  assert.match(handle, /onPointerDown=\{e => startLineDrag\(e, line\.id\)\}/);
  assert.match(handle, /onPointerMove=\{moveLineDrag\}/);
  const lineIndex = app.indexOf('aria-label={`Descrizione lavoro ${index + 1}`}');
  const textarea = app.slice(lineIndex, app.indexOf('/>', lineIndex));
  assert.doesNotMatch(textarea, /onPointerDown|startLineDrag/, 'drag gesture must not interfere with typing/selecting text');
});

test('navigation preserves the draft, while explicit return to the archive discards only unsaved editor state', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const pageStart = app.indexOf('const setPage = (id) => {');
  const pageEnd = app.indexOf('const pageTitle', pageStart);
  assert.ok(pageStart >= 0 && pageEnd > pageStart);
  assert.doesNotMatch(app.slice(pageStart, pageEnd), /setDraft\(null\)/, 'ordinary section navigation must keep the draft');
  const cancelStart = app.indexOf('const returnToArchive = () => {');
  const cancelEnd = app.indexOf('\n  };', cancelStart);
  const cancel = app.slice(cancelStart, cancelEnd);
  assert.match(cancel, /setDraft\(null\)/, 'explicit back-to-archive action discards the current editor draft');
  assert.match(cancel, /setView\('history'\)/, 'explicit return opens the archive');
});


test('every quote line has an always-visible catalog selector using all entries from the active workspace', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const memoStart = app.indexOf('const editorCatalogItems = useMemo');
  const memoEnd = app.indexOf('const clientItems', memoStart);
  assert.ok(memoStart >= 0 && memoEnd > memoStart);
  const catalogMemo = app.slice(memoStart, memoEnd);
  assert.match(catalogMemo, /Array\.isArray\(db\.items\)/);
  assert.match(catalogMemo, /\.filter\(item => item && typeof item\.desc === 'string' && item\.desc\.trim\(\)\)/);
  assert.doesNotMatch(catalogMemo, /draft\.category|catalogFilter/);
  const lineStart = app.indexOf('draft.lines.map((line, index)');
  const lineEnd = app.indexOf('</div><div className="internal-cost-summary"', lineStart);
  assert.ok(lineStart >= 0 && lineEnd > lineStart);
  const editorLine = app.slice(lineStart, lineEnd);
  assert.match(editorLine, /const options = editorCatalogItems/);
  assert.match(editorLine, /<select className="insert-suggestion"/);
  assert.match(editorLine, /Inserisci dal catalogo…/);
  assert.match(editorLine, /Catalogo vuoto/);
  assert.match(editorLine, /options\.map\(item => <option/);
  assert.doesNotMatch(editorLine, /\{options\.length > 0 && <select/);
});

test('the quote preview explicitly shows a bullet for each non-empty activity', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(app, /<ul className="quote-bullets">\{draft\.lines\.filter\(line => line\.desc\?\.trim\(\)\)\.map\(line => <li/);
  assert.match(css, /\.quote-bullets\{[^}]*list-style:disc outside/);
});

test('the numbered drag handle supports long-press pointer capture and keyboard reordering', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('const startLineDrag = (event, id) => {');
  const move = app.indexOf('const moveLineDrag = (event) => {', start);
  const end = app.indexOf('const moveLineByKeyboard', move);
  assert.ok(start >= 0 && move > start && end > move);
  const gesture = app.slice(start, end);
  assert.match(gesture, /setPointerCapture\?\.\(pointerId\)/, 'pointer is captured immediately on the numbered handle');
  assert.match(gesture, /}, 380\)/, 'drag starts only after a deliberate long press');
  assert.match(gesture, /elementFromPoint\(event\.clientX, event\.clientY\)/, 'drop target is found below the pointer');
  assert.match(app, /const moveLineByKeyboard = \(id, direction\)/);
  assert.match(app, /moveLineByKeyboard\(line\.id, -1\)/);
  const handleStart = app.indexOf('className="description-bullet description-drag-handle"');
  const handleEnd = app.indexOf('</button>', handleStart);
  const handle = app.slice(handleStart, handleEnd);
  assert.match(handle, /onPointerDown=\{e => startLineDrag\(e, line\.id\)\}/);
  assert.match(handle, /onPointerMove=\{moveLineDrag\}/);
  assert.match(handle, /onLostPointerCapture=\{finishLineDrag\}/);
  assert.match(handle, /Alt\+ArrowUp Alt\+ArrowDown/);
});

test('a draft remains resumable outside the editor and explicit return discards it without saving', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const pageStart = app.indexOf('const setPage = (id) => {');
  const pageEnd = app.indexOf('const pageTitle', pageStart);
  assert.ok(pageStart >= 0 && pageEnd > pageStart);
  assert.doesNotMatch(app.slice(pageStart, pageEnd), /setDraft\(null\)/);
  assert.match(app, /if \(draft\) \{\s*setView\('editor'\)/, 'New quote action resumes an existing draft');
  assert.match(app, /draft && view !== 'editor' && <div className="draft-resume-banner"/);
  assert.match(app, /onClick=\{createQuote\}>[\s\S]*?Riprendi preventivo/);
  const cancelStart = app.indexOf('const returnToArchive = () => {');
  const cancelEnd = app.indexOf('\n  };', cancelStart);
  const cancel = app.slice(cancelStart, cancelEnd);
  assert.match(cancel, /setDraft\(null\)/);
  assert.match(cancel, /setView\('history'\)/);
  assert.doesNotMatch(cancel, /updateDb|saveQuote|supabase/);
  const editStart = app.indexOf('const editQuote = (quote) => {');
  const editEnd = app.indexOf('const updateDraft', editStart);
  assert.ok(editStart >= 0 && editEnd > editStart);
  assert.match(app.slice(editStart, editEnd), /draft\.id === quote\.id/);
});
