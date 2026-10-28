import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AirVent, ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, BookOpen,
  Building2, Check, CheckCircle2, CircleHelp, Cloud,
  CloudOff, Copy, Download, FilePlus2, FileText, Filter, Home, KeyRound, LogOut,
  Mail, MoreHorizontal, Pencil, Plus, Printer, RefreshCw, Search, Settings,
  ShieldCheck, Trash2, UserRound, Users, Wrench, X, Zap
} from 'lucide-react';
import { supabase } from './lib/supabase.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

import { CATEGORIES, DEFAULT_SETTINGS, defaultDb, normalizeDb, calcTotal, money, formatDate, todayISO, quoteNumber, newDraft, escapeName } from './lib/domain.js';
import { parseQuoteText } from './lib/importQuote.js';

const LOGO_URL = './logo-chiaradia.png';

async function extractDocumentText(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'pdf') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const content = await page.getTextContent(); let line = ''; let previousY = null; const pageLines = []; for (const item of content.items) { if (!('str' in item)) continue; const y = item.transform?.[5]; if (previousY !== null && y !== previousY) { pageLines.push(line); line = ''; } line += `${line ? ' ' : ''}${item.str}`; previousY = y; } if (line) pageLines.push(line); pages.push(pageLines.join('\n')); }
    const text = pages.join('\n'); if (!text.trim()) throw new Error('Il PDF non contiene testo selezionabile. Sembra una scansione: serve OCR o un PDF con testo.'); return text;
  }
  if (ext === 'docx') { const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }); if (!result.value.trim()) throw new Error('Il documento Word non contiene testo leggibile.'); return result.value; }
  if (ext === 'doc') {
    const buffer = await file.arrayBuffer(); const bytes = new Uint8Array(buffer); const binary = new TextDecoder('windows-1252').decode(bytes); const utf16 = new TextDecoder('utf-16le').decode(bytes); const printable = (s) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '\n').replace(/[ ]{2,}/g, ' ').split('\n').map(x => x.trim()).filter(x => x.length > 3 && /[a-zà-ÿ]{3}/i.test(x)).join('\n'); const extracted = [printable(utf16), printable(binary)].sort((a,b) => b.length-a.length)[0]; if (extracted.length < 30) throw new Error('Questo DOC binario non è stato letto in modo affidabile. Aprilo in Word e salvalo come DOCX, quindi importalo di nuovo.'); return extracted;
  }
  if (ext === 'txt') return await file.text();
  throw new Error('Formato non supportato. Usa PDF, DOC, DOCX oppure TXT.');
}

function withTimeout(promise, ms = 12000, message = 'La richiesta è scaduta. Controlla la connessione e la configurazione Supabase.') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}
function Brand({ compact = false }) {
  return <div className={`brand-lockup ${compact ? 'brand-lockup-compact' : ''}`}>
    <div className="brand-mark"><img src={LOGO_URL} alt="" /></div>
    <div className="brand-wording"><strong>PREVENTIVI<span>PRO</span></strong><small>CHIARADIA IMPIANTI</small></div>
  </div>;
}

function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      if (mode === 'signup') {
        const result = await withTimeout(supabase.auth.signUp({ email: email.trim(), password }), 12000);
        if (result.error) throw result.error;
        setMessageType('success');
        setMessage(result.data.session
          ? 'Account creato. Sto aprendo l’app…'
          : 'Account creato. Se la conferma e-mail è attiva, apri il messaggio ricevuto e conferma l’indirizzo, poi accedi.');
        if (result.data.session?.user) window.dispatchEvent(new CustomEvent('preventivi:authenticated', { detail: result.data.session.user }));
        else setMode('login');
      } else {
        const result = await withTimeout(supabase.auth.signInWithPassword({ email: email.trim(), password }), 12000,
          'Supabase non risponde entro 12 secondi. Controlla la connessione, il progetto e le impostazioni di autenticazione.');
        if (result.error) throw result.error;
        setMessageType('success'); setMessage('Accesso verificato. Caricamento dei tuoi preventivi…');
        window.dispatchEvent(new CustomEvent('preventivi:authenticated', { detail: result.data.user }));
      }
    } catch (error) {
      console.error('Autenticazione Supabase:', error);
      setMessageType('error');
      const raw = error?.message || 'Accesso non riuscito. Riprova.';
      setMessage(raw.includes('Invalid login credentials') ? 'E-mail o password non corretti.'
        : raw.includes('Email not confirmed') ? 'Devi prima confermare l’indirizzo e-mail dal messaggio ricevuto da Supabase.'
        : raw.includes('Failed to fetch') ? 'Impossibile raggiungere Supabase. Verifica URL, chiave pubblicabile, connessione e rete.'
        : raw);
    } finally { setBusy(false); }
  };

  const resetPassword = async () => {
    if (!email.trim()) { setMessageType('error'); setMessage('Inserisci prima l’indirizzo e-mail.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await withTimeout(supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.href }), 12000);
      if (error) throw error;
      setMessageType('success'); setMessage('Se l’indirizzo è registrato, riceverai un link per reimpostare la password.');
    } catch (error) { setMessageType('error'); setMessage(error.message || 'Impossibile inviare il link.'); }
    finally { setBusy(false); }
  };

  return <div className="auth-page">
    <div className="auth-ambient auth-ambient-one" /><div className="auth-ambient auth-ambient-two" />
    <main className="auth-card">
      <div className="auth-top"><Brand /><span className="secure-pill"><ShieldCheck size={14} /> Area riservata</span></div>
      <div className="auth-title"><div className="auth-kicker">GESTIONE PROFESSIONALE</div><h1>{mode === 'signup' ? 'Crea il tuo account' : 'Bentornato'}</h1><p>{mode === 'signup' ? 'Crea l’accesso per sincronizzare preventivi, clienti e catalogo.' : 'Accedi per ritrovare preventivi e clienti su tutti i tuoi dispositivi.'}</p></div>
      <form onSubmit={submit} className="auth-form">
        <label htmlFor="auth-email">E-mail</label>
        <div className="input-icon-wrap"><Mail size={18} /><input id="auth-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@azienda.it" /></div>
        <label htmlFor="auth-password">Password</label>
        <div className="input-icon-wrap"><KeyRound size={18} /><input id="auth-password" type="password" required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Almeno 6 caratteri" /></div>
        {mode === 'login' && <button className="text-button forgot-button" type="button" onClick={resetPassword} disabled={busy}>Password dimenticata?</button>}
        <button className="button button-primary button-wide auth-submit" type="submit" disabled={busy}>{busy ? <><span className="spinner" /> {mode === 'signup' ? 'Creazione account…' : 'Accesso in corso…'}</> : <>{mode === 'signup' ? 'Crea account' : 'Accedi'} <ArrowRight size={17} /></>}</button>
      </form>
      {message && <div className={`message message-${messageType}`} role="status">{message}</div>}
      <div className="auth-switch">{mode === 'signup' ? 'Hai già un account?' : 'Non hai ancora un account?'} <button type="button" className="text-button" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setMessage(''); }}>{mode === 'signup' ? 'Accedi' : 'Registrati'}</button></div>
      <div className="auth-foot"><ShieldCheck size={15} /> Connessione protetta · Sincronizzazione tramite Supabase</div>
    </main>
    <div className="auth-bottom">PREVENTIVI PRO <span>·</span> CHIARADIA IMPIANTI</div>
  </div>;
}

function PasswordRecoveryScreen({ onComplete }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 6) { setMessage('La password deve contenere almeno 6 caratteri.'); return; }
    if (password !== confirmPassword) { setMessage('Le due password non coincidono.'); return; }
    setBusy(true); setMessage('');
    try {
      const result = await withTimeout(supabase.auth.updateUser({ password }), 12000,
        'La richiesta è scaduta. Richiedi un nuovo link e riprova.');
      if (result.error) throw result.error;
      setMessageType('success');
      setMessage('Password aggiornata. Sto riaprendo il tuo spazio cloud…');
      await onComplete();
    } catch (error) {
      setMessageType('error');
      setMessage(error?.message || 'Non è stato possibile aggiornare la password. Richiedi un nuovo link.');
    } finally { setBusy(false); }
  };

  return <div className="auth-page"><div className="auth-card">
    <div className="auth-top"><Brand /><span className="secure-pill"><ShieldCheck size={14} /> Recupero account</span></div>
    <div className="auth-title"><div className="auth-kicker">SICUREZZA ACCOUNT</div><h1>Imposta una nuova password</h1><p>Scegli una nuova password per il tuo account Preventivi Pro.</p></div>
    <form onSubmit={submit} className="auth-form">
      <label htmlFor="recovery-password">Nuova password</label>
      <div className="input-icon-wrap"><KeyRound size={18} /><input id="recovery-password" type="password" required minLength={6} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
      <label htmlFor="recovery-confirm">Conferma password</label>
      <div className="input-icon-wrap"><KeyRound size={18} /><input id="recovery-confirm" type="password" required minLength={6} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
      <button className="button button-primary button-wide auth-submit" type="submit" disabled={busy}>{busy ? <><span className="spinner" /> Salvataggio…</> : <>Aggiorna password <ArrowRight size={17} /></>}</button>
    </form>
    {message && <div className={`message message-${messageType}`} role="status">{message}</div>}
  </div></div>;
}

