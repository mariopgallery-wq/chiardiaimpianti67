import { todayISO } from './domain.js';

/**
 * Importazione del preventivo: prima vengono individuate le aree del documento
 * (anagrafica in alto, corpo descrittivo e riepilogo economico), poi i campi
 * vengono estratti separatamente. `layoutLines` è fornito da PDF.js e conserva
 * la posizione relativa dei testi sulla pagina.
 */
const euroNumber = (value) => {
  if (value == null) return null;
  let s = String(value).replace(/[^\d,.-]/g, '').trim();
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.')
    ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
};

const normalizeText = (value) => String(value || '')
  .replace(/\u00a0/g, ' ')
  .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
  .replace(/[\t ]+/g, ' ')
  .trim();

const lineText = (line) => normalizeText(typeof line === 'string' ? line : line?.text);
// Elenco dei marcatori usati normalmente nei preventivi: trattini, pallini,
// quadratini, simboli di spunta e numerazioni. Sono riconosciuti solo a inizio riga.
const BULLET_PREFIX = /^(?:[-]|[•●▪▫◦‣∙·*■□✓✔☑]|\d+[.)]|e(?=\s+[A-ZÀ-ÖØ-Þ]))\s*/u;
const isBulletLineText = (value) => BULLET_PREFIX.test(lineText(value));
const removeBulletPrefix = (value) => lineText(value).replace(BULLET_PREFIX, '').trim();
const lineTextForRegion = (line, minX, maxX = 1) => {
  if (!Array.isArray(line?.segments) || !line.segments.length) return lineText(line);
  return normalizeText(line.segments.filter(segment => Number(segment.x ?? 0) >= minX && Number(segment.x ?? 0) < maxX).map(segment => segment.text || '').join(' '));
};
const isHeaderCompanyLine = (value) => /\bchiaradia\b|di filippo chiaradia|c\.?da\s+graviglione|gravina in puglia|\bpec\b|\bcell(?:ulare)?\b|\be-?mail\b|\bwww\.|https?:\/\/|@|\bp\.?\s*iva\b|codice fiscale/i.test(value);
// Un dato viene scritto nel campo Indirizzo solo se è un indirizzo stradale
// riconoscibile o se porta un'etichetta esplicita. Un nome di luogo ("LOCALE DI CULTO")
// non è un indirizzo e non deve ricevere testo narrativo del corpo del preventivo.
const isStreetAddress = (value) => /^(?:(?:via|viale|v\.?le|piazza|p\.?zza|piazzale|corso|c\.?so|strada|contrada|c\.?da|localit[aà]|loc\.?|largo|vicolo|vico|lungomare|traversa|frazione|s\.?p\.?|s\.?s\.?)\b.{0,140}|.{2,100}\b\d{1,4}(?:[\/-]\w+)?(?:\s*,.*)?$)/i.test(normalizeText(value));
const isPostalPlace = (value) => /^(?:\d{5}\s+)?[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’ .-]{1,70}(?:\s+\([A-Z]{2}\))$/i.test(normalizeText(value)) || /^\d{5}\s+[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’ .-]{1,70}$/i.test(normalizeText(value));
const labelledValue = (lines, pattern) => lines.map(lineText).map(text => text.match(pattern)?.[1]?.trim()).find(Boolean) || '';
const isClientMetaLabel = (value) => /^(?:cliente|spett\.?le|spettabile|destinatario|committente|ragione sociale|indirizzo|sede|residenza|localit[aà]|luogo|data|numero|n(?:\.|°|umero)?|preventivo|offerta|termini(?: di pagamento)?|pagamento)\s*[:\-]?/i.test(value);
const isMoneySummaryLine = (value) => /\b(?:totale\s+imponibile|imponibile|subtotale|iva\b|totale\s+(?:preventivo|documento|complessivo|da pagare)|totale\s*:|importo\s+totale|sconto|acconto\s+versato|saldo\s+finale)\b/i.test(value);
const bodyStartPattern = /(?:^|\b)(?:ARTICOLO\s+IMPORTO|DESCRIZIONE\s+(?:IMPORTO|PREZZO|Q\.?T[AÀ]|QUANTIT[AÀ])|DESCRIZIONE\s+E\s+QUANTIT[AÀ])(?=\s|$)/i;
const workBandPattern = /^lavorazioni\s+previste\s*:?$/i;
const titleStartPattern = /^(?:preventivo per|offerta per|fornitura e posa in opera di)\b/i;
const closingStartPattern = /^(?:sono comprese nel preventivo|sono inclus[ei] nel preventivo|restano escluse|sono escluse|la ditta(?: installatrice)?\b|a fine lavori\b|installazione dell['’]impianto a regola d['’]arte|installazione dell['’]impianto a regola d’arte|certificato di conformit[aà]|dichiarazione di conformit[aà]|di\.?co\.?\b|certificazione f-gas|la presente offerta|validit[aà] del preventivo|esclusioni\s*:|condizioni di garanzia)\b/i;
const datePattern = /(\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b)/;

function parseDate(dateRaw) {
  if (!dateRaw) return '';
  const raw = dateRaw.trim();
  let y, m, d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) [y, m, d] = raw.split('-').map(Number);
  else {
    const parts = raw.split(/[./-]/).map(Number);
    if (parts.length !== 3) return '';
    [d, m, y] = parts;
    if (y < 100) y += y < 50 ? 2000 : 1900;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function amountAtEnd(value) {
  const text = normalizeText(value);
  const match = text.match(/(?:€\s*)?(-?\d{1,3}(?:\.\d{3})+(?:,\d{2})?|-?\d+(?:[,.]\d{2})?)\s*(?:€|EUR)?\s*$/i);
  if (!match) return { desc: text, amount: null };
  const token = match[0];
  // Un prezzo viene preso dalla descrizione solo se ha due decimali o è marcato EUR/€.
  if (!/(?:€|EUR|[,.]\d{2})/i.test(token)) return { desc: text, amount: null };
  const amount = euroNumber(match[1]);
  if (amount === null) return { desc: text, amount: null };
  return { desc: text.slice(0, match.index).replace(/[|;–—-]+\s*$/, '').trim(), amount };
}

function parseNumber(lines, all, fileName = '') {
  // Il modello Chiaradia mostra il numero come “P 31.26”. L'OCR può perdere
  // il separatore e restituire “P 31 26”: ricostruiamo comunque il formato.
  const quoteNumberPattern = /\bP\s*(\d{1,5})\s*([./-]|\s+)\s*(\d{2,4})\b/i;
  const exactQuoteNumber = lines.find((line) => quoteNumberPattern.test(lineText(line)));
  const fromPosition = exactQuoteNumber && lineText(exactQuoteNumber).match(quoteNumberPattern);
  if (fromPosition) return `P ${fromPosition[1]}${fromPosition[2].trim() || '.'}${fromPosition[3]}`;
  const labeled = all.match(/(?:preventivo|offerta)\s*(?:n(?:\.|°|umero)?\s*)?[:№#\- ]*([A-Z]?\s*\d{1,6}(?:[/.-][\w.-]+)+|[A-Z]?\s*\d{1,6})/i);
  if (labeled) return labeled[1].replace(/\s+/g, ' ').trim();
  const numbered = all.match(/(?:n(?:\.|°|umero)?\s*(?:preventivo)?\s*[:№#\- ]*)([A-Z]?\s*\d{1,6}(?:[/.-][\w.-]+)+)/i);
  if (numbered) return numbered[1].replace(/\s+/g, ' ').trim();
  // Fallback soltanto sul prefisso del nome file (es. P.31-26 ...pdf), mai su un
  // numero arbitrario trovato nel corpo, nell'indirizzo o nel riepilogo.
  const stem = String(fileName || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim();
  const filenameMatch = stem.match(/^P[. _-]*(\d{1,5}[.-]\d{2,4})\b/i);
  return filenameMatch ? `P ${filenameMatch[1]}` : '';
}

function findTableStart(lines) {
  return lines.findIndex((line) => {
    const text = lineText(line);
    return bodyStartPattern.test(text) && /(?:IMPORTO|PREZZO|ARTICOLO|Q\.?T[AÀ]|QUANTIT[AÀ])/i.test(text);
  });
}

function findContentStart(lines, tableIndex = -1) {
  const limit = tableIndex >= 0 ? tableIndex : lines.length;
  const anchors = [];
  for (let i = 0; i < limit; i++) {
    const text = lineText(lines[i]);
    if (workBandPattern.test(text) || titleStartPattern.test(text) || /^si precisa quanto segue\s*:?$/i.test(text)) anchors.push(i);
  }
  return anchors.length ? anchors[0] : tableIndex;
}

function findFooterStart(lines, fromIndex = 0) {
  for (let i = Math.max(0, fromIndex); i < lines.length; i++) {
    if (/\b(?:totale\s+imponibile|imponibile\s*[:€]|iva\s*\(?\s*\d{0,2}\s*%|totale\s+(?:documento|preventivo|complessivo|da pagare)|totale\s*[:€])/i.test(lineText(lines[i]))) return i;
  }
  return lines.length;
}

function parseSummary(all, lines, db) {
  const context = lines.map(lineText).join('\n') + '\n' + all;
  const vatRateMatch = context.match(/\bIVA\s*(?:al\s*)?\(?\s*(0|4|5|10|22)(?:[,.]\d+)?\s*%/i);
  const vatRate = vatRateMatch ? Number(vatRateMatch[1].replace(',', '.')) : Number(db?.settings?.defaultVat ?? 10);
  const labelledAmount = (regex) => {
    const match = context.match(regex);
    return match ? euroNumber(match[1]) : null;
  };
  const net = labelledAmount(/(?:totale\s+imponibile|imponibile)\s*[:=]?\s*(?:€\s*)?([\d.]+,\d{2}|\d+,\d{2}|\d+\.\d{2})\s*(?:€|EUR)?/i);
  const gross = labelledAmount(/(?:totale\s+(?:preventivo|documento|complessivo|da\s+pagare)|importo\s+totale|totale)\s*[:=]?\s*(?:€\s*)?([\d.]+,\d{2}|\d+,\d{2}|\d+\.\d{2})\s*(?:€|EUR)?/i);
  const grossExplicit = /totale\s+(?:preventivo|documento|complessivo|da\s+pagare)|importo\s+totale/i.test(context) || (/\biva\s*\(?\s*\d{1,2}\s*%/i.test(context) && /(?:^|\n)\s*totale\s*[:=]/im.test(context));
  let total = net;
  if (total === null && gross !== null) total = grossExplicit && vatRate > 0
    ? Math.round((gross / (1 + vatRate / 100) + Number.EPSILON) * 100) / 100 : gross;
  return { vatRate: Number.isFinite(vatRate) ? vatRate : 10, total, gross, net };
}

function categoryFromText(text) {
  const value = String(text || '').toLocaleLowerCase('it-IT');
  // Prima consideriamo il titolo/sottotitolo: una voce elettrica può citare
  // climatizzatori senza trasformare l'intero preventivo in Climatizzazione.
  if (/\bimpiant[oi]\s+elettric|\bimpiant[oi]\s+elettrici\b/.test(value)) return 'Impianto elettrico';
  if (/\bimpiant[oi]\s+idraulic|\bimpiant[oi]\s+idraulici\b/.test(value)) return 'Impianto idraulico';
  if (/fotovolta/.test(value)) return 'Fotovoltaico';
  if (/videosorvegl|telecamera|videocamera/.test(value)) return 'Videosorveglianza';
  if (/antifurto|allarme/.test(value)) return 'Antifurto';
  if (/climatizz|condizion|dual console|split/.test(value)) return 'Climatizzazione';
  if (/idraulic|sanitari|rubinett/.test(value)) return 'Impianto idraulico';
  return '';
}

function detectPayment(lines, bodyStart) {
  const beforeBody = lines.slice(0, bodyStart < 0 ? lines.length : bodyStart);
  const result = [];
  let started = false;
  const paymentSchedule = /\b(?:\d{1,3}\s*%\s*(?:a\s+)?(?:conferma|fine|completamento|infilaggio|ordine|consegna|lavori?)|(?:acconto|saldo)\b)/i;
  for (let i = 0; i < beforeBody.length; i++) {
    const text = lineText(beforeBody[i]);
    if (/\b(?:termini(?:\s+di\s+pagamento)?|pagamento)\s*:?/i.test(text)) {
      started = true;
      const rest = text.replace(/^.*?\b(?:termini(?:\s+di\s+pagamento)?|pagamento)\s*:?\s*/i, '').trim();
      if (rest) result.push(rest);
      continue;
    }
    // Recupero OCR: se “Termini” è stato letto male ma la riga contiene una
    // percentuale associata a una scadenza, riconosciamo ugualmente la rata.
    const scheduleIndex = text.search(paymentSchedule);
    if (scheduleIndex >= 0) {
      started = true;
      // Nei PDF a colonne l'estrazione testuale lineare può concatenare la
      // località di sinistra alla rata a destra (es. "Bari 70124 30%...").
      // Conserviamo soltanto il tratto che contiene la condizione di pagamento.
      const scheduleText = text.slice(scheduleIndex).replace(/^(?:te|t[eè]|rmini|term(?:ini)?)\s*[:.]?\s*(?=\d{1,3}\s*%)/i, '').trim();
      if (scheduleText) result.push(scheduleText);
      continue;
    }
    if (started && /\b(?:\d{1,3}\s*%|acconto|saldo|all'ordine|alla consegna|a conferma|a completamento|fine lavori|fine lavoro|bonifico|contanti|giorni)\b/i.test(text)) result.push(text);
    else if (started && result.length && text) break;
  }
  return [...new Set(result)].slice(0, 5).join('\n').trim();
}

function parseLayoutFields(layoutLines, all, db, fileName = '') {
  const sorted = [...layoutLines].sort((a, b) => Number(a.page || 1) - Number(b.page || 1) || Number(a.yNorm ?? a.y ?? 0) - Number(b.yNorm ?? b.y ?? 0));
  const firstPage = sorted.filter(line => Number(line.page || 1) === 1);
  const tableIndex = findTableStart(firstPage);
  const tableLine = tableIndex >= 0 ? firstPage[tableIndex] : null;
  const contentStartIndex = findContentStart(firstPage, tableIndex);
  const fallbackBodyIndex = contentStartIndex < 0 ? firstPage.findIndex(line => isBulletLineText(line) || /^(?:preventivo per|offerta per|si precisa quanto segue|fornitura e posa|realizzazione di|installazione di|il preventivo include)/i.test(lineText(line))) : contentStartIndex;
  const bodyStartIndex = fallbackBodyIndex >= 0 ? fallbackBodyIndex : tableIndex;
  const bodyStartLine = bodyStartIndex >= 0 ? firstPage[bodyStartIndex] : tableLine;
  const tableY = Number(bodyStartLine?.yNorm ?? (fallbackBodyIndex >= 0 ? firstPage[fallbackBodyIndex]?.yNorm : 0.34));
  const beforeTable = bodyStartIndex >= 0 ? firstPage.slice(0, bodyStartIndex) : firstPage.filter(line => Number(line.yNorm ?? line.y ?? 0) < tableY);
  const num = parseNumber(beforeTable.filter(line => Number(line.x ?? line.xNorm ?? 0) > 0.42), beforeTable.map(line => lineTextForRegion(line, 0.42, 1)).join('\n')) || parseNumber(beforeTable, all) || parseNumber([], '', fileName);
  const numberLine = beforeTable.find(line => num && lineText(line).toLocaleLowerCase('it-IT').includes(num.toLocaleLowerCase('it-IT')));
  const referenceY = Number(numberLine?.yNorm ?? numberLine?.y ?? (tableY - 0.09));
  const metadataStart = Math.max(0.12, Math.min(tableY - 0.18, referenceY - 0.025));
  const metadata = beforeTable.filter(line => {
    const y = Number(line.yNorm ?? line.y ?? 0);
    const x = Number(line.x ?? line.xNorm ?? 0);
    return y >= metadataStart && y < tableY && x < 0.98;
  });
  const rightMeta = metadata.map(line => lineTextForRegion(line, 0.48, 1)).filter(Boolean);
  const leftMeta = metadata.map(line => lineTextForRegion(line, 0, 0.58)).filter(Boolean);

  let client = '';
  const explicitClient = leftMeta.map(text => text.match(/(?:cliente|spett\.?le|spettabile|destinatario|committente|ragione sociale)\s*[:\-]?\s*(.{2,100})/i)?.[1]?.trim()).find(Boolean);
  if (explicitClient) client = explicitClient;
  else {
    const candidates = leftMeta.filter(text => text.length > 2 && text.length < 110 &&
      !isHeaderCompanyLine(text) && !isClientMetaLabel(text) &&
      !/^(?:P\s*\d|data\b|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i.test(text) &&
      !/\b(?:totale|iva|imponibile|pagamento|termini)\b/i.test(text));
    client = candidates[0] || '';
  }
  client = client.replace(/^(?:cliente|spett\.?le|spettabile|destinatario|committente|ragione sociale)\s*[:\-]?\s*/i, '').replace(/\s+P\s*\d{1,5}(?:[./-]\s*|\s+)\d{2,4}\b.*$/i, '').trim();

  const cleanedLeft = leftMeta.filter(text => text !== client && !isHeaderCompanyLine(text) && !/^(?:cliente|spett\.?le|spettabile|destinatario|committente|ragione sociale)\s*[:\-]?$/i.test(text));
  // La P. IVA del fornitore spesso compare nella parte alta del PDF. Non va
  // mai assegnata al cliente: cerchiamo il codice solo sulla riga del cliente
  // o nelle righe successive della sua area anagrafica.
  const clientMetaIndex = metadata.findIndex(line => {
    const text = lineTextForRegion(line, 0, 0.58);
    return text && (text === client || text.toLocaleLowerCase('it-IT').includes(client.toLocaleLowerCase('it-IT')) || /(?:cliente|spett\.?le|spettabile|destinatario|committente|ragione sociale)\s*[:\-]?/i.test(text));
  });
  const clientMetaLines = clientMetaIndex >= 0 ? metadata.slice(clientMetaIndex) : [];
  const clientTaxLine = clientMetaLines.map(line => lineTextForRegion(line, 0, 0.58)).find(text => /(?:P\.?\s*IVA|codice fiscale|\bC\.?F\.?\b)/i.test(text));
  const taxMatch = clientTaxLine?.match(/(?:P\.?\s*IVA|codice fiscale|\bC\.?F\.?\b)\s*[:\-]?\s*([A-Z0-9]{8,16})/i);
  const tax = taxMatch?.[1] || '';
  const labeledAddress = labelledValue(metadata, /^(?:indirizzo(?:\s+cliente)?|sede(?:\s+(?:legale|operativa))?|residenza)\s*[:\-]\s*(.+)$/i);
  const labeledPlace = labelledValue(metadata, /^(?:localit[aà]|citt[aà]|luogo)\s*[:\-]\s*(.+)$/i);
  const addrCandidates = cleanedLeft.filter(text => text.length > 2 && !isClientMetaLabel(text) && !/\b(?:P\.?\s*IVA|codice fiscale|\bC\.?F\.?)\b/i.test(text) && !/^(?:ARTICOLO|IMPORTO)$/i.test(text));
  const address = labeledAddress || addrCandidates.find(isStreetAddress) || '';
  const postalPlace = addrCandidates.find(isPostalPlace) || '';
  // Eventuali descrittori del luogo (es. “LOCALE DI CULTO”) restano nell'area
  // anagrafica/località, non nel campo indirizzo e mai nella lista delle lavorazioni.
  const siteNotes = addrCandidates.filter(text => text !== postalPlace && !isStreetAddress(text) && !isHeaderCompanyLine(text));
  const place = labeledPlace || [ ...siteNotes, postalPlace ].filter(Boolean).join(' · ');

  const dateLines = rightMeta.length ? rightMeta : beforeTable.map(lineText);
  const dateLine = dateLines.find(text => /\bdata\b/i.test(text) && datePattern.test(text)) || dateLines.find(text => datePattern.test(text));
  const dateRaw = dateLine?.match(datePattern)?.[1] || '';
  const payment = detectPayment(metadata.map(line => ({ ...line, text: lineTextForRegion(line, 0.48, 1) })).filter(line => lineText(line)), -1);

  const summary = parseSummary(all, sorted.map(lineText), db);
  const taxRate = summary.vatRate;
  const body = [];
  let started = false;
  const columnHeaderIndex = sorted.findIndex((line, index) => index >= Math.max(0, tableIndex) &&
    /(?:^|\b)(?:q\.?\s*t[aà]|quantit[aà]|prezzo|importo)(?=\s|$)/i.test(lineText(line)));
  const columnHeader = columnHeaderIndex >= 0 ? sorted[columnHeaderIndex] : null;
  const quantityColumnX = columnHeader?.segments?.find(segment => /^(?:q\.?\s*t[aà]|quantit[aà])\.?$/i.test(normalizeText(segment.text)))?.x;
  const priceColumnX = columnHeader?.segments?.find(segment => /^(?:prezzo|importo)$/i.test(normalizeText(segment.text)))?.x;
  for (let lineIndex = 0; lineIndex < sorted.length; lineIndex++) {
    const line = sorted[lineIndex];
    const page = Number(line.page || 1);
    let text = lineText(line);
    const y = Number(line.yNorm ?? line.y ?? 0);
    if (page === 1 && line === bodyStartLine) started = true;
    if (page === 1 && !started) continue;
    if (bodyStartPattern.test(text) || /^(?:articolo|importo|descrizione|prezzo|q\.?t[aà]|quantit[aà])$/i.test(text) || workBandPattern.test(text)) continue;
    if (isMoneySummaryLine(text) && /\d[.,]\d{2}/.test(text)) break;
    if (page > 1 && (y < 0.30 || isHeaderCompanyLine(text) || /\bP\s*\d{1,5}[./-]\d{2,4}\b/i.test(text))) continue;
    if (isHeaderCompanyLine(text) || /^(?:pagina\s+\d+|www\.|https?:\/\/)/i.test(text)) continue;

    // Quando il PDF contiene già la tabella Descrizione / Q.tà / Prezzo,
    // recuperiamo i valori dalle coordinate delle celle e li consegniamo al
    // parser comune come marcatori espliciti, senza confonderli con i numeri
    // che appartengono alla descrizione tecnica.
    if (columnHeaderIndex >= 0 && lineIndex > columnHeaderIndex && Array.isArray(line.segments) && line.segments.length > 1) {
      const qX = Number(quantityColumnX);
      const pX = Number(priceColumnX);
      const columnXs = [qX, pX].filter(Number.isFinite);
      const firstValueColumnX = columnXs.length ? Math.min(...columnXs) : NaN;
      if (Number.isFinite(firstValueColumnX)) {
        const descriptionParts = line.segments.filter(segment => Number(segment.x ?? 0) < firstValueColumnX - 0.006).map(segment => segment.text || '');
        const quantityParts = Number.isFinite(qX) ? line.segments.filter(segment => Number(segment.x ?? 0) >= qX - 0.006 && (!Number.isFinite(pX) || Number(segment.x ?? 0) < pX - 0.006)).map(segment => segment.text || '') : [];
        const priceParts = Number.isFinite(pX) ? line.segments.filter(segment => Number(segment.x ?? 0) >= pX - 0.006).map(segment => segment.text || '') : [];
        const descriptionText = normalizeText(descriptionParts.join(' '));
        const quantityText = normalizeText(quantityParts.join(' '));
        const quantityValue = quantityText.match(/\d+(?:[,.]\d+)?/)?.[0];
        const priceText = normalizeText(priceParts.join(' '));
        if (descriptionText && (quantityValue || priceText)) {
          text = [descriptionText, quantityValue ? `N ${quantityValue}` : '', priceText ? `${priceText}${/€|EUR/i.test(priceText) ? '' : ' €'}` : ''].filter(Boolean).join(' ');
          body.push({ ...line, text });
          continue;
        }
      }
    }
    body.push(line);
  }
  return { client, number: num, date: parseDate(dateRaw), dateRaw, tax, address, place, payment, vatRate: taxRate, bodyLines: body, tableIndex, bodyStartIndex };
}

function bodyStringsFromText(lines) {
  const tableIndex = findTableStart(lines);
  const contentStart = findContentStart(lines, tableIndex);
  const start = contentStart >= 0 ? contentStart : tableIndex;
  if (start >= 0) {
    const footerIndex = findFooterStart(lines, start + 1);
    return lines.slice(start, footerIndex).filter((line) => {
      const text = lineText(line);
      return text && !bodyStartPattern.test(text) && !/^(?:articolo|importo|descrizione|prezzo|q\.?t[aà]|quantit[aà])$/i.test(text) && !/^\s*(?:pagina\s+\d+|www\.|https?:\/\/)/i.test(text);
    });
  }
  const fallback = lines.findIndex((line) => {
    const text = lineText(line);
    return (isBulletLineText(text) || /^(?:fornitura e posa|installazione di|realizzazione di|sopralluogo e|il preventivo include|fornitura di n\.?\s*\d)/i.test(text)) && !isHeaderCompanyLine(text);
  });
  const from = fallback >= 0 ? fallback : 0;
  const footerIndex = findFooterStart(lines, from);
  return lines.slice(from, footerIndex).filter((line) => {
    const text = lineText(line);
    return text && !isHeaderCompanyLine(text) && !isClientMetaLabel(text) &&
      !/^(?:preventivo\s*(?:n(?:\.|°|umero)?|#)|data\s*[:\-]|settore\s+)/i.test(text) &&
      !/\b(?:totale|imponibile|iva\s*\(?\d*\s*%)\b/i.test(text);
  });
}

function joinPhysicalBodyLines(bodyLines) {
  const output = [];
  for (const rawLine of bodyLines) {
    const text = lineText(rawLine);
    if (!text) continue;
    if (typeof rawLine === 'string' || !Number.isFinite(Number(rawLine.top))) {
      // Mammoth restituisce una riga per paragrafo; le lasciamo separate.
      output.push({ text, x: 0, page: 1 });
      continue;
    }
    if (rawLine.preserveBoundary) {
      // Nei DOCX ogni paragrafo e ogni riga di tabella sono unità esplicite:
      // non vanno saldate solo perché le coordinate sintetiche sono ravvicinate.
      output.push({ text, x: Number(rawLine.x ?? 0), top: Number(rawLine.top), page: Number(rawLine.page || 1), fontSize: Number(rawLine.fontSize || 10) });
      continue;
    }
    const previous = output[output.length - 1];
    const top = Number(rawLine.top);
    const previousTop = previous?.top;
    const gap = Number.isFinite(previousTop) ? top - previousTop : Infinity;
    const x = Number(rawLine.x ?? 0);
    const previousX = Number(previous?.x ?? x);
    const bullet = isBulletLineText(text);
    const heading = /^(?:il\s+)?(?:preventivo include|preventivo comprende|tutto comprende|inoltre include|si precisa quanto segue|condizioni(?:\s+generali)?|note(?:\s+finali)?|fornitura di n\.?\s*\d)/i.test(text);
    const threshold = Math.max(13, Number(rawLine.fontSize || 10) * 1.65);
    const previousIsTitle = previous && /^(?:preventivo per|offerta per|fornitura e posa in opera di)\b/i.test(previous.text);
    const continuation = previous && previous.page === Number(rawLine.page || 1) && gap >= 0 && gap <= threshold &&
      !bullet && !heading && !previousIsTitle && !/^(?:il\s+)?(?:preventivo include|si precisa quanto segue)/i.test(previous.text) &&
      Math.abs(x - previousX) <= 0.035;
    if (continuation) previous.text = `${previous.text} ${text}`.replace(/\s+/g, ' ').trim();
    else output.push({ text, x, top, page: Number(rawLine.page || 1), fontSize: Number(rawLine.fontSize || 10) });
  }
  return output;
}

function mergeMarkedBulletRows(paragraphs) {
  // Se il documento usa i trattini come separatori, ogni riga marcata apre
  // una nuova voce. Le righe subito successive senza marcatore sono il seguito
  // della stessa descrizione e vengono mantenute nella medesima textarea.
  if (!paragraphs.some(row => isBulletLineText(row?.text))) return paragraphs;

  const output = [];
  let currentBullet = null;
  const flush = () => {
    if (currentBullet) output.push(currentBullet);
    currentBullet = null;
  };
  const isBoundary = (text) => isMoneySummaryLine(text) || closingStartPattern.test(text.replace(/^(?:[-‐‑‒–—]|[•●▪▫◦‣∙·*■□✓✔☑])\s*/, '')) ||
    /^(?:altre condizioni|note finali|condizioni finali|condizioni generali|esclusioni|totale lavori|riepilogo|cordiali saluti|distinti saluti|firma)\b/i.test(text) ||
    /^(?:il\s+)?(?:preventivo\s+(?:inoltre\s+)?include|preventivo comprende|tutto comprende|inoltre include|lavori inclusi|prestazioni incluse)\s*:?$/i.test(text);

  for (const row of paragraphs) {
    const text = lineText(row?.text);
    if (!text) continue;
    if (currentBullet && isBoundary(text)) {
      flush();
      output.push({ ...row, text });
      continue;
    }
    if (isBulletLineText(text)) {
      flush();
      currentBullet = { ...row, text: removeBulletPrefix(text), hasBullet: true };
      continue;
    }
    if (currentBullet) {
      // La newline è intenzionale: la voce resta unica, ma il testo importato
      // conserva la struttura delle righe che andranno nella stessa casella.
      currentBullet.text = currentBullet.text ? `${currentBullet.text}\n${text}` : text;
    } else {
      output.push({ ...row, text });
    }
  }
  flush();
  return output;
}

function extractStructuredBody(bodyLines, db) {
  const paragraphs = mergeMarkedBulletRows(joinPhysicalBodyLines(bodyLines));
  const texts = paragraphs.map(row => normalizeText(row.text)).filter(Boolean);
  const markedBulletTexts = new Set(paragraphs.filter(row => row.hasBullet).map(row => normalizeText(row.text)));
  const firstWorkRowIsMarked = (value) => markedBulletTexts.has(normalizeText(value));
  let title = '';
  let subtitle = '';
  let intro = '';
  let closing = '';
  const remaining = [...texts].filter(text => !workBandPattern.test(text));

  if (remaining.length && titleStartPattern.test(remaining[0])) {
    title = remaining.shift();
    // Ricompone titoli spezzati tra più righe, anche quando l'OCR separa BTU,
    // il secondo split e l'indirizzo dell'appartamento.
    if (remaining.length && /\b(?:in|presso|di|a|per|con|e)$/i.test(title) &&
      /^(?:appartamento|abitazione|locale|via|viale|piazza|corso|strada|contrada|presso)\b/i.test(remaining[0])) {
      title = `${title} ${remaining.shift()}`.replace(/\s+/g, ' ').trim();
    }
    if (/\b(?:mono\s*split|dual\s*split|climatizz|condizion)/i.test(title)) {
      while (remaining.length && /^(?:btu\b|e\s*N\s*\d|N\s*\d)/i.test(remaining[0])) {
        title = `${title} ${remaining.shift()}`.replace(/\s+/g, ' ').trim();
      }
      if (remaining.length && /^(?:appartamento|abitazione|locale)\s+in\s+(?:via|viale|piazza|corso|strada|contrada)\b/i.test(remaining[0])) {
        title = `${title} ${remaining.shift()}`.replace(/\s+/g, ' ').trim();
      }
    }
    const possibleSubtitle = remaining[0] || '';
    const startsWorkItem = /^(?:fornitura|installazione|realizzazione|sopralluogo|consegna|predisposizione|vuoto|punto|linea|quadro|distribuzione|serie civile|montaggio|posa|collaudo|collegamento|smontaggio|rimozione)\b/i.test(possibleSubtitle);
    const looksLikeModel = /\b(?:hisense|ferroli|midea|daikin|mitsubishi|samsung|lg|panasonic|btu|kw|a\+{1,3}|modello|console|monosplit|dualsplit)\b/i.test(possibleSubtitle);
    if (remaining.length && !startsWorkItem && !firstWorkRowIsMarked(possibleSubtitle) && !isBulletLineText(possibleSubtitle) &&
      !/^(?:si precisa|il preventivo include|il tutto comprende|fornitura di n\.?\s*\d)\b/i.test(possibleSubtitle) &&
      possibleSubtitle.length < 180 && (looksLikeModel || !possibleSubtitle)) subtitle = remaining.shift();
  }
  const sectionHeading = /^(?:il\s+)?(?:preventivo\s+(?:inoltre\s+)?include|preventivo comprende|tutto comprende|inoltre include|lavori inclusi|prestazioni incluse)\s*:?$/i;
  // Le righe introduttive che descrivono modalità di posa o serie/materiali
  // (es. P35.26) sono specifiche generali, non singole lavorazioni da quotare.
  const prefacePattern = /^(?:distribuzione e calate|serie civile e comandi|materiali? e finiture|modalit[aà] di posa|descrizione generale|premesse tecniche)\s*:/i;
  const prefaceParts = [];
  while (remaining.length && prefacePattern.test(removeBulletPrefix(remaining[0]))) {
    prefaceParts.push(removeBulletPrefix(remaining.shift()));
  }
  if (prefaceParts.length) intro = prefaceParts.join('\n');
  const introIndex = remaining.findIndex(text => /^si precisa quanto segue\s*:?/i.test(text));
  if (introIndex >= 0) {
    const label = remaining.splice(introIndex, 1)[0].replace(/^si precisa quanto segue\s*:?/i, 'Si precisa quanto segue:').trim();
    const introParts = [label];
    // Assorbiamo il testo discorsivo solo quando il documento contiene anche una
    // intestazione esplicita che segna l'inizio delle lavorazioni. Senza tale intestazione,
    // le righe seguenti potrebbero essere proprio le voci da importare.
    const hasFollowingSectionHeading = remaining.some((text, index) => index >= introIndex && sectionHeading.test(text));
    if (hasFollowingSectionHeading) {
      while (remaining.length && !sectionHeading.test(remaining[0]) &&
        !/^(?:altre condizioni|note finali|condizioni finali)\s*:?/i.test(remaining[0]) &&
        !/^(?:[-•●▪◦*]|\d+[.)])\s*/.test(remaining[0])) {
        introParts.push(remaining.shift());
      }
      if (remaining.length && sectionHeading.test(remaining[0])) introParts.push(remaining.shift());
    }
    intro = [intro, introParts.filter(Boolean).join('\n')].filter(Boolean).join('\n').trim();
  } else {
    // Se la lista ha un'intestazione esplicita ma manca “Si precisa quanto segue”,
    // la conserviamo come testo introduttivo invece di trasformarla in una lavorazione.
    const headingIndex = remaining.findIndex(text => sectionHeading.test(text));
    if (headingIndex >= 0 && headingIndex <= 1) intro = remaining.splice(headingIndex, 1)[0].trim();
  }
  const additionalSectionHeadings = remaining.filter(text => sectionHeading.test(text));
  if (additionalSectionHeadings.length) {
    intro = [intro, ...additionalSectionHeadings].filter(Boolean).join('\n').trim();
    for (let i = remaining.length - 1; i >= 0; i--) if (sectionHeading.test(remaining[i])) remaining.splice(i, 1);
  }

  // Le note finali sono separate sia da etichette esplicite sia da formule
  // tipiche di esclusioni, collaudo e dichiarazioni di conformità.
  const explicitClosingIndex = remaining.findIndex(text => /^(?:altre condizioni|note finali|condizioni finali|condizioni generali|esclusioni)\s*:?/i.test(text));
  const inferredClosingIndex = remaining.findIndex((text, index) => index >= 1 && closingStartPattern.test(removeBulletPrefix(text)));
  const closingIndexes = [explicitClosingIndex, inferredClosingIndex].filter(index => index >= 0);
  const closingIndex = closingIndexes.length ? Math.min(...closingIndexes) : -1;
  if (closingIndex >= 0) {
    closing = remaining.splice(closingIndex).map((text, index) => index === 0 ? removeBulletPrefix(text) : text)
      .filter(text => text && !/^[:;,.|–—-]+$/.test(text))
      .join('\n')
      .replace(/^(?:altre condizioni|note finali|condizioni finali|condizioni generali|esclusioni)\s*:?\s*/i, '').trim();
  }

  const lines = [];
  for (const item of remaining) {
    let rawDescription = removeBulletPrefix(item).replace(/^Vuotoe\s+pulizia\b/i, 'Vuoto e pulizia');
    const parsed = amountAtEnd(rawDescription);
    rawDescription = removeBulletPrefix(parsed.desc).replace(/^\d+[.)\-]\s*/, '').trim();
    const quantityMatches = [...rawDescription.matchAll(/\b[Nn]\s*(?:\.|°|º|:)?\s*(\d+(?:[,.]\d+)?)\b/g)];
    const quantityMatch = quantityMatches.length === 1 ? quantityMatches[0] : null;
    const quantity = quantityMatch ? quantityMatch[1].replace(',', '.') : '';
    if (quantityMatch) rawDescription = rawDescription.slice(0, quantityMatch.index) + ' ' + rawDescription.slice(quantityMatch.index + quantityMatch[0].length);
    rawDescription = rawDescription.replace(/\s{2,}/g, ' ').trim();
    const desc = rawDescription.replace(/^[-–—:;,]+\s*/, '').trim();
    if (/^[:;,.|–—-]+$/.test(desc)) continue;
    if (!desc || sectionHeading.test(desc) || workBandPattern.test(desc) || isMoneySummaryLine(desc) || isHeaderCompanyLine(desc) || isClientMetaLabel(desc) || /^(?:ARTICOLO|IMPORTO|DESCRIZIONE|PREZZO|Q\.?T[AÀ])$/i.test(desc)) continue;
    lines.push({ desc, quantity: quantity || '', amount: parsed.amount });
  }
  if (!lines.length) lines.push({ desc: '', amount: null });
  return { title, subtitle, intro, closing, lines };
}

export function parseQuoteText(rawText, fileName, db = {}, options = {}) {
  const all = String(rawText || '').replace(/\u00a0/g, ' ').replace(/[\r\f]/g, '\n').replace(/[\t ]+/g, ' ').trim();
  const lines = all.split('\n').map(normalizeText).filter(Boolean);
  const layoutLines = Array.isArray(options?.layoutLines) ? options.layoutLines : [];
  const hasLayout = layoutLines.length > 0;
  const textForFields = hasLayout ? [...layoutLines].sort((a,b) => Number(a.page||1)-Number(b.page||1) || Number(a.yNorm??a.y??0)-Number(b.yNorm??b.y??0)) : lines;
  const firstPage = hasLayout ? textForFields.filter(line => Number(line.page || 1) === 1) : lines;
  const tableIndex = findTableStart(firstPage);
  const contentStartIndex = findContentStart(firstPage, tableIndex);
  const fieldBoundary = contentStartIndex >= 0 ? contentStartIndex : tableIndex;
  const beforeBody = fieldBoundary >= 0 ? firstPage.slice(0, fieldBoundary) : firstPage;
  const joinedBeforeBody = beforeBody.map(lineText).join('\n');

  let number = parseNumber(beforeBody, joinedBeforeBody || all, fileName);
  const dateSource = beforeBody.map(lineText).join('\n');
  let dateRaw = (dateSource.match(/(?:data(?:\s+di\s+emissione)?|emesso\s+il|data\s+preventivo|del)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})/i)?.[1]) ||
    (dateSource.match(datePattern)?.[1]) || '';
  const explicitClientMatch = dateSource.match(/(?:cliente|spett\.?le|spettabile|destinatario|committente|ragione sociale)\s*[:\-]?\s*([^\n]{2,100})/i);
  let client = (explicitClientMatch?.[1] || '').replace(/\s+P\s*\d{1,5}(?:[./-]\s*|\s+)\d{2,4}\b.*$/i, '').trim();
  let tax = dateSource.match(/(?:P\.?\s*IVA|codice fiscale|\bC\.?F\.?\b)\s*[:\-]?\s*([A-Z0-9]{8,16})/i)?.[1] || '';
  let address = dateSource.match(/(?:indirizzo|sede|residenza)\s*[:\-]?\s*([^\n]+)/i)?.[1]?.trim() || '';
  let place = dateSource.match(/(?:localit[aà]|citt[aà]|luogo)\s*[:\-]?\s*([^\n]+)/i)?.[1]?.trim() || '';
  let payment = detectPayment(beforeBody, -1);
  let bodyLines;
  let positionWarnings = [];

  if (!hasLayout) {
    // Il modello aziendale non contiene necessariamente l'etichetta “Cliente”: la ragione
    // sociale è nella colonna sinistra, poco sopra la riga ARTICOLO/IMPORTO. In testo DOCX
    // usiamo soltanto la parte bassa della testata, escludendo i dati aziendali iniziali.
    const headerStrings = beforeBody.map(lineText);
    const lowerWindowStart = Math.max(0, headerStrings.length - 11);
    const candidates = headerStrings.map((text, index) => ({ text, index })).filter(({ text, index }) => {
      if (index < lowerWindowStart || text.length < 3 || text.length > 110) return false;
      if (isHeaderCompanyLine(text) || isClientMetaLabel(text) || /^(?:P\s*\d|data\b|settore\b|totale\b|iva\b|imponibile\b|articolo\b|importo\b)/i.test(text)) return false;
      if (datePattern.test(text) || /\b(?:termini|pagamento|acconto|saldo|\d{1,3}\s*%)\b/i.test(text)) return false;
      return !/^\d[\d .,/()-]*$/.test(text);
    });
    let detectedClientIndex = -1;
    if (!client && candidates.length) {
      client = candidates[0].text.replace(/^(?:cliente|spett\.?le|spettabile|destinatario|committente|ragione sociale)\s*[:\-]?\s*/i, '')
        .replace(/\s+P\s*\d{1,5}(?:[./-]\s*|\s+)\d{2,4}\b.*$/i, '').trim();
      detectedClientIndex = candidates[0].index;
    } else if (client) {
      detectedClientIndex = headerStrings.findIndex(text => text.toLocaleLowerCase('it-IT').includes(client.toLocaleLowerCase('it-IT')));
    }
    // Evita di copiare per errore la P. IVA CHIARADIA IMPIANTI nell'anagrafica cliente.
    const clientTail = detectedClientIndex >= 0 ? headerStrings.slice(detectedClientIndex + 1) : [];
    const clientTaxLine = clientTail.find(text => /(?:P\.?\s*IVA|codice fiscale|\bC\.?F\.?\b)/i.test(text));
    if (clientTaxLine) tax = clientTaxLine.match(/(?:P\.?\s*IVA|codice fiscale|\bC\.?F\.?\b)\s*[:\-]?\s*([A-Z0-9]{8,16})/i)?.[1] || '';
    else tax = '';
    if (detectedClientIndex >= 0) {
      const clientArea = headerStrings.slice(detectedClientIndex + 1);
      const labelledClientAddress = clientArea.map(text => text.match(/^(?:indirizzo(?:\s+cliente)?|sede(?:\s+(?:legale|operativa))?|residenza)\s*[:\-]\s*(.+)$/i)?.[1]?.trim()).find(Boolean) || '';
      const labelledClientPlace = clientArea.map(text => text.match(/^(?:localit[aà]|citt[aà]|luogo)\s*[:\-]\s*(.+)$/i)?.[1]?.trim()).find(Boolean) || '';
      const addressCandidates = clientArea.filter(text => text.length > 2 && !isHeaderCompanyLine(text) && !isClientMetaLabel(text) && !datePattern.test(text) && !/(?:P\.?\s*IVA|codice fiscale|\bC\.?F\.?\b)/i.test(text) && !(/\b(?:termini|pagamento|acconto|saldo)\b|\d{1,3}\s*%/i).test(text) && !/^(?:P\s*\d|articolo|importo)/i.test(text));
      const postalPlace = addressCandidates.find(isPostalPlace) || '';
      address = labelledClientAddress || addressCandidates.find(isStreetAddress) || '';
      const siteNotes = addressCandidates.filter(text => text !== postalPlace && !isStreetAddress(text) && !isHeaderCompanyLine(text));
      place = labelledClientPlace || [ ...siteNotes, postalPlace ].filter(Boolean).join(' · ');
    }
  }

  if (hasLayout) {
    const layoutFields = parseLayoutFields(layoutLines, all, db, fileName);
    client = layoutFields.client || '';
    number = layoutFields.number || number;
    dateRaw = layoutFields.dateRaw || dateRaw;
    const parsedLayoutTax = layoutFields.tax;
    tax = parsedLayoutTax || '';
    address = layoutFields.address || '';
    place = layoutFields.place || '';
    payment = layoutFields.payment || payment;
    bodyLines = layoutFields.bodyLines;
    if (layoutFields.tableIndex < 0 && layoutFields.bodyStartIndex < 0) positionWarnings.push('Non è stato riconosciuto un punto di inizio affidabile del corpo del documento. Controlla la separazione delle voci.');
  } else {
    bodyLines = bodyStringsFromText(lines);
  }

  const structured = extractStructuredBody(bodyLines, db);
  const bodyText = structured.lines.map(line => line.desc).join(' ');
  const summary = parseSummary(all, lines, db);
  // In PDF posizionali i valori economici della testata/footer non devono mai entrare nelle descrizioni.
  let total = summary.net ?? summary.total;
  if (total === null) {
    const sum = structured.lines.reduce((acc, line) => acc + (line.amount || 0), 0);
    total = sum > 0 ? Math.round((sum + Number.EPSILON) * 100) / 100 : 0;
  }
  const category = categoryFromText(`${structured.title}\n${structured.subtitle}`) || categoryFromText(bodyText) || 'Impianto elettrico';
  const vatRate = Number(summary.vatRate ?? db?.settings?.defaultVat ?? 10);
  const paymentFinal = payment || '';
  const formatWarning = /\.doc$/i.test(fileName) ? 'Il formato DOC tradizionale è binario e l’estrazione è euristica: controlla tutte le voci, l’ordine e gli importi. Se possibile, apri il file in Word e salvalo come DOCX.' : '';
  const warnings = [
    formatWarning,
    options?.ocrUsed && 'Il testo è stato riconosciuto da una scansione tramite OCR: controlla con attenzione numero, data, termini, descrizioni e importi.',
    options?.ocrWarning && String(options.ocrWarning),
    !client && 'Cliente non riconosciuto con sufficiente sicurezza: inseriscilo manualmente nell’anteprima.',
    !number && 'Numero di preventivo non riconosciuto: controlla la testata.',
    !parseDate(dateRaw) && 'Data di emissione non riconosciuta: verifica la data proposta.',
    !structured.lines.some(line => line.desc) && 'Nessuna voce descrittiva riconosciuta: controlla il testo estratto.',
    total === 0 && 'Imponibile non riconosciuto: controlla il riepilogo economico e inserisci il valore corretto.',
    ...positionWarnings,
  ].filter(Boolean);
  return {
    fileName, rawText: all, number, date: (hasLayout ? parseLayoutFields(layoutLines, all, db, fileName).date : '') || parseDate(dateRaw) || todayISO(), dateRaw,
    client, tax, address, place, payment: paymentFinal, vatRate, category, total: Math.max(0, Number(total) || 0),
    title: structured.title, subtitle: structured.subtitle, intro: structured.intro, closing: structured.closing,
    lines: structured.lines, warnings,
  };
}

// Esportato per test mirati senza dipendenze browser.
export { euroNumber, parseDate, extractStructuredBody };
