import { todayISO } from './domain.js';

const euroNumber = (value) => {
  if (value == null) return null;
  let s = String(value).replace(/[^\d,.-]/g, '').trim();
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
export function parseQuoteText(rawText, fileName, db = {}) {
  const text = String(rawText || '').replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').replace(/\r/g, '\n');
  const lines = text.split('\n').map(x => x.trim()).filter(Boolean);
  const all = lines.join('\n');
  const match = (regex) => all.match(regex)?.[1]?.trim() || '';
  const number = match(/(?:preventivo|offerta|n(?:\.|°|umero)?\s*(?:preventivo)?)[\s:№#-]*([A-Z]?\s*\d{1,6}(?:[\/-][\w.-]+)?)/i);
  const dateRaw = match(/(?:data(?:\s+di\s+emissione)?|emesso\s+il|del)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})/i) || (all.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/) || [])[1] || '';
  let date = todayISO();
  if (dateRaw) { const parts = dateRaw.split(/[./-]/); if (parts[0].length === 4) date = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`; else { let y = Number(parts[2]); if (y < 100) y += y < 50 ? 2000 : 1900; date = `${y}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; } }
  const clientLabels = /(?:cliente|spett\.le|spettabile|destinatario|committente|ragione sociale)\s*[:\-]?\s*(.+)/i;
  let client = '';
  for (const line of lines) { const m = line.match(clientLabels); if (m && m[1].length > 2 && !/partita iva|codice fiscale/i.test(m[1])) { client = m[1].trim(); break; } }
  if (!client) { const candidate = lines.find(line => line.length > 3 && line.length < 90 && !/chiaradia|impianti|preventivo|data|numero|\bP\.\s*IVA\b|codice fiscale|totale|imponibile|iva\b|pagamento|indirizzo|tel\.?|email|pec/i.test(line) && !/^\d/.test(line)); client = candidate || ''; }
  const vatRateMatch = all.match(/IVA\s*(?:al|\()?\s*(0|4|5|10|22)(?:[,.]\d+)?\s*%/i);
  const vatRate = vatRateMatch ? Number(vatRateMatch[1].replace(',', '.')) : Number(db?.settings?.defaultVat ?? 10);
  const numberPatterns = [/imponibile\s*[:€ ]*([\d.]+,\d{2}|\d+,\d{2}|\d+\.\d{2})/i, /(?:totale\s+(?:preventivo|documento|complessivo)|totale\s+iva\s+inclusa|totale\s+da\s+pagare)\s*[:€ ]*([\d.]+,\d{2}|\d+,\d{2}|\d+\.\d{2})/i];
  let total = null; let totalIsGross = false;
  for (let pi = 0; pi < numberPatterns.length; pi++) { const m = all.match(numberPatterns[pi]); if (m) { total = euroNumber(m[1]); totalIsGross = pi === 1; if (total !== null) break; } }
  if (total !== null && totalIsGross && vatRate > 0) total = Math.round((total / (1 + vatRate / 100) + Number.EPSILON) * 100) / 100;
  const detectedLines = [];
  for (const line of lines) {
    if (line.length < 4 || /^(preventivo|offerta|spett\.le|cliente|destinatario|data|numero|p\.\s*iva|codice fiscale|tel\.?|email|pec|totale|imponibile|iva\s*\(?|subtotale|firma|pagamento|termini di pagamento|coordinate bancarie)/i.test(line)) continue;
    if (/chiaradia impianti/i.test(line) || /^(pagina|www\.|https?:\/\/)/i.test(line)) continue;
    const priceMatch = line.match(/(?:€\s*)?(-?\d{1,3}(?:\.\d{3})*(?:,\d{2})|-?\d+(?:[,.]\d{2}))\s*(?:€|EUR)?\s*$/i);
    let desc = line; let amount = null;
    if (priceMatch && /€|EUR|,\d{2}|\.\d{2}/i.test(priceMatch[0])) { amount = euroNumber(priceMatch[1]); desc = line.slice(0, priceMatch.index).replace(/[|;–—-]+\s*$/, '').trim(); }
    desc = desc.replace(/^\d+[.)\-]\s*/, '').replace(/^[•●▪\-]\s*/, '').trim();
    if (desc.length >= 4 && !/^(totale|imponibile|iva|sconto|acconto|saldo|importo|prezzo unitario|quantità|q\.tà)/i.test(desc)) detectedLines.push({ desc, amount });
  }
  const uniqueLines = [];
  const seen = new Set();
  for (const line of detectedLines) { const key = line.desc.toLocaleLowerCase('it-IT'); if (!seen.has(key)) { seen.add(key); uniqueLines.push(line); } }
  const categoryText = all.toLowerCase();
  const category = categoryText.includes('fotovolta') ? 'Fotovoltaico' : categoryText.includes('videosorvegl') || categoryText.includes('telecamera') ? 'Videosorveglianza' : categoryText.includes('antifurto') || categoryText.includes('allarme') ? 'Antifurto' : categoryText.includes('climatizz') || categoryText.includes('condizion') ? 'Climatizzazione' : categoryText.includes('idraulic') || categoryText.includes('sanitari') ? 'Impianto idraulico' : 'Impianto elettrico';
  if (total === null) { const sums = detectedLines.reduce((sum, line) => sum + (line.amount || 0), 0); if (sums > 0) total = Math.round(sums * 100) / 100; }
  const tax = match(/(?:P\.?\s*IVA|codice fiscale|C\.?F\.?)\s*[:\-]?\s*([A-Z0-9]{8,16})/i);
  const address = match(/(?:indirizzo|sede|residenza)\s*[:\-]?\s*([^\n]+)/i);
  const payment = lines.filter(line => /\b(acconto|saldo|pagamento|termini di pagamento|consegna)\b/i.test(line)).slice(0, 3).join('\n');
  const formatWarning = /\.doc$/i.test(fileName) ? 'Formato DOC legacy: estrazione euristica, controlla con attenzione tutte le voci e gli importi.' : '';
  return { fileName, rawText: all, number, date, client, tax, address, payment, vatRate, category, total: total ?? 0, lines: uniqueLines.length ? uniqueLines : [{ desc: '', amount: null }], warnings: [formatWarning, !client && 'Cliente non riconosciuto: inseriscilo manualmente.', !number && 'Numero preventivo non riconosciuto: verifica il numero suggerito.', !dateRaw && 'Data di emissione non riconosciuta: verifica la data.', !uniqueLines.some(l => l.desc) && 'Non sono state riconosciute voci descrittive: controlla il testo estratto.', total === null && 'Totale non riconosciuto: controlla l’imponibile e l’IVA.'].filter(Boolean) };
}
