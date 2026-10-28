import test from 'node:test';
import assert from 'node:assert/strict';
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
