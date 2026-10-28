import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuoteText } from '../src/lib/importQuote.js';

test('recognizes client, quote number, date, category and priced work lines from text', () => {
  const text = `PREVENTIVO N. P 17/26\nData emissione: 12/03/2026\nCliente: Mario Rossi\nIndirizzo: Via Roma 12\nP. IVA: 12345678901\nSettore impianto elettrico\nFornitura e posa quadro elettrico € 1.200,00\nInstallazione prese € 350,00\nImponibile: € 1.550,00\nIVA 10%: € 155,00\nTotale documento: € 1.705,00`;
  const result = parseQuoteText(text, 'preventivo.pdf', { settings: { defaultVat: 10 } });
  assert.equal(result.client, 'Mario Rossi');
  assert.match(result.number, /17\/26/);
  assert.equal(result.date, '2026-03-12');
  assert.equal(result.category, 'Impianto elettrico');
  assert.equal(result.total, 1550);
  assert.equal(result.lines.find(line => line.desc.includes('quadro elettrico'))?.amount, 1200);
  assert.equal(result.lines.find(line => line.desc.includes('prese'))?.amount, 350);
});

test('does not throw on incomplete text and asks the user to verify missing fields', () => {
  const result = parseQuoteText('Documento senza campi riconoscibili', 'scan.pdf', { settings: { defaultVat: 10 } });
  assert.equal(typeof result.client, 'string');
  assert.ok(result.warnings.length > 0);
  assert.ok(Array.isArray(result.lines));
});