function DatabaseUnavailable({ email, message, onRetry, onLogout, retrying }) {
  return <div className="auth-page"><main className="auth-card database-error-card">
    <div className="auth-top"><Brand /><span className="secure-pill"><CloudOff size={14} /> Database non disponibile</span></div>
    <div className="auth-title"><div className="auth-kicker">ACCESSO VERIFICATO</div><h1>Collegamento al cloud non riuscito</h1><p>L’account {email ? <strong>{email}</strong> : 'autenticato'} è valido, ma l’app non può aprire i dati perché il database non ha risposto correttamente.</p></div>
    <div className="message message-error" role="alert">{message || 'Verifica che la tabella preventivi_workspace esista nel progetto Supabase corretto e che le policy RLS siano attive.'}</div>
    <p className="database-error-note">Per evitare di mostrare dati incompleti o fingere un salvataggio, l’area di lavoro rimane bloccata finché il collegamento cloud non torna operativo.</p>
    <div className="database-error-actions"><button className="button button-primary button-wide" type="button" onClick={onRetry} disabled={retrying}>{retrying ? <><span className="spinner" /> Verifica in corso…</> : <><RefreshCw size={16} /> Riprova collegamento</>}</button><button className="button button-secondary button-wide" type="button" onClick={onLogout}>Esci dall’account</button></div>
  </main></div>;
}

function EmptyState({ icon: Icon = FileText, title, text, action, onAction }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={24} /></span><strong>{title}</strong><p>{text}</p>{action && <button className="button button-primary" onClick={onAction}><Plus size={16} /> {action}</button>}</div>;
}

