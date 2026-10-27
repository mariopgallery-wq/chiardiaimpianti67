# Revisione tecnica — Preventivi Pro · Chiaradia Impianti

Data revisione: 27 ottobre 2026

## Esito sintetico

Il codice sorgente è stato revisionato e corretto in più punti. I controlli automatici eseguibili senza dipendenze esterne passano: **7 test su 7** e nessun errore sintattico rilevato nei sei file JavaScript/JSX controllati. La revisione non equivale però a un collaudo end-to-end in produzione: il pacchetto npm non è stato installato in questo ambiente, quindi `vite build` non è stato completato; inoltre non è disponibile l’accesso amministrativo al progetto Supabase `nzvzoamhtmucshsrarqq` per applicare lo schema e provare login e persistenza reali.

## Problemi corretti nel pacchetto

- **Accesso:** schermata di login e registrazione tramite Supabase Auth, richiesta reset password e schermata per impostare la nuova password dopo il link di recupero.
- **Cloud come fonte primaria:** eliminato il fallback di persistenza dell’app in `localStorage`. L’area di lavoro non si apre se la lettura o inizializzazione del workspace remoto non è confermata; viene mostrato un errore esplicito con possibilità di riprovare o uscire.
- **Sincronizzazione:** salvataggi cloud accodati per gestire modifiche durante una richiesta in corso; errori di scrittura segnalati senza dichiarare i dati sincronizzati se il server non conferma.
- **Preventivi:** verifica del cliente e della descrizione prima del salvataggio; calcolo imponibile/IVA/totale arrotondato ai centesimi e limite IVA tra 0 e 100; normalizzazione più robusta dei dati legacy.
- **Backup:** importazione JSON validata prima di sostituire i dati cloud; errori di lettura segnalati; revoca dell’URL temporaneo dopo il download.
- **Logo:** gestione dell’errore di lettura del file; scelta del logo nuovamente possibile anche selezionando lo stesso file.
- **Stampa A4:** rimossa una seconda sezione di stampa CSS duplicata. Rimane una sola regola `@page` e una sola sezione `@media print`, con selettori destinati a stampare il documento del preventivo e non i comandi dell’editor.
- **Mobile:** gli input hanno una dimensione minima di 16 px per prevenire lo zoom automatico quando si mette a fuoco un campo su iOS; presenti regole responsive per la schermata di errore cloud.
- **Manutenzione:** funzioni pure del dominio estratte in `src/lib/domain.js` e copertura con test Node; workflow GitHub Actions predisposto per lanciare test e build prima del deploy.
- **Database:** script SQL con tabella workspace JSONB, RLS per utente autenticato e permessi di tabella limitati.

## File compresi nell’ispezione

| File o gruppo | Controllo |
|---|---|
| `src/App.jsx` | Flusso di autenticazione, schermata recupero password, caricamento cloud, blocco in caso di errore, editor, archivio, clienti, catalogo, impostazioni, backup e azioni di salvataggio revisionati staticamente. Sintassi: OK. |
| `src/lib/domain.js` | Funzioni pure per modello dati, numerazione, IVA, date, importi e normalizzazione; copertura di test. |
| `src/lib/supabase.js` | Configurazione client, sessione persistente e refresh token; nessuna chiave `service_role` nel frontend. |
| `src/main.jsx` | Punto d’ingresso React; sintassi: OK. |
| `src/styles.css` | Sintassi/parentesi CSS, responsive, input mobile e stampa A4; parentesi bilanciate, un solo blocco print. |
| `tests/domain.test.js` | 7 test automatici, tutti superati. |
| `SUPABASE_SETUP.sql` | Schema, chiave primaria legata a `auth.users`, RLS, policy e grant controllati staticamente; **non eseguito sul progetto remoto**. |
| `.github/workflows/deploy.yml` | YAML leggibile; job `build` e `deploy`, test prima della build e pubblicazione della cartella `dist`. |
| `package.json` | Scripts e dipendenze controllati; JSON valido. |
| `vite.config.js` | Configurazione Vite con percorsi relativi adatta a Pages sotto un percorso di repository; sintassi: OK. |
| `index.html` | Documento d’ingresso incluso nel pacchetto. |
| `.env.example` | Variabili pubbliche di configurazione documentate. |
| `README.md` | Istruzioni aggiornate per Supabase, deploy e test. |
| `public/logo-chiaradia.png` | File immagine presente; riferimento pubblico usato dall’app. |
| `public/icon-192.png`, `public/icon-512.png` | File immagine presenti. |
| `public/manifest.webmanifest` | JSON valido. |
| `public/.nojekyll` | Presente per evitare elaborazione Jekyll dei file statici. |
| `.gitignore` | Presente. |

