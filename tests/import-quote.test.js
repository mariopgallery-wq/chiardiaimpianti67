import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('uses the page layout to separate company header, customer, quote data, payment terms, work descriptions and totals', () => {
  const content = [
    'CHIARADIA IMPIANTI', 'Di Filippo Chiaradia', 'C.da graviglione 9',
    '70024 – Gravina in Puglia (BA)', 'P. IVA 08623720722', 'PEC: chiaradiafilippo@pec.it',
    'DIMATTIA GIUSEPPE', 'LOCALE DI CULTO', '26900 LODI (LO)',
    'P 31.26', 'Data: 24/10/2026', 'Termini: 70% a conferma lavoro', '30% a completamento',
    'ARTICOLO IMPORTO', 'Preventivo per fornitura e posa in opera di un climatizzatore mono split',
    'Hisense Console 18000btu A++', 'Si precisa quanto segue:',
    'La valutazione è stata fatta in base alla qualità delle categorie dei lavori indicati verbalmente in sede',
    'di sopralluogo effettuato con il committente ed elencati in lista;',
    'Il preventivo include:', 'Fornitura e posa quadro elettrico', 'Totale imponibile: 17.500,00 €',
    'IVA (10%): 1.750,00 €', 'Totale: 19.250,00 €',
  ];
  const layoutLines = content.map((text, index) => ({
    text, page: 1, yNorm: 0.08 + index * 0.018, top: (0.08 + index * 0.018) * 842,
    x: 0.08, xEnd: 0.95, fontSize: 10,
    segments: [{ text, x: 0.08, xEnd: 0.5, fontSize: 10 }],
  }));
  const setLine = (text, updates) => {
    const line = layoutLines.find(item => item.text === text);
    Object.assign(line, updates);
    line.top = line.yNorm * 842;
  };
  setLine('CHIARADIA IMPIANTI', { yNorm: 0.08 });
  for (const text of content.slice(1, 6)) setLine(text, { yNorm: 0.11 });
  setLine('DIMATTIA GIUSEPPE', {
    text: 'DIMATTIA GIUSEPPE P 31.26', yNorm: 0.23,
    segments: [
      { text: 'DIMATTIA GIUSEPPE', x: 0.08, xEnd: 0.33, fontSize: 10 },
      { text: 'P 31.26', x: 0.80, xEnd: 0.91, fontSize: 10 },
    ],
  });
  setLine('LOCALE DI CULTO', { yNorm: 0.25 });
  setLine('26900 LODI (LO)', { yNorm: 0.27 });
  setLine('P 31.26', { yNorm: 0.23, x: 0.80, segments: [{ text: 'P 31.26', x: 0.80, xEnd: 0.91, fontSize: 10 }] });
  setLine('Data: 24/10/2026', { yNorm: 0.25, x: 0.62, segments: [{ text: 'Data: 24/10/2026', x: 0.62, xEnd: 0.95, fontSize: 10 }] });
  setLine('Termini: 70% a conferma lavoro', { yNorm: 0.27, x: 0.62, segments: [{ text: 'Termini: 70% a conferma lavoro', x: 0.62, xEnd: 0.95, fontSize: 10 }] });
  setLine('30% a completamento', { yNorm: 0.29, x: 0.72, segments: [{ text: '30% a completamento', x: 0.72, xEnd: 0.95, fontSize: 10 }] });
  setLine('ARTICOLO IMPORTO', { yNorm: 0.31, segments: [
    { text: 'ARTICOLO', x: 0.08, xEnd: 0.30, fontSize: 10 },
    { text: 'IMPORTO', x: 0.84, xEnd: 0.95, fontSize: 10 },
  ] });
  setLine('Preventivo per fornitura e posa in opera di un climatizzatore mono split', { yNorm: 0.33 });
  setLine('Hisense Console 18000btu A++', { yNorm: 0.348 });
  setLine('Si precisa quanto segue:', { yNorm: 0.37 });
  setLine('La valutazione è stata fatta in base alla qualità delle categorie dei lavori indicati verbalmente in sede', { yNorm: 0.395 });
  setLine('di sopralluogo effettuato con il committente ed elencati in lista;', { yNorm: 0.41 });
  setLine('Il preventivo include:', { yNorm: 0.445 });
  setLine('Fornitura e posa quadro elettrico', { yNorm: 0.47, segments: [
    { text: 'Fornitura e posa quadro elettrico', x: 0.10, xEnd: 0.52, fontSize: 10 },
    { text: '1.200,00 €', x: 0.84, xEnd: 0.95, fontSize: 10 },
  ], text: 'Fornitura e posa quadro elettrico 1.200,00 €' });
  setLine('Totale imponibile: 17.500,00 €', { yNorm: 0.91 });
  setLine('IVA (10%): 1.750,00 €', { yNorm: 0.94 });
  setLine('Totale: 19.250,00 €', { yNorm: 0.96 });
  const result = parseQuoteText(content.join('\n'), 'preventivo-modello.pdf', { settings: { defaultVat: 10 } }, { layoutLines });

  assert.equal(result.client, 'DIMATTIA GIUSEPPE');
  assert.equal(result.number, 'P 31.26');
  assert.equal(result.date, '2026-10-24');
  assert.equal(result.tax, '', 'the company VAT number must not become the customer tax number');
  assert.equal(result.address, '', 'a site descriptor must not be treated as a street address');
  assert.equal(result.place, 'LOCALE DI CULTO · 26900 LODI (LO)');
  assert.equal(result.payment, '70% a conferma lavoro\n30% a completamento');
  assert.equal(result.category, 'Climatizzazione');
  assert.equal(result.total, 17500);
  assert.equal(result.title, 'Preventivo per fornitura e posa in opera di un climatizzatore mono split');
  assert.equal(result.subtitle, 'Hisense Console 18000btu A++');
  assert.match(result.intro, /La valutazione è stata fatta/);
  assert.match(result.intro, /Il preventivo include:/);
  assert.equal(result.lines.find(line => line.desc === 'Fornitura e posa quadro elettrico')?.amount, 1200);
  assert.ok(!result.lines.some(line => /^Il preventivo include:/i.test(line.desc)));
  assert.ok(result.lines.every(line => !/CHIARADIA|DIMATTIA|P 31\.26|Totale imponibile|19\.250/.test(line.desc)));
});