function QuoteDocument({ draft, settings }) {
  const sums = calcTotal(draft);
  const logoSrc = settings.logoData || LOGO_URL;
  return <article className="quote-document" id="quote-document">
    <header className="quote-doc-header">
      <div className="quote-company">
        <div className="company-name">{settings.name || DEFAULT_SETTINGS.name}</div>
        <div>{settings.contact || DEFAULT_SETTINGS.contact}</div>
        <div>{settings.address || DEFAULT_SETTINGS.address}</div>
        <div>{settings.city || DEFAULT_SETTINGS.city}</div>
        <div>P. IVA {settings.vat || DEFAULT_SETTINGS.vat}</div>
        {settings.pec && <div>PEC: {settings.pec}</div>}
        {settings.phone && <div>Cell: {settings.phone}</div>}
        {settings.email && <div>E-mail: <span className="doc-email">{settings.email}</span></div>}
      </div>
      <div className="quote-logo-wrap"><img src={logoSrc} alt="Logo Chiaradia Impianti" className="quote-logo" /></div>
    </header>
    <div className="quote-blue-rule" />
    <section className="quote-recipient-meta">
      <div className="quote-recipient">
        <strong>{draft.client || 'NOME CLIENTE'}</strong>
        {draft.address && <div>{draft.address}</div>}
        {draft.tax && <div>{draft.tax}</div>}
        {draft.place && <div>{draft.place}</div>}
      </div>
      <div className="quote-reference">
        <strong className="quote-number">{draft.number || 'P —'}</strong>
        <div><span>Data:</span><strong>{formatDate(draft.date)}</strong></div>
        <div className="payment-line"><span>Termini:</span><strong>{(draft.payment || '').split('\n').map((part, i) => <React.Fragment key={i}>{i > 0 && <br />}{part}</React.Fragment>)}</strong></div>
      </div>
    </section>
    <div className="quote-table-header"><span>ARTICOLO</span><span>IMPORTO</span></div>
    <section className="quote-description-body">
      <div className="quote-title-text">{draft.title || 'Preventivo per fornitura e posa in opera'}</div>
      {draft.subtitle && <div className="quote-subtitle-text">{draft.subtitle}</div>}
      {draft.intro && <p className="quote-intro">{draft.intro}</p>}
      {draft.lines?.some(line => line.desc?.trim()) && <ul className="quote-bullets">{draft.lines.filter(line => line.desc?.trim()).map(line => <li key={line.id}><span>{line.desc}</span>{line.amount !== null && line.amount !== undefined && line.amount !== '' && <strong className="imported-line-amount">{money(line.amount)}</strong>}</li>)}</ul>}
      {draft.closing && <p className="quote-closing">{draft.closing}</p>}
    </section>
    <footer className="quote-doc-footer">
      <div className="quote-signatures"><div>Data</div><div>Firma</div></div>
      <div className="quote-totals">
        <div className="quote-total-row"><span>Totale imponibile:</span><strong>{money(sums.net)}</strong></div>
        <div className="quote-total-row"><span>IVA ({Number(draft.vatRate) || 0}%):</span><strong>{money(sums.vat)}</strong></div>
        <div className="quote-total-row quote-grand-total"><span>Totale:</span><strong>{money(sums.total)}</strong></div>
      </div>
    </footer>
  </article>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [ready, setReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [db, setDb] = useState(defaultDb);
  const [view, setView] = useState('home');
  const [draft, setDraft] = useState(null);
  const [syncState, setSyncState] = useState('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [toast, setToast] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogFilter, setCatalogFilter] = useState('Tutti');
  const [clientSearch, setClientSearch] = useState('');
  const [quoteImport, setQuoteImport] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const cloudTimer = useRef(null);
  const toastTimer = useRef(null);
  const savingRef = useRef(false);
  const syncPendingRef = useRef(false);
  const lineDragTimer = useRef(null);
  const lineDragRef = useRef(null);
  const [draggingLineId, setDraggingLineId] = useState(null);
  const latestDbRef = useRef(db);
  latestDbRef.current = db;

  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  const hydrateUser = useCallback(async (nextUser) => {
    setBooting(false); setReady(false); setCloudReady(false); setUser(nextUser);
    setSyncState('loading'); setSyncMessage('Recupero dei dati dal database cloud…');
    try {
      const result = await withTimeout(
        supabase.from('preventivi_workspace').select('data').eq('user_id', nextUser.id).maybeSingle(),
        12000,
        'Accesso riuscito, ma il database non risponde entro 12 secondi.'
      );
      if (result.error) throw result.error;
      if (result.data?.data && typeof result.data.data === 'object') {
        setDb(normalizeDb(result.data.data));
        setSyncState('synced'); setSyncMessage('Dati caricati dal database cloud');
      } else {
        // A new account receives a cloud workspace, only after the upsert is confirmed.
        const seed = defaultDb();
        const resultSave = await withTimeout(supabase.from('preventivi_workspace').upsert({
          user_id: nextUser.id, data: seed, updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' }), 12000, 'Non è stato possibile inizializzare il workspace cloud.');
        if (resultSave.error) throw resultSave.error;
        setDb(seed);
        setSyncState('synced'); setSyncMessage('Database cloud inizializzato');
      }
      setCloudReady(true);
    } catch (error) {
      console.error('Caricamento database cloud:', error);
      setDb(defaultDb());
      setCloudReady(false);
      setSyncState('error');
      setSyncMessage(error.message || 'Database cloud non raggiungibile. Verifica configurazione, tabella e policy RLS.');
    } finally {
      setReady(true); setView('home'); setDraft(null); setBooting(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && alive) setPasswordRecovery(true);
      if (event === 'SIGNED_OUT' && alive) {
        setUser(null); setReady(false); setCloudReady(false); setBooting(false); setPasswordRecovery(false); setView('home'); setDraft(null); setSyncState('idle');
      }
    });
    (async () => {
      try {
        const result = await withTimeout(supabase.auth.getSession(), 12000, 'Verifica sessione scaduta. Ricarica la pagina.');
        if (!alive) return;
        if (result.error) throw result.error;
        if (result.data.session?.user) await hydrateUser(result.data.session.user);
        else { setBooting(false); setReady(false); }
      } catch (error) {
        if (alive) { console.error('Sessione Supabase:', error); setBooting(false); setSyncMessage(error.message || 'Impossibile verificare la sessione.'); }
      }
    })();
    const onAuthenticated = (event) => { if (alive && event.detail) hydrateUser(event.detail); };
    window.addEventListener('preventivi:authenticated', onAuthenticated);
    return () => { alive = false; authListener.subscription.unsubscribe(); window.removeEventListener('preventivi:authenticated', onAuthenticated); clearTimeout(cloudTimer.current); clearTimeout(toastTimer.current); };
  }, [hydrateUser]);

  // Il database cloud è la fonte primaria. Le scritture vengono accodate per non perdere
  // l'ultima modifica se una richiesta precedente è ancora in corso.
  useEffect(() => {
    if (!ready || !cloudReady || !user) return;
    clearTimeout(cloudTimer.current);
    cloudTimer.current = setTimeout(async () => {
      if (savingRef.current) {
        syncPendingRef.current = true;
        return;
      }
      savingRef.current = true;
      let lastSavedSnapshot = null;
      try {
        do {
          syncPendingRef.current = false;
          const snapshot = latestDbRef.current;
          setSyncState('saving'); setSyncMessage('Salvataggio sul database cloud…');
          const result = await withTimeout(supabase.from('preventivi_workspace').upsert({
            user_id: user.id, data: snapshot, updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' }), 12000, 'Il salvataggio cloud ha superato 12 secondi.');
          if (result.error) throw result.error;
          lastSavedSnapshot = snapshot;
          // Se l'utente ha modificato i dati durante il salvataggio, scrivi anche l'ultima versione.
        } while (syncPendingRef.current || latestDbRef.current !== lastSavedSnapshot);
        setSyncState('synced'); setSyncMessage('Tutti i dati sono sincronizzati nel database cloud');
      } catch (error) {
        console.error('Salvataggio cloud:', error);
        setSyncState('error');
        setSyncMessage(`${error.message || 'Sincronizzazione non riuscita.'} Le modifiche non sono confermate nel cloud: esporta un backup prima di chiudere la pagina.`);
      } finally {
        savingRef.current = false;
        const newerSnapshotExists = Boolean(lastSavedSnapshot && latestDbRef.current !== lastSavedSnapshot);
        syncPendingRef.current = false;
        // Copre una modifica arrivata nell'ultimo istante della richiesta. In caso di errore
        // non avvia un ciclo infinito di retry: l'utente può premere Riprova.
        if (newerSnapshotExists) {
          clearTimeout(cloudTimer.current);
          cloudTimer.current = setTimeout(() => {
            if (user && cloudReady) setDb(current => ({ ...current }));
          }, 50);
        }
      }
    }, 850);
    return () => clearTimeout(cloudTimer.current);
  }, [db, ready, cloudReady, user]);

  const updateDb = useCallback((updater) => setDb(previous => {
    const next = typeof updater === 'function' ? updater(previous) : updater;
    return normalizeDb(next);
  }), []);

  const doLogout = async () => {
    setUserMenu(false);
    try { const { error } = await withTimeout(supabase.auth.signOut(), 10000); if (error) throw error; }
    catch (error) { notify(`Disconnessione: ${error.message || 'errore'}`); }
    setUser(null); setReady(false); setCloudReady(false); setSyncState('idle');
  };

  const createQuote = () => {
    setDraft(newDraft(db)); setView('editor'); setShowMobileMenu(false);
  };
  const editQuote = (quote) => {
    setDraft({ ...newDraft(db), ...quote, lines: (quote.lines || []).length ? quote.lines.map(line => ({ ...line, desc: String(line.desc || '') })) : [{ id: `l${Date.now()}`, desc: '' }] });
    setView('editor'); setShowMobileMenu(false);
  };
  const updateDraft = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const updateLine = (id, value) => setDraft(previous => ({ ...previous, lines: previous.lines.map(line => line.id === id ? { ...line, desc: value } : line) }));
  const finishLineDrag = () => {
    clearTimeout(lineDragTimer.current);
    lineDragTimer.current = null;
    lineDragRef.current = null;
    setDraggingLineId(null);
  };
  const startLineDrag = (event, id) => {
    clearTimeout(lineDragTimer.current);
    lineDragRef.current = { id, active: false };
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    lineDragTimer.current = setTimeout(() => {
      if (!lineDragRef.current || lineDragRef.current.id !== id) return;
      lineDragRef.current.active = true;
      setDraggingLineId(id);
      try { target.setPointerCapture?.(pointerId); } catch {}
    }, 450);
  };
  const moveLineDrag = (event) => {
    const drag = lineDragRef.current;
    if (!drag?.active || !draft) return;
    event.preventDefault();
    const rows = [...document.querySelectorAll('.description-line')];
    const targetRow = rows.find(row => {
      const rect = row.getBoundingClientRect();
      return event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    const targetId = targetRow?.getAttribute('data-line-id');
    if (!targetId || targetId === drag.id) return;
    const rect = targetRow.getBoundingClientRect();
    const insertAfter = event.clientY > rect.top + rect.height / 2;
    setDraft(previous => {
      const lines = [...previous.lines];
      const from = lines.findIndex(line => line.id === drag.id);
      const to = lines.findIndex(line => line.id === targetId);
      if (from < 0 || to < 0 || from === to) return previous;
      const [moved] = lines.splice(from, 1);
      let destination = to + (insertAfter ? 1 : 0);
      if (from < destination) destination -= 1;
      lines.splice(destination, 0, moved);
      return { ...previous, lines };
    });
  };
  const addLine = () => setDraft(previous => ({ ...previous, lines: [...previous.lines, { id: `l${Date.now()}${Math.random()}`, desc: '' }] }));
  const removeLine = (id) => setDraft(previous => ({ ...previous, lines: previous.lines.length > 1 ? previous.lines.filter(line => line.id !== id) : [{ id: `l${Date.now()}`, desc: '' }] }));

  const saveQuote = () => {
    if (!draft.client.trim()) { notify('Inserisci il nome del cliente prima di salvare.'); return; }
    const hasWorkDescription = draft.lines.some(line => String(line.desc || '').trim()) || String(draft.subtitle || '').trim() || (String(draft.title || '').trim() && String(draft.title).trim() !== 'Preventivo per fornitura e posa in opera di');
    if (!hasWorkDescription) { notify('Inserisci almeno una descrizione del lavoro o una specifica prima di salvare.'); return; }
    const sums = calcTotal(draft);
    const now = new Date().toISOString();
    const quote = { ...draft, id: draft.id || `q-${Date.now()}`, number: draft.number || quoteNumber(db.quotes), client: draft.client.trim(), net: sums.net,
      vatRate: sums.rate, vat: sums.vat, total: sums.total, updated: now,
      lines: draft.lines.map(line => ({ ...line, desc: line.desc.trim() })).filter(line => line.desc),
    };
    updateDb(previous => {
      const quotes = [...previous.quotes];
      const index = quotes.findIndex(q => q.id && q.id === quote.id);
      const existing = index >= 0 ? quotes[index] : null;
      const cleanSnapshot = (item) => {
        const { revisions, changeLog, ...snapshot } = item;
        return JSON.parse(JSON.stringify(snapshot));
      };
      const changedFields = existing ? [
        ['number', 'Numero'], ['date', 'Data'], ['status', 'Stato'], ['category', 'Settore'], ['client', 'Cliente'],
        ['address', 'Indirizzo'], ['tax', 'Codice fiscale / P. IVA'], ['place', 'Località'], ['title', 'Titolo'],
        ['subtitle', 'Specifiche'], ['intro', 'Testo introduttivo'], ['lines', 'Descrizioni lavori'],
        ['closing', 'Note finali'], ['net', 'Imponibile'], ['vatRate', 'Aliquota IVA'], ['payment', 'Pagamento'],
      ].filter(([key]) => JSON.stringify(existing[key] ?? null) !== JSON.stringify(quote[key] ?? null)).map(([, label]) => label) : ['Creazione preventivo'];
      const revisions = existing ? [...(Array.isArray(existing.revisions) ? existing.revisions : []), {
        id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        savedAt: existing.updated || existing.date || now,
        note: changedFields.length ? `Modifiche: ${changedFields.join(', ')}` : 'Salvataggio senza variazioni rilevate',
        snapshot: cleanSnapshot(existing),
      }].slice(-100) : [];
      const changeLog = [...(existing?.changeLog || []), {
        id: `chg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        at: now,
        action: existing ? 'Modifica salvata' : 'Preventivo creato',
        details: changedFields.length ? changedFields.join(', ') : 'Nessuna variazione rilevata',
      }].slice(-200);
      const saved = { ...quote, revisions, changeLog };
      if (index >= 0) quotes[index] = saved; else quotes.unshift(saved);
      const clients = [...previous.clients];
      const clientIndex = clients.findIndex(c => escapeName(c.name) === escapeName(saved.client));
      const client = { name: saved.client, address: saved.address || '', tax: saved.tax || '', place: saved.place || '' };
      if (clientIndex >= 0) clients[clientIndex] = client; else clients.unshift(client);
      const items = [...previous.items];
      for (const line of saved.lines) {
        if (line.desc && !items.some(item => item.cat === saved.category && escapeName(item.desc) === escapeName(line.desc))) {
          items.unshift({ id: `i-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, cat: saved.category, desc: line.desc });
        }
      }
      return { ...previous, quotes, clients, items };
    });
    setDraft(quote);
    notify('Preventivo salvato. Sincronizzazione in corso…');
  };
  const deleteQuote = (quote) => {
    if (!window.confirm(`Vuoi eliminare il preventivo ${quote.number} di ${quote.client}?`)) return;
    updateDb(previous => ({ ...previous, quotes: previous.quotes.filter(q => q.id !== quote.id) }));
    if (draft?.id === quote.id) setDraft(null);
    notify('Preventivo eliminato.');
  };
  const duplicateQuote = (quote) => {
    const copy = { ...quote, id: null, number: quoteNumber(db.quotes), date: todayISO(), status: 'Bozza', lines: (quote.lines || []).map(line => ({ ...line, id: `l${Date.now()}${Math.random()}` })) };
    setDraft(copy); setView('editor'); notify('Copia pronta da modificare.');
  };
  const saveSettings = (settings) => {
    updateDb(previous => ({ ...previous, settings: { ...DEFAULT_SETTINGS, ...settings } }));
    notify('Impostazioni aziendali salvate.');
  };
  const addCatalogItem = (category, description) => {
    const desc = description.trim();
    if (!desc) return false;
    if (db.items.some(item => item.cat === category && escapeName(item.desc) === escapeName(desc))) { notify('Questa voce è già presente nel catalogo.'); return false; }
    updateDb(previous => ({ ...previous, items: [{ id: `i-${Date.now()}`, cat: category, desc }, ...previous.items] }));
    notify('Voce aggiunta al catalogo.'); return true;
  };
  const deleteCatalogItem = (item) => updateDb(previous => ({ ...previous, items: previous.items.filter(i => i.id !== item.id) }));
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ ...db, version: 2, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = href; link.download = `preventivi-pro-backup-${todayISO()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
  const importQuoteFile = async (file) => {
    if (!file) return;
    setImportBusy(true);
    try { const rawText = await extractDocumentText(file); setQuoteImport(parseQuoteText(rawText, file.name, db)); }
    catch (error) { notify(error?.message || 'Impossibile leggere il documento.'); }
    finally { setImportBusy(false); }
  };
  const saveImportedQuote = (parsed) => {
    if (!parsed.client.trim()) { notify('Inserisci il nome del cliente prima di importare.'); return; }
    const id = `q-import-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const clientMatch = db.clients.find(c => escapeName(c.name) === escapeName(parsed.client));
    const existingSameQuote = db.quotes.some(q => String(q.number).trim().toLowerCase() === parsed.number.trim().toLowerCase() && escapeName(q.client) === escapeName(parsed.client));
    if (existingSameQuote && !window.confirm(`Esiste già un preventivo ${parsed.number} per ${parsed.client}. Vuoi importarlo comunque come nuovo documento?`)) return;
    const net = Math.max(0, Number(parsed.total) || 0);
    const quote = { ...newDraft(db), id, number: parsed.number.trim() || quoteNumber(db.quotes), date: parsed.date || todayISO(), category: parsed.category || CATEGORIES[0], status: 'Importato', client: parsed.client.trim(), address: parsed.address || clientMatch?.address || '', tax: parsed.tax || clientMatch?.tax || '', place: parsed.place || clientMatch?.place || '', title: parsed.title || 'Preventivo per fornitura e posa in opera', subtitle: parsed.subtitle || '', intro: parsed.intro || '', closing: parsed.closing || '', payment: parsed.payment || db.settings.payment, lines: (parsed.lines || []).filter(l => l.desc.trim()).map((l,i) => ({ id: `imp-${Date.now()}-${i}`, desc: l.desc.trim(), ...(l.amount !== null && l.amount !== undefined ? { amount: Number(l.amount) } : {}) })), net, vatRate: Number(parsed.vatRate ?? db.settings.defaultVat), importedFrom: parsed.fileName, importedAt: new Date().toISOString(), importRawText: parsed.rawText?.slice(0, 30000) };
    if (!quote.lines.length) quote.lines = [{ id: `imp-${Date.now()}`, desc: 'Verificare e completare le descrizioni importate' }];
    const sums = calcTotal(quote); quote.net = sums.net; quote.vat = sums.vat; quote.total = sums.total; quote.updated = new Date().toISOString();
    updateDb(previous => {
      const clients = [...previous.clients]; const ci = clients.findIndex(c => escapeName(c.name) === escapeName(quote.client));
      const nextClient = { ...(ci >= 0 ? clients[ci] : {}), name: quote.client, address: quote.address, tax: quote.tax, place: quote.place };
      if (ci >= 0) clients[ci] = nextClient; else clients.unshift(nextClient);
      const items = [...previous.items]; for (const line of quote.lines) if (!items.some(item => item.cat === quote.category && escapeName(item.desc) === escapeName(line.desc))) items.unshift({ id: `i-imp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, cat: quote.category, desc: line.desc });
      return { ...previous, quotes: [quote, ...previous.quotes], clients, items };
    });
    setQuoteImport(null); setView('history'); notify('Preventivo importato e aggiunto all’archivio senza sostituire i dati esistenti.');
  };
  const saveClient = (client, previousName) => {
    if (!client.name.trim()) { notify('Il nome del cliente è obbligatorio.'); return; }
    if (db.clients.some(c => escapeName(c.name) === escapeName(client.name) && escapeName(c.name) !== escapeName(previousName))) { notify('Esiste già un cliente con questo nome.'); return; }
    updateDb(previous => {
      const clients = [...previous.clients]; const oldIndex = clients.findIndex(c => escapeName(c.name) === escapeName(previousName));
      if (oldIndex >= 0) clients[oldIndex] = { ...clients[oldIndex], ...client, name: client.name.trim() }; else clients.unshift({ ...client, name: client.name.trim() });
      const quotes = previous.quotes.map(q => escapeName(q.client) === escapeName(previousName) ? { ...q, client: client.name.trim(), address: client.address, tax: client.tax, place: client.place } : q);
      return { ...previous, clients, quotes };
    }); setEditingClient(null); notify('Dati cliente aggiornati.');
  };
  const deleteClient = (client) => {
    const linked = db.quotes.filter(q => escapeName(q.client) === escapeName(client.name)).length;
    if (!window.confirm(`Eliminare il cliente “${client.name}” dalla rubrica?${linked ? ` I ${linked} preventivi collegati resteranno nell’archivio con il nome salvato.` : ''}`)) return;
    updateDb(previous => ({ ...previous, clients: previous.clients.filter(c => escapeName(c.name) !== escapeName(client.name)) })); notify('Cliente eliminato dalla rubrica. I preventivi non sono stati eliminati.');
  };
  const importBackup = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const isWorkspace = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          && ['quotes', 'items', 'clients'].some(key => Array.isArray(parsed[key]))
          && (parsed.settings === undefined || (parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)));
        if (!isWorkspace) throw new Error('Struttura backup non valida');
        const incoming = normalizeDb(parsed);
        if (!window.confirm('Importare il backup e sostituire i dati cloud attualmente presenti per questo account?')) return;
        updateDb(incoming); notify('Backup importato. Verrà sincronizzato nel database cloud.');
      } catch { notify('Il file selezionato non contiene un backup Preventivi Pro valido. I dati non sono stati modificati.'); }
    };
    reader.onerror = () => notify('Non è stato possibile leggere il file di backup.');
    reader.readAsText(file);
  };
  const retrySync = async () => {
    if (!user) return;
    setSyncState('saving'); setSyncMessage('Verifica connessione e sincronizzazione…');
    try {
      const result = await withTimeout(supabase.from('preventivi_workspace').upsert({ user_id: user.id, data: db, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }), 12000);
      if (result.error) throw result.error;
      setCloudReady(true); setSyncState('synced'); setSyncMessage('Tutti i dati sono sincronizzati nel database cloud'); notify('Connessione Supabase ripristinata.');
    } catch (error) { setSyncState('error'); setSyncMessage(error.message || 'Sincronizzazione non riuscita.'); notify('Impossibile sincronizzare: controlla la configurazione Supabase.'); }
  };

  const recentQuotes = useMemo(() => [...db.quotes].sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 5), [db.quotes]);
  const historyQuotes = useMemo(() => {
    const term = historySearch.toLowerCase().trim();
    return [...db.quotes].filter(q => [q.number, q.client, q.category, q.status].some(value => String(value || '').toLowerCase().includes(term)))
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  }, [db.quotes, historySearch]);
  const catalogItems = useMemo(() => db.items.filter(item => (catalogFilter === 'Tutti' || item.cat === catalogFilter) && item.desc.toLowerCase().includes(catalogSearch.toLowerCase())), [db.items, catalogFilter, catalogSearch]);
  const clientItems = useMemo(() => db.clients.filter(client => [client.name, client.address, client.tax, client.place].some(value => String(value || '').toLowerCase().includes(clientSearch.toLowerCase()))), [db.clients, clientSearch]);

  if (passwordRecovery) return <PasswordRecoveryScreen onComplete={async () => { const result = await supabase.auth.getUser(); if (result.error) throw result.error; setPasswordRecovery(false); if (result.data.user) await hydrateUser(result.data.user); }} />;
  if (booting) return <div className="app-loading"><span className="spinner spinner-dark" /><strong>Avvio di Preventivi Pro</strong><p>Verifica della sessione sicura…</p></div>;
  if (!user) return <AuthScreen />;
  if (!ready) return <div className="app-loading"><span className="spinner spinner-dark" /><strong>Caricamento dei tuoi dati</strong><p>Sto verificando il database cloud.</p></div>;
  if (!cloudReady) return <DatabaseUnavailable email={user.email} message={syncMessage} retrying={syncState === 'loading'} onRetry={() => hydrateUser(user)} onLogout={doLogout} />;

  const menu = [
    { id: 'home', label: 'Panoramica', icon: Home },
    { id: 'editor', label: 'Nuovo preventivo', icon: FilePlus2, action: createQuote },
    { id: 'history', label: 'Archivio preventivi', icon: FileText },
    { id: 'clients', label: 'Clienti', icon: Users },
    { id: 'catalog', label: 'Catalogo lavori', icon: BookOpen },
    { id: 'settings', label: 'Impostazioni', icon: Settings },
  ];
  const setPage = (id) => { setView(id); setShowMobileMenu(false); if (id !== 'editor') setDraft(null); };
  const pageTitle = ({ home: 'Panoramica', editor: draft?.id ? 'Modifica preventivo' : 'Nuovo preventivo', history: 'Archivio preventivi', clients: 'Anagrafica clienti', catalog: 'Catalogo lavori', settings: 'Impostazioni' })[view] || 'Panoramica';

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><Brand compact /></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="main-nav" aria-label="Navigazione principale">
        {menu.map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => item.action ? item.action() : setPage(item.id)}><item.icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{item.id === 'history' && db.quotes.length > 0 && <small>{db.quotes.length}</small>}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className={`sidebar-sync ${syncState === 'synced' ? 'is-good' : syncState === 'error' ? 'is-error' : ''}`}><span className="sync-dot" />{syncState === 'synced' ? 'Cloud sincronizzato' : syncState === 'error' ? 'Sincronizzazione da verificare' : syncState === 'saving' || syncState === 'loading' ? 'Sincronizzazione…' : 'Cloud in attesa'}</div>
        <div className="sidebar-user"><div className="avatar"><UserRound size={18} /></div><div className="sidebar-user-copy"><strong>Il tuo account</strong><span title={user.email}>{user.email}</span></div><button className="icon-button sidebar-menu-trigger" onClick={() => setUserMenu(!userMenu)} aria-label="Menu account"><MoreHorizontal size={18} /></button></div>
        {userMenu && <div className="account-popover"><button onClick={doLogout}><LogOut size={16} /> Esci dall’account</button></div>}
      </div>
    </aside>

    <div className="main-column">
      <header className="app-header">
        <div className="header-mobile-brand"><button className="icon-button mobile-menu-button" onClick={() => setShowMobileMenu(!showMobileMenu)} aria-label="Apri menu"><MoreHorizontal size={20} /></button><Brand compact /></div>
        <div className="breadcrumb"><span>Chiaradia Impianti</span><span className="breadcrumb-slash">/</span><strong>{pageTitle}</strong></div>
        <div className="header-actions">
          <div className={`cloud-indicator ${syncState === 'error' ? 'cloud-error' : syncState === 'synced' ? 'cloud-good' : ''}`} title={syncMessage || 'Stato sincronizzazione'}>
            {syncState === 'error' ? <CloudOff size={16} /> : syncState === 'synced' ? <Cloud size={16} /> : <RefreshCw size={15} className={syncState === 'saving' || syncState === 'loading' ? 'spin' : ''} />}
            <span>{syncState === 'error' ? 'Errore cloud' : syncState === 'synced' ? 'Sincronizzato' : syncState === 'saving' || syncState === 'loading' ? 'Salvataggio…' : 'Cloud'}</span>
          </div>
          <button className="button button-primary header-new-button" onClick={createQuote}><Plus size={17} /> Nuovo preventivo</button>
        </div>
      </header>

      {showMobileMenu && <div className="mobile-menu-overlay" onClick={() => setShowMobileMenu(false)}><div className="mobile-menu-panel" onClick={e => e.stopPropagation()}><div className="mobile-menu-head"><Brand compact /><button className="icon-button" onClick={() => setShowMobileMenu(false)}><X size={19} /></button></div>{menu.map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => item.action ? item.action() : setPage(item.id)}><item.icon size={18} /><span>{item.label}</span></button>)}<button className="nav-item logout-nav" onClick={doLogout}><LogOut size={18} /><span>Esci dall’account</span></button></div></div>}

      <main className={`page-content page-${view}`}>
        {syncState === 'error' && <div className="sync-warning"><div className="sync-warning-icon"><CloudOff size={18} /></div><div className="sync-warning-copy"><strong>Salvataggio cloud da verificare</strong><p>{syncMessage}</p></div><button className="button button-small" onClick={retrySync}><RefreshCw size={15} /> Riprova</button></div>}

        {view === 'home' && <>
          <div className="page-heading"><div><div className="eyebrow">IL TUO UFFICIO DIGITALE</div><h1>Buongiorno, Chiaradia <span className="heading-wave">✦</span></h1><p>Gestisci preventivi, clienti e descrizioni dei lavori da un unico spazio.</p></div><button className="button button-primary" onClick={createQuote}><Plus size={17} /> Crea preventivo</button></div>
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-card-top"><span>Preventivi totali</span><span className="stat-icon stat-icon-blue"><FileText size={18} /></span></div><strong>{db.quotes.length}</strong><small>Documenti archiviati</small></div>
            <div className="stat-card"><div className="stat-card-top"><span>Clienti salvati</span><span className="stat-icon stat-icon-gold"><Users size={18} /></span></div><strong>{db.clients.length}</strong><small>In rubrica</small></div>
            <div className="stat-card"><div className="stat-card-top"><span>Voci di catalogo</span><span className="stat-icon stat-icon-violet"><BookOpen size={18} /></span></div><strong>{db.items.length}</strong><small>Descrizioni riutilizzabili</small></div>
            <div className="stat-card"><div className="stat-card-top"><span>Valore preventivi</span><span className="stat-icon stat-icon-green"><Activity size={18} /></span></div><strong className="stat-money">{money(db.quotes.reduce((sum, quote) => sum + (Number(quote.total) || 0), 0))}</strong><small>Totale dei documenti salvati</small></div>
          </div>
          <div className="dashboard-grid">
            <section className="surface recent-surface"><div className="section-heading"><div><h2>Attività recente</h2><p>I preventivi aggiornati più di recente</p></div><button className="button button-secondary button-small" onClick={() => setPage('history')}>Vedi archivio <ArrowRight size={15} /></button></div>
              {recentQuotes.length === 0 ? <EmptyState icon={FileText} title="Il tuo archivio è pronto" text="Crea il primo preventivo: le bozze e i documenti salvati compariranno qui." action="Crea un preventivo" onAction={createQuote} /> : <div className="recent-list">{recentQuotes.map(q => <div className="recent-row" key={q.id}><div className="recent-doc-icon"><FileText size={18} /></div><div className="recent-main"><strong>{q.client}</strong><span>{q.number} <i>·</i> {q.category}</span></div><div className="recent-amount"><strong>{money(q.total)}</strong><span>{formatDate(q.date)}</span></div><button className="icon-button recent-open" onClick={() => editQuote(q)} aria-label={`Apri ${q.number}`}><ArrowRight size={17} /></button></div>)}</div>}
            </section>
            <section className="surface quick-surface"><div className="section-heading"><div><h2>Accessi rapidi</h2><p>Le funzioni più usate</p></div></div>
              <button className="quick-link" onClick={createQuote}><span className="quick-icon quick-blue"><FilePlus2 size={19} /></span><span><strong>Nuovo preventivo</strong><small>Crea e stampa un documento</small></span><ArrowRight size={17} /></button>
              <button className="quick-link" onClick={() => setPage('clients')}><span className="quick-icon quick-gold"><Users size={19} /></span><span><strong>Rubrica clienti</strong><small>Recupera dati già utilizzati</small></span><ArrowRight size={17} /></button>
              <button className="quick-link" onClick={() => setPage('catalog')}><span className="quick-icon quick-violet"><BookOpen size={19} /></span><span><strong>Catalogo lavori</strong><small>Riutilizza descrizioni e voci</small></span><ArrowRight size={17} /></button>
              <div className="tip-box"><span><BadgeCheck size={17} /></span><p><strong>Un unico archivio</strong><br />Quando il cloud è collegato, i preventivi si sincronizzano con gli altri dispositivi.</p></div>
            </section>
          </div>
          <section className="categories-section"><div className="section-heading"><div><h2>Settori di lavoro</h2><p>Seleziona un settore mentre prepari il documento.</p></div></div><div className="category-cards">{CATEGORIES.map((cat, index) => { const icons = [Zap, AirVent, Wrench, ShieldCheck, Activity, Building2]; const Icon = icons[index]; return <button key={cat} className="category-card" onClick={() => { const d = newDraft(db); d.category = cat; setDraft(d); setView('editor'); }}><span className={`category-icon category-tone-${index}`}><Icon size={19} /></span><span><strong>{cat}</strong><small>{db.items.filter(i => i.cat === cat).length} voci salvate</small></span><ArrowRight size={16} /></button>; })}</div></section>
        </>}

        {view === 'editor' && draft && <>
          <div className="page-heading editor-page-heading"><div><div className="eyebrow">DOCUMENTO COMMERCIALE</div><h1>{draft.id ? 'Modifica preventivo' : 'Crea un preventivo'}</h1><p>Compila i dati: l’anteprima segue le modifiche e non mostra prezzi per singola voce.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={() => setPage('history')}><ArrowLeft size={16} /> Torna all’archivio</button><button className="button button-secondary" onClick={() => window.print()}><Printer size={16} /> Stampa / PDF</button><button className="button button-primary" onClick={saveQuote}><Check size={17} /> Salva</button></div></div>
          {draft.id && (() => { const savedQuote = db.quotes.find(q => q.id === draft.id); const revisions = [...(savedQuote?.revisions || [])].reverse(); const changes = [...(savedQuote?.changeLog || [])].reverse(); return <section className="surface form-card revision-history-card"><div className="form-card-heading"><span className="form-step">↺</span><div><h2>Cronologia e ripristino</h2><p>Ogni salvataggio conserva la versione precedente e registra i campi modificati. Le ultime 100 versioni e 200 eventi sono conservati nel workspace.</p></div></div>{changes.length > 0 && <div className="revision-change-list"><h3>Modifiche registrate</h3>{changes.slice(0, 12).map(event => <div className="revision-change-row" key={event.id}><span><strong>{event.action}</strong><small>{event.details}</small></span><time>{new Date(event.at).toLocaleString('it-IT')}</time></div>)}</div>}{revisions.length > 0 ? <div className="revision-list"><h3>Versioni precedenti</h3>{revisions.map((revision, idx) => <div className="revision-row" key={revision.id || idx}><span><strong>{new Date(revision.savedAt).toLocaleString('it-IT')}</strong><small>{revision.note || 'Versione salvata'}</small></span><button type="button" className="button button-secondary button-small" onClick={() => { if (!revision.snapshot) { notify('Questa versione non contiene una copia ripristinabile.'); return; } if (!window.confirm('Caricare questa versione nell’editor? Dopo il controllo premi Salva per registrare il ripristino.')) return; setDraft({ ...newDraft(db), ...revision.snapshot, id: savedQuote.id, revisions: savedQuote.revisions || [], changeLog: savedQuote.changeLog || [], lines: (revision.snapshot.lines || []).map((line, i) => ({ ...line, id: line.id || `restore-${Date.now()}-${i}`, desc: String(line.desc || '') })) }); notify('Versione caricata nell’editor. Premi Salva per confermare il ripristino.'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Ripristina</button></div>)}</div> : <p className="revision-empty">Non ci sono ancora versioni precedenti. La cronologia si popola dal primo salvataggio successivo a una modifica.</p>}</section>; })()}
          <div className="editor-layout">
            <div className="edit-panel">
              <section className="surface form-card"><div className="form-card-heading"><span className="form-step">01</span><div><h2>Dati del documento</h2><p>Numero, settore, data e condizioni</p></div></div>
                <div className="form-grid form-grid-three"><div className="field"><label htmlFor="q-number">Numero preventivo</label><input id="q-number" value={draft.number} onChange={e => updateDraft('number', e.target.value)} placeholder="P 01.26" /></div><div className="field"><label htmlFor="q-date">Data</label><input id="q-date" type="date" value={draft.date} onChange={e => updateDraft('date', e.target.value)} /></div><div className="field"><label htmlFor="q-status">Stato</label><select id="q-status" value={draft.status} onChange={e => updateDraft('status', e.target.value)}><option>Bozza</option><option>Inviato</option><option>Accettato</option><option>Rifiutato</option></select></div></div>
                <div className="form-grid form-grid-two"><div className="field"><label htmlFor="q-category">Settore impiantistico</label><select id="q-category" value={draft.category} onChange={e => updateDraft('category', e.target.value)}>{CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}</select></div><div className="field"><label htmlFor="q-payment">Termini di pagamento</label><textarea id="q-payment" rows={2} value={draft.payment} onChange={e => updateDraft('payment', e.target.value)} placeholder="70% a conferma lavoro\n30% a completamento" /></div></div>
              </section>
              <section className="surface form-card"><div className="form-card-heading"><span className="form-step">02</span><div><h2>Dati del cliente</h2><p>Le informazioni saranno conservate nella rubrica</p></div></div>
                <div className="field"><label htmlFor="q-client">Nome / ragione sociale *</label><input id="q-client" list="client-suggestions" autoComplete="off" value={draft.client} onChange={e => { const value = e.target.value; updateDraft('client', value); const match = db.clients.find(c => escapeName(c.name) === escapeName(value)); if (match) setDraft(prev => ({ ...prev, client: value, address: match.address || '', tax: match.tax || '', place: match.place || '' })); }} placeholder="Es. Mario Rossi" /><datalist id="client-suggestions">{db.clients.map(c => <option value={c.name} key={c.name} />)}</datalist></div>
                <div className="form-grid form-grid-two"><div className="field"><label htmlFor="q-address">Indirizzo / descrizione cliente</label><input id="q-address" value={draft.address} onChange={e => updateDraft('address', e.target.value)} placeholder="Via, numero civico" /></div><div className="field"><label htmlFor="q-tax">Codice fiscale / P. IVA</label><input id="q-tax" value={draft.tax} onChange={e => updateDraft('tax', e.target.value)} placeholder="Codice fiscale o partita IVA" /></div></div>
                <div className="field"><label htmlFor="q-place">Località / nota anagrafica</label><input id="q-place" value={draft.place} onChange={e => updateDraft('place', e.target.value)} placeholder="CAP, città o riferimento" /></div>
              </section>
              <section className="surface form-card"><div className="form-card-heading"><span className="form-step">03</span><div><h2>Descrizione dei lavori</h2><p>Inserisci le attività incluse nel preventivo; i prezzi importati sono facoltativi</p></div></div>
                <div className="field"><label htmlFor="q-title">Titolo della fornitura / del lavoro</label><textarea id="q-title" rows={2} value={draft.title} onChange={e => updateDraft('title', e.target.value)} placeholder="Preventivo per fornitura e posa in opera di…" /></div>
                <div className="field"><label htmlFor="q-subtitle">Modello, quantità o specifica (facoltativo)</label><input id="q-subtitle" value={draft.subtitle} onChange={e => updateDraft('subtitle', e.target.value)} placeholder="Es. climatizzatore mono split Hisense Console 18000 BTU A++" /></div>
                <div className="field"><label htmlFor="q-intro">Testo introduttivo (facoltativo)</label><textarea id="q-intro" rows={4} maxLength={4000} value={draft.intro} onChange={e => updateDraft('intro', e.target.value)} placeholder="Si precisa quanto segue…" /></div>
                <div className="line-items-heading"><div><strong>Attività incluse</strong><span>{draft.lines.filter(line => line.desc.trim()).length} voci compilate · tieni premuta una descrizione per trascinarla</span></div><button className="button button-secondary button-small" onClick={addLine}><Plus size={15} /> Aggiungi voce</button></div>
                <div className="description-lines">{draft.lines.map((line, index) => { const options = db.items.filter(item => item.cat === draft.category); return <div className={`description-line${draggingLineId === line.id ? ' is-dragging' : ''}`} data-line-id={line.id} key={line.id}><span className="description-bullet">{index + 1}</span><div className="line-input-wrap"><textarea aria-label={`Descrizione lavoro ${index + 1}`} rows={2} list={`suggestions-${line.id}`} value={line.desc} onChange={e => updateLine(line.id, e.target.value)} onPointerDown={e => startLineDrag(e, line.id)} onPointerMove={moveLineDrag} onPointerUp={finishLineDrag} onPointerCancel={finishLineDrag} onContextMenu={e => { if (lineDragRef.current?.active) e.preventDefault(); }} placeholder="Descrivi una lavorazione o una fornitura…" /><datalist id={`suggestions-${line.id}`}>{options.map(item => <option value={item.desc} key={item.id} />)}</datalist>{options.length > 0 && <select className="insert-suggestion" aria-label="Inserisci una voce dal catalogo" value="" onChange={e => { if (e.target.value) updateLine(line.id, e.target.value); }}><option value="">Inserisci dal catalogo…</option>{options.map(item => <option value={item.desc} key={item.id}>{item.desc}</option>)}</select>}</div>{line.amount !== undefined && <div className="import-editor-line-price"><label>Prezzo €</label><input type="number" min="0" step="0.01" value={line.amount ?? ''} onChange={e=>setDraft(prev=>({...prev,lines:prev.lines.map(item=>item.id===line.id?{...item,amount:e.target.value===''?null:Number(e.target.value)}:item)}))} /></div>}<button className="icon-button remove-line" onClick={() => removeLine(line.id)} title="Rimuovi voce" aria-label="Rimuovi voce"><X size={17} /></button></div>; })}</div>
                <div className="field closing-field"><label htmlFor="q-closing">Altre condizioni / note finali</label><textarea id="q-closing" rows={3} value={draft.closing} onChange={e => updateDraft('closing', e.target.value)} placeholder="Es. escluso opere murarie, tracce e ripristini…" /></div>
              </section>
              <section className="surface form-card"><div className="form-card-heading"><span className="form-step">04</span><div><h2>Riepilogo economico</h2><p>Un solo imponibile complessivo, IVA configurabile</p></div></div>
                <div className="financial-fields"><div className="field"><label htmlFor="q-net">Totale imponibile (€)</label><div className="money-input"><span>€</span><input id="q-net" type="number" min="0" step="0.01" inputMode="decimal" value={draft.net} onChange={e => updateDraft('net', e.target.value)} placeholder="0,00" /></div></div><div className="field"><label htmlFor="q-vat">Aliquota IVA</label><div className="vat-input"><select aria-label="Aliquota IVA predefinita" value={['0','4','5','10','22'].includes(String(draft.vatRate)) ? String(draft.vatRate) : 'custom'} onChange={e => { if (e.target.value !== 'custom') updateDraft('vatRate', Number(e.target.value)); }}><option value="0">0%</option><option value="4">4%</option><option value="5">5%</option><option value="10">10%</option><option value="22">22%</option><option value="custom">Personalizzata</option></select><input type="number" min="0" max="100" step="0.1" aria-label="Aliquota IVA personalizzata percentuale" value={draft.vatRate} onChange={e => updateDraft('vatRate', e.target.value)} /></div></div></div>
                <div className="calculated-total"><div><span>Imponibile</span><strong>{money(calcTotal(draft).net)}</strong></div><div><span>IVA {Number(draft.vatRate) || 0}%</span><strong>{money(calcTotal(draft).vat)}</strong></div><div className="calculated-grand"><span>Totale documento</span><strong>{money(calcTotal(draft).total)}</strong></div></div>
              </section>
              <div className="editor-bottom-actions"><button className="button button-secondary" onClick={() => window.print()}><Printer size={17} /> Stampa / Salva PDF</button><button className="button button-primary" onClick={saveQuote}><Check size={17} /> Salva preventivo</button></div>
            </div>
            <aside className="preview-panel"><div className="preview-panel-top"><div><span className="preview-live-dot" /><strong>Anteprima documento</strong></div><button className="icon-button" onClick={() => window.print()} title="Stampa o esporta PDF" aria-label="Stampa"><Printer size={17} /></button></div><div className="preview-paper-wrap"><QuoteDocument draft={draft} settings={db.settings} /></div><div className="preview-hint"><CircleHelp size={16} /><span>L’anteprima rispecchia la stampa. Le voci importate possono includere prezzi riconosciuti dal documento.</span></div></aside>
          </div>
        </>}

        {view === 'history' && <>
          <div className="page-heading"><div><div className="eyebrow">ARCHIVIO DOCUMENTI</div><h1>Archivio preventivi</h1><p>Ritrova, modifica, duplica o stampa i documenti salvati.</p></div><div className="heading-actions"><label className="button button-secondary import-quote-label"><FilePlus2 size={17} /> {importBusy ? 'Lettura documento…' : 'Importa PDF / Word'}<input type="file" accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" disabled={importBusy} onChange={e => { importQuoteFile(e.target.files?.[0]); e.target.value = ''; }} /></label><button className="button button-primary" onClick={createQuote}><Plus size={17} /> Nuovo preventivo</button></div></div>
          <section className="surface table-surface"><div className="table-toolbar"><div className="table-count"><strong>{historyQuotes.length}</strong> <span>{historyQuotes.length === 1 ? 'preventivo' : 'preventivi'}</span></div><div className="search-field"><Search size={17} /><input value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Cerca per numero, cliente, settore…" aria-label="Cerca preventivi" /><Filter size={15} className="search-filter-icon" /></div></div>
            {historyQuotes.length === 0 ? <EmptyState icon={FileText} title={db.quotes.length ? 'Nessun risultato' : 'Ancora nessun preventivo'} text={db.quotes.length ? 'Prova a modificare la ricerca.' : 'I preventivi creati e salvati compariranno in questo archivio.'} action={db.quotes.length ? undefined : 'Crea un preventivo'} onAction={createQuote} /> : <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>Documento</th><th>Cliente</th><th>Settore</th><th>Stato</th><th className="align-right">Totale</th><th className="align-right">Azioni</th></tr></thead><tbody>{historyQuotes.map(q => <tr key={q.id}><td><button className="table-primary-text" onClick={() => editQuote(q)}>{q.number}</button><span className="table-secondary-text">{formatDate(q.date)}</span></td><td><strong className="table-client">{q.client}</strong></td><td><span className="category-pill">{q.category}</span></td><td><span className={`status-pill status-${String(q.status || 'bozza').toLowerCase()}`}>{q.status || 'Bozza'}</span></td><td className="align-right total-cell">{money(q.total)}</td><td><div className="table-actions"><button className="icon-button" title="Apri" aria-label="Apri" onClick={() => editQuote(q)}><Pencil size={16} /></button><button className="icon-button" title="Duplica" aria-label="Duplica" onClick={() => duplicateQuote(q)}><Copy size={16} /></button><button className="icon-button danger-icon" title="Elimina" aria-label="Elimina" onClick={() => deleteQuote(q)}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div>}
          </section>
        </>}

        {view === 'clients' && <>
          <div className="page-heading"><div><div className="eyebrow">ANAGRAFICA</div><h1>Clienti</h1><p>La rubrica si aggiorna quando salvi un preventivo.</p></div><button className="button button-primary" onClick={createQuote}><Plus size={17} /> Nuovo preventivo</button></div>
          <section className="surface table-surface"><div className="table-toolbar"><div className="table-count"><strong>{clientItems.length}</strong> <span>{clientItems.length === 1 ? 'cliente' : 'clienti'}</span></div><div className="search-field"><Search size={17} /><input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Cerca cliente o indirizzo…" aria-label="Cerca cliente" /></div></div>
            {clientItems.length === 0 ? <EmptyState icon={Users} title={db.clients.length ? 'Nessun cliente trovato' : 'La rubrica è vuota'} text={db.clients.length ? 'Prova a cambiare il testo della ricerca.' : 'Salva un preventivo con i dati del cliente per aggiungerlo automaticamente.'} action={db.clients.length ? undefined : 'Crea preventivo'} onAction={createQuote} /> : <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>Cliente</th><th>Indirizzo</th><th>Codice fiscale / P. IVA</th><th>Preventivi</th><th /></tr></thead><tbody>{clientItems.map(client => <tr key={client.name}><td><div className="client-name-cell"><span className="avatar avatar-small"><UserRound size={15} /></span><strong>{client.name}</strong></div></td><td>{client.address || client.place || '—'}</td><td>{client.tax || '—'}</td><td><span className="category-pill">{db.quotes.filter(q => escapeName(q.client) === escapeName(client.name)).length} documenti</span></td><td><div className="table-actions"><button className="button button-secondary button-small" onClick={() => setEditingClient({ ...client, originalName: client.name })}><Pencil size={14} /> Modifica</button><button className="icon-button danger-icon" title="Elimina cliente" aria-label="Elimina cliente" onClick={() => deleteClient(client)}><Trash2 size={16} /></button><button className="button button-secondary button-small" onClick={() => { const d = newDraft(db); d.client = client.name; d.address = client.address || ''; d.tax = client.tax || ''; d.place = client.place || ''; setDraft(d); setView('editor'); }}>Crea preventivo</button></div></td></tr>)}</tbody></table></div>}
          </section>
        </>}

        {view === 'catalog' && <>
          <div className="page-heading"><div><div className="eyebrow">LAVORI RIUTILIZZABILI</div><h1>Catalogo lavori</h1><p>Salva descrizioni che usi spesso e richiamale nei prossimi preventivi.</p></div></div>
          <CatalogManager items={catalogItems} total={db.items.length} search={catalogSearch} setSearch={setCatalogSearch} filter={catalogFilter} setFilter={setCatalogFilter} onAdd={addCatalogItem} onDelete={deleteCatalogItem} />
        </>}

        {view === 'settings' && <>
          <div className="page-heading"><div><div className="eyebrow">PERSONALIZZAZIONE</div><h1>Impostazioni</h1><p>Gestisci intestazione aziendale, IVA predefinita e copie di sicurezza.</p></div></div>
          <SettingsManager settings={db.settings} save={saveSettings} exportBackup={exportBackup} importBackup={importBackup} syncState={syncState} syncMessage={syncMessage} retrySync={retrySync} />
        </>}
      </main>
      <footer className="app-footer"><span>© {new Date().getFullYear()} Chiaradia Impianti</span><span>Preventivi Pro <i>·</i> React + Supabase</span></footer>
    </div>
    {quoteImport && <ImportQuoteModal initial={quoteImport} onClose={() => setQuoteImport(null)} onSave={saveImportedQuote} />}
    {editingClient && <ClientEditModal client={editingClient} onClose={() => setEditingClient(null)} onSave={(client) => saveClient(client, editingClient.originalName)} />}
    <nav className="mobile-bottom-nav" aria-label="Navigazione rapida"><button className={view === 'home' ? 'active' : ''} onClick={() => setPage('home')}><Home size={19} /><span>Home</span></button><button className={view === 'history' ? 'active' : ''} onClick={() => setPage('history')}><FileText size={19} /><span>Archivio</span></button><button className="mobile-create" onClick={createQuote}><Plus size={24} /><span>Nuovo</span></button><button className={view === 'clients' ? 'active' : ''} onClick={() => setPage('clients')}><Users size={19} /><span>Clienti</span></button><button className={view === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}><Settings size={19} /><span>Altro</span></button></nav>
    {toast && <div className="toast-notification" role="status"><CheckCircle2 size={18} /><span>{toast}</span><button className="icon-button" onClick={() => setToast('')} aria-label="Chiudi messaggio"><X size={15} /></button></div>}
  </div>;
}

function CatalogManager({ items, total, search, setSearch, filter, setFilter, onAdd, onDelete }) {
  const [addOpen, setAddOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const submit = (event) => { event.preventDefault(); if (onAdd(category, description)) { setDescription(''); setAddOpen(false); } };
  return <div className="catalog-layout"><section className="surface catalog-main"><div className="table-toolbar catalog-toolbar"><div className="table-count"><strong>{items.length}</strong> <span>di {total} voci</span></div><button className="button button-primary button-small" onClick={() => setAddOpen(!addOpen)}>{addOpen ? <X size={16} /> : <Plus size={16} />}{addOpen ? 'Annulla' : 'Aggiungi voce'}</button></div>
    {addOpen && <form className="catalog-add-form" onSubmit={submit}><div className="field"><label htmlFor="catalog-category">Settore</label><select id="catalog-category" value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div><div className="field"><label htmlFor="catalog-description">Descrizione</label><textarea autoFocus id="catalog-description" required rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrizione della fornitura o attività…" /></div><button className="button button-primary" type="submit"><Check size={16} /> Salva voce</button></form>}
    <div className="catalog-filters"><div className="search-field"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca nel catalogo…" aria-label="Cerca catalogo" /></div><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filtra settore"><option>Tutti</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
    {items.length === 0 ? <EmptyState icon={BookOpen} title={total ? 'Nessuna voce trovata' : 'Costruiamo il tuo catalogo'} text={total ? 'Prova a cambiare la ricerca o il settore.' : 'Aggiungi le descrizioni che utilizzi più spesso. Le nuove voci saranno suggerite durante la compilazione.'} action={total ? undefined : 'Aggiungi prima voce'} onAction={() => setAddOpen(true)} /> : <div className="catalog-list">{items.map(item => <div className="catalog-row" key={item.id}><span className="catalog-item-icon"><FileText size={17} /></span><div className="catalog-row-copy"><strong>{item.desc}</strong><span>{item.cat}</span></div><button className="icon-button danger-icon" title="Elimina voce" aria-label={`Elimina ${item.desc}`} onClick={() => { if (window.confirm('Rimuovere questa descrizione dal catalogo?')) onDelete(item); }}><Trash2 size={16} /></button></div>)}</div>}
  </section><aside className="surface catalog-side"><span className="side-illustration"><BookOpen size={24} /></span><h2>Il tuo archivio di descrizioni</h2><p>Le descrizioni salvate sono riutilizzabili nei preventivi dello stesso settore e sincronizzate sul cloud.</p><div className="catalog-side-stat"><strong>{total}</strong><span>voci totali</span></div><div className="catalog-side-stat"><strong>{CATEGORIES.length}</strong><span>settori disponibili</span></div></aside></div>;
}

function SettingsManager({ settings, save, exportBackup, importBackup, syncState, syncMessage, retrySync }) {
  const [form, setForm] = useState({ ...DEFAULT_SETTINGS, ...settings });
  const fileRef = useRef(null);
  useEffect(() => setForm({ ...DEFAULT_SETTINGS, ...settings }), [settings]);
  const field = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const uploadLogo = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 1.8 * 1024 * 1024) { alert('Scegli un’immagine più piccola di 1,8 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => field('logoData', String(reader.result));
    reader.onerror = () => alert('Impossibile leggere il file logo selezionato.');
    reader.readAsDataURL(file);
  };
  return <div className="settings-layout"><section className="surface form-card settings-main"><div className="form-card-heading"><span className="settings-heading-icon"><Building2 size={19} /></span><div><h2>Dati aziendali</h2><p>Questi dati saranno stampati nell’intestazione del preventivo.</p></div></div>
    <form onSubmit={e => { e.preventDefault(); save(form); }}><div className="settings-logo-row"><div className="settings-logo-preview"><img src={form.logoData || LOGO_URL} alt="Logo aziendale" /></div><div><strong>Logo Chiaradia Impianti</strong><p>È già impostato il logo che hai fornito. Puoi sostituirlo solo se necessario.</p><div className="inline-actions"><button type="button" className="button button-secondary button-small" onClick={() => fileRef.current?.click()}><ArrowDownToLine size={15} /> Carica logo</button>{form.logoData && <button type="button" className="text-button" onClick={() => field('logoData', '')}>Ripristina logo originale</button>}</div><input className="file-input-hidden" ref={fileRef} type="file" accept="image/*" onChange={e => { uploadLogo(e.target.files?.[0]); e.target.value = ''; }} /></div></div>
    <div className="form-grid form-grid-two"><div className="field"><label htmlFor="s-name">Ragione sociale / intestazione</label><input id="s-name" value={form.name} onChange={e => field('name', e.target.value)} /></div><div className="field"><label htmlFor="s-contact">Referente</label><input id="s-contact" value={form.contact} onChange={e => field('contact', e.target.value)} /></div></div>
    <div className="form-grid form-grid-two"><div className="field"><label htmlFor="s-address">Indirizzo</label><input id="s-address" value={form.address} onChange={e => field('address', e.target.value)} /></div><div className="field"><label htmlFor="s-city">CAP e città</label><input id="s-city" value={form.city} onChange={e => field('city', e.target.value)} /></div></div>
    <div className="form-grid form-grid-two"><div className="field"><label htmlFor="s-vat">Partita IVA</label><input id="s-vat" value={form.vat} onChange={e => field('vat', e.target.value)} /></div><div className="field"><label htmlFor="s-phone">Cellulare</label><input id="s-phone" value={form.phone} onChange={e => field('phone', e.target.value)} /></div></div>
    <div className="form-grid form-grid-two"><div className="field"><label htmlFor="s-pec">PEC</label><input id="s-pec" type="email" value={form.pec} onChange={e => field('pec', e.target.value)} /></div><div className="field"><label htmlFor="s-email">E-mail</label><input id="s-email" type="email" value={form.email} onChange={e => field('email', e.target.value)} /></div></div>
    <div className="form-grid form-grid-two"><div className="field"><label htmlFor="s-vat-default">IVA predefinita (%)</label><input id="s-vat-default" type="number" min="0" max="100" step="0.1" value={form.defaultVat} onChange={e => field('defaultVat', e.target.value)} /></div><div className="field"><label htmlFor="s-payment-default">Termini predefiniti</label><textarea id="s-payment-default" rows={2} value={form.payment} onChange={e => field('payment', e.target.value)} /></div></div>
    <div className="settings-form-footer"><button className="button button-primary" type="submit"><Check size={17} /> Salva impostazioni</button></div></form>
  </section><aside className="settings-side-stack"><section className="surface settings-side-card"><span className="side-illustration"><Cloud size={23} /></span><h2>Backup e sincronizzazione</h2><p>Il cloud salva preventivi, rubrica, catalogo e impostazioni. Puoi anche esportare una copia indipendente.</p><div className={`sync-status-block ${syncState === 'error' ? 'is-error' : syncState === 'synced' ? 'is-good' : ''}`}><span className="sync-dot" /><div><strong>{syncState === 'synced' ? 'Collegato' : syncState === 'error' ? 'Da verificare' : 'In aggiornamento'}</strong><small>{syncMessage || 'Stato della sincronizzazione'}</small></div></div><button className="button button-secondary button-wide" onClick={retrySync}><RefreshCw size={16} /> Sincronizza adesso</button></section><section className="surface settings-side-card"><span className="side-illustration side-illustration-gold"><Download size={22} /></span><h2>Backup manuale</h2><p>Scarica tutti i dati in formato JSON o ripristina un backup precedente.</p><button className="button button-secondary button-wide" onClick={exportBackup}><Download size={16} /> Esporta backup</button><BackupInput onImport={importBackup} /></section></aside></div>;
}
function ImportQuoteModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ ...initial, lines: initial.lines.map(l => ({ ...l })) , address:initial.address || '', tax:initial.tax || '', place:'', title:'Preventivo per fornitura e posa in opera', subtitle:'', intro:'', closing:'', payment:initial.payment || '70% a conferma lavoro\n30% a completamento', vatRate:initial.vatRate ?? 10 }));
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const setLine = (index, value) => setForm(prev => ({ ...prev, lines: prev.lines.map((line, i) => i === index ? { ...line, desc: value } : line) }));
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="surface import-modal" role="dialog" aria-modal="true" aria-labelledby="import-modal-title"><div className="modal-heading"><div><span className="eyebrow">IMPORTAZIONE DOCUMENTO</span><h2 id="import-modal-title">Controlla i dati riconosciuti</h2><p>Il documento originale non viene modificato. L'importazione aggiunge un nuovo preventivo, senza sostituire quelli già presenti.</p></div><button className="icon-button" onClick={onClose} aria-label="Chiudi"><X size={20}/></button></div><div className="import-file-note"><FileText size={18}/><span>{form.fileName}</span></div>{form.warnings?.length > 0 && <div className="message message-info"><strong>Verifica manuale consigliata</strong><ul>{form.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}<div className="import-form-grid"><div className="field"><label>Cliente / ragione sociale *</label><input value={form.client} onChange={e=>set('client',e.target.value)} /></div><div className="field"><label>Numero preventivo</label><input value={form.number} onChange={e=>set('number',e.target.value)} /></div><div className="field"><label>Data emissione</label><input type="date" value={form.date} onChange={e=>set('date',e.target.value)} /></div><div className="field"><label>Settore</label><select value={form.category} onChange={e=>set('category',e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div><div className="field"><label>Indirizzo cliente</label><input value={form.address} onChange={e=>set('address',e.target.value)} /></div><div className="field"><label>Codice fiscale / P. IVA</label><input value={form.tax} onChange={e=>set('tax',e.target.value)} /></div><div className="field"><label>Imponibile (€)</label><input type="number" min="0" step="0.01" value={form.total} onChange={e=>set('total',e.target.value)} /></div><div className="field"><label>IVA (%)</label><input type="number" min="0" max="100" step="0.1" value={form.vatRate} onChange={e=>set('vatRate',e.target.value)} /></div></div><div className="field"><label>Titolo del preventivo</label><textarea rows={2} value={form.title} onChange={e=>set('title',e.target.value)} /></div><div className="field"><label>Voci descrittive rilevate (correggibili)</label>{form.lines.map((line,i)=><div className="import-line-row" key={i}><textarea className="import-line-edit" rows={2} value={line.desc} onChange={e=>setLine(i,e.target.value)} placeholder={`Voce ${i+1}`} /><label className="import-line-price"><span>Prezzo (€)</span><input type="number" min="0" step="0.01" value={line.amount ?? ''} onChange={e=>setForm(prev=>({...prev,lines:prev.lines.map((item,j)=>j===i?{...item,amount:e.target.value===''?null:Number(e.target.value)}:item)}))} /></label></div>)}<button type="button" className="button button-secondary button-small" onClick={()=>set('lines',[...form.lines,{desc:'',amount:null}])}><Plus size={14}/> Aggiungi voce</button></div><details className="import-raw-details"><summary>Mostra testo estratto dal documento</summary><pre>{form.rawText}</pre></details><div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Annulla</button><button className="button button-primary" onClick={()=>onSave(form)}><Check size={16}/> Importa nell’archivio</button></div></section></div>;
}
function ClientEditModal({ client, onClose, onSave }) {
  const [form, setForm] = useState({ name:client.name || '', address:client.address || '', tax:client.tax || '', place:client.place || '' });
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="surface client-edit-modal" role="dialog" aria-modal="true" aria-labelledby="client-edit-title"><div className="modal-heading"><div><h2 id="client-edit-title">Modifica dati cliente</h2><p>Le modifiche al nome vengono riportate anche nei preventivi collegati.</p></div><button className="icon-button" onClick={onClose} aria-label="Chiudi"><X size={20}/></button></div><div className="field"><label>Nome / ragione sociale *</label><input value={form.name} onChange={e=>set('name',e.target.value)}/></div><div className="field"><label>Indirizzo</label><input value={form.address} onChange={e=>set('address',e.target.value)}/></div><div className="field"><label>Codice fiscale / P. IVA</label><input value={form.tax} onChange={e=>set('tax',e.target.value)}/></div><div className="field"><label>Località</label><input value={form.place} onChange={e=>set('place',e.target.value)}/></div><div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Annulla</button><button className="button button-primary" onClick={()=>onSave(form)}><Check size={16}/> Salva cliente</button></div></section></div>;
}

function BackupInput({ onImport }) {
  const inputRef = useRef(null);
  return <><input className="file-input-hidden" ref={inputRef} type="file" accept="application/json,.json" onChange={e => { onImport(e.target.files?.[0]); e.target.value = ''; }} /><button className="text-button import-backup-button" onClick={() => inputRef.current?.click()}>Scegli file di backup</button></>;
}