## Controlli eseguiti

- `node --test`: **7 passati, 0 falliti**.
- Analisi sintattica via TypeScript `transpileModule` su `src/App.jsx`, `src/main.jsx`, `src/lib/supabase.js`, `src/lib/domain.js`, `vite.config.js` e `tests/domain.test.js`: **0 errori sintattici**.
- `package.json` e `public/manifest.webmanifest`: JSON valido.
- `.github/workflows/deploy.yml`: YAML parsato; job `build` e `deploy` rilevati.
- `src/styles.css`: parentesi bilanciate, 1 `@page`, 1 `@media print`.
- `npm run build`: **non eseguibile in questo ambiente**, perché `vite` non è presente e l’installazione dei pacchetti npm è fallita per errore di risoluzione DNS (`EAI_AGAIN` verso `registry.npmjs.org`). Non considero quindi la build di produzione verificata.

## Blocco di pubblicazione osservato sul repository online

Nel repository `mariopgallery-wq/chiaradiaimpianti67` ispezionato il 27 ottobre 2026, la cartella nascosta `.github/workflows/deploy.yml` non risultava presente. L’esecuzione GitHub Actions visibile aveva esito verde ma il nome/step erano quelli del workflow predefinito **“pages build and deployment” / “Build with Jekyll”**, non una compilazione React/Vite. Questo è coerente con la pagina vuota: JSX sorgente e `index.html` non costituiscono una build React pronta per il browser.

Il repository è accessibile in lettura ma la connessione GitHub attiva non dispone del permesso di scrittura; perciò non è stato possibile aggiornare direttamente il repository remoto. Nel pacchetto revisionato è incluso il workflow corretto. Per pubblicarlo:

1. Caricare nel repository tutti i file e le cartelle estratti, incluso **`.github/workflows/deploy.yml`** (alcuni caricamenti web ignorano le cartelle che iniziano con il punto).
2. In GitHub → **Settings → Pages**, selezionare **GitHub Actions** come sorgente di deploy.
3. In Actions verificare un workflow **“Deploy Preventivi Pro to GitHub Pages”** con i passi installazione dipendenze, test e `npm run build`; non basta un workflow Jekyll verde.

## Passaggi necessari per il vero collaudo cloud

1. Aprire il progetto Supabase con ref `nzvzoamhtmucshsrarqq`.
2. Nel suo SQL Editor eseguire lo script `SUPABASE_SETUP.sql` compreso in questo archivio. Non eseguire lo script su un altro progetto.
3. In Authentication abilitare il provider Email e configurare `Site URL` e `Redirect URLs` con l’URL Pages effettivo, per esempio `https://mariopgallery-wq.github.io/chiaradiaimpianti67/` dopo la pubblicazione.
4. Dopo che il workflow React/Vite ha pubblicato `dist/`, provare registrazione/login, eventuale conferma e-mail, recupero password, creazione e modifica di un preventivo, ricaricamento della pagina, persistenza in `preventivi_workspace`, catalogo, clienti, impostazioni/logo, backup JSON e stampa/PDF.
5. Verificare che ogni utente autenticato legga solo il proprio record grazie alle policy RLS.

**Conclusione:** il pacchetto contiene le correzioni e i controlli automatici sopra descritti. Non dichiaro ancora l’app “collaudata al 100%” perché per dimostrarlo servono una build Vite completata e prove reali sul progetto Supabase e sull’URL pubblicato, operazioni che questo ambiente non è riuscito a completare.