test('infers the customer from the lower header area in a Word-style text extraction and does not copy company P.IVA', () => {
  const text = `CHIARADIA IMPIANTI\nDi Filippo Chiaradia\nC.da graviglione 9\n70024 – Gravina in Puglia (BA)\nP. IVA 08623720722\nPEC: chiaradiafilippo@pec.it\nCell: 3395046509\nE-mail: filippochiaradia@hotmail.it\nDIMATTIA GIUSEPPE\nLOCALE DI CULTO\n26900 LODI (LO)\nP 31.26\nData: 24/10/2026\nTermini: 70% a conferma lavoro\n30% a completamento\nARTICOLO IMPORTO\nPreventivo per fornitura e posa in opera di un climatizzatore mono split\nHisense Console 18000btu A++\nSi precisa quanto segue:\nInstallazione di climatizzatore\nTotale imponibile: 17.500,00 €\nIVA (10%): 1.750,00 €\nTotale: 19.250,00 €`;
  const result = parseQuoteText(text, 'preventivo.docx', { settings: { defaultVat: 10 } });
  assert.equal(result.client, 'DIMATTIA GIUSEPPE');
  assert.equal(result.number, 'P 31.26');
  assert.equal(result.date, '2026-10-24');
  assert.equal(result.tax, '');
  assert.equal(result.address, '', 'a site descriptor must not be treated as a street address');
  assert.equal(result.place, 'LOCALE DI CULTO · 26900 LODI (LO)');
  assert.equal(result.payment, '70% a conferma lavoro\n30% a completamento');
  assert.equal(result.total, 17500);
  assert.ok(result.lines.some(line => line.desc === 'Installazione di climatizzatore'));
});

test('keeps intentionally repeated description rows instead of deduplicating them', () => {
  const text = `Preventivo n. P 07.26\nData: 12/03/2026\nCliente: Mario Rossi\nARTICOLO IMPORTO\nInstallazione presa elettrica\nInstallazione presa elettrica\nTotale imponibile: 100,00 €\nIVA 10%: 10,00 €\nTotale: 110,00 €`;
  const result = parseQuoteText(text, 'repeat.docx', { settings: { defaultVat: 10 } });
  assert.equal(result.lines.filter(line => line.desc === 'Installazione presa elettrica').length, 2);
});


test('internal line costs are not rendered in the customer document component', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('function QuoteDocument');
  const end = app.indexOf('export default function App', start);
  assert.ok(start >= 0 && end > start, 'QuoteDocument component should exist');
  const documentComponent = app.slice(start, end);
  assert.match(documentComponent, /line\.desc/);
  assert.doesNotMatch(documentComponent, /internalPrice|line\.amount|money\(line/);
});

test('recognizes integer euro prices with thousands separators without mistaking ordinary counts for prices', () => {
  const text = `Preventivo n. P 09.26\nData: 15/04/2026\nCliente: Mario Rossi\nARTICOLO IMPORTO\nFornitura materiale 1.200 €\nInstallazione di 2 unità\nTotale imponibile: 1.200,00 €`;
  const result = parseQuoteText(text, 'interi.docx', { settings: { defaultVat: 10 } });
  assert.equal(result.lines.find(line => line.desc === 'Fornitura materiale')?.amount, 1200);
  assert.equal(result.lines.find(line => line.desc === 'Installazione di 2 unità')?.amount, null);
});

test('regression: the filename provides the quote number only when the document does not contain one', () => {
  const text = `Cliente: Mario Rossi\nData: 24/10/2026\nARTICOLO IMPORTO\nInstallazione climatizzatore\nTotale imponibile: 1.200,00 €`;
  const result = parseQuoteText(text, 'P.31-26 DIMATTIA GIUSEPPE.pdf', { settings: { defaultVat: 10 } });
  assert.equal(result.number, 'P 31-26');
  assert.equal(result.client, 'Mario Rossi');
  assert.equal(result.date, '2026-10-24');
  assert.ok(result.lines.some(line => line.desc === 'Installazione climatizzatore'));
});

test('PDF worker URL is kept separate from the existing import parser and client data model', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /parseQuoteText\(extracted\.text, file\.name, db/);
  assert.match(app, /pdfjsLib\.GlobalWorkerOptions\.workerSrc/);
  assert.match(app, /saveImportedQuote/);
});
