# Preventivi Pro — Chiaradia Impianti (React)

Web app responsive per creare, salvare, stampare e sincronizzare preventivi su iPhone, Android, Windows e macOS. Il progetto è realizzato con React + Vite e Supabase Auth/Database.

## Cosa include

- Accesso e registrazione tramite Supabase (e-mail/password), richiesta di reset password e timeout per le richieste di autenticazione.
- Sincronizzazione cloud dei dati con `public.preventivi_workspace`, con Row Level Security: ogni account vede e modifica il proprio workspace.
- Database cloud come fonte primaria, con salvataggi accodati e backup manuale JSON esportabile/importabile.
- Editor con anteprima A4, logo Chiaradia Impianti fornito, intestazione aziendale, cliente, numero/data, condizioni di pagamento, descrizioni di lavorazione senza importi per riga, imponibile e IVA configurabile.
- Archivio preventivi, anagrafica clienti e catalogo delle descrizioni con sei settori impiantistici.
- Interfaccia adattiva per desktop e dispositivi mobili. Gli input mobili sono almeno 16 px per evitare lo zoom automatico di iOS quando si mette a fuoco un campo.
- Workflow GitHub Actions per creare e pubblicare il sito su GitHub Pages automaticamente a ogni push sul branch `main` o `master`.

## 1. Database Supabase

1. Apri il progetto `nzvzoamhtmucshsrarqq` nella dashboard Supabase.
2. Vai in **SQL Editor → New query**.
3. Apri `SUPABASE_SETUP.sql`, copia tutto lo script, incollalo nell’editor e premi **Run**.
4. Verifica che sia stata creata la tabella `public.preventivi_workspace`.
5. In **Authentication → Providers**, verifica che Email sia abilitato.
6. Se la conferma e-mail è attiva, l’utente deve confermare la propria e-mail prima di accedere.
7. In **Authentication → URL Configuration**, imposta il sito pubblicato come `Site URL` e aggiungi il suo URL completo in `Redirect URLs`. Per esempio, `https://TUO-UTENTE.github.io/NOME-REPOSITORY/` (sostituisci con l’indirizzo GitHub Pages reale).

### Configurazione client

I valori pubblici di URL e publishable key sono preimpostati in `src/lib/supabase.js` e ripetuti in `.env.example`. La chiave `sb_publishable_...` è una chiave pubblicabile per il client. **Non aggiungere mai chiavi `service_role` o segreti al codice frontend.** La sicurezza dei dati dipende dalle policy RLS incluse nello script SQL.

Per usare un altro progetto, imposta `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nel file `.env` locale o nei segreti/variabili usati dal processo di build, oppure cambia i valori di fallback in `src/lib/supabase.js`.

## 2. Deploy automatico su GitHub Pages

1. Crea o apri un repository GitHub dedicato all’app.
2. Apri lo ZIP ed estrai i contenuti. **La cartella `.github` deve trovarsi direttamente nella radice del repository**, non dentro una sottocartella `PreventiviPro_Chiaradia`. Carica **tutti i file e le cartelle presenti in questa directory**, inclusi `.github/workflows/deploy.yml`, `package.json`, `index.html`, `src/`, `public/` e `SUPABASE_SETUP.sql`. Carica i contenuti estratti dello ZIP, non il file ZIP dentro il repository. Attenzione: alcuni strumenti di upload nascondono le cartelle che iniziano con un punto; verifica esplicitamente che `.github/workflows/deploy.yml` sia presente nella radice del repository.
3. Usa il branch `main` (oppure `master`, già supportato dal workflow).
4. Nel repository vai in **Settings → Pages** e imposta la sorgente di pubblicazione su **GitHub Actions**. Il workflow di questo progetto compila React/Vite prima di pubblicare. Se nei log compare solo “Build with Jekyll”, il workflow di questo progetto non è stato caricato o Pages è ancora configurato sulla pubblicazione dal branch: un deploy Jekyll verde non dimostra che React sia stata compilata.
5. Apri la scheda **Actions**. Il workflow “Deploy Preventivi Pro to GitHub Pages” installa i pacchetti, crea la build React e pubblica `dist/`. Attendi che il workflow risulti verde.
6. Apri l’URL mostrato in **Settings → Pages** e aggiorna `Site URL` e `Redirect URLs` nelle impostazioni di autenticazione Supabase con quell’indirizzo esatto.
7. Prova login, apertura dell’archivio, salvataggio di un preventivo e sincronizzazione dopo aver ricaricato la pagina.

Non è necessario caricare manualmente la cartella `dist`: GitHub Actions la genera ad ogni deploy. La build usa Vite, installato automaticamente dal workflow; non devi installarlo manualmente sul tuo computer se pubblichi tramite GitHub Actions.

## 3. Esecuzione locale per sviluppo

Requisiti: Node.js 20 o superiore e npm.

```bash
npm install
npm test
npm run dev
```

Per testare la build di produzione:

```bash
npm run build
npm run preview
```

## 4. Controlli automatici

`npm test` esegue i test automatici delle funzioni di dominio: workspace predefinito, numero preventivo, calcolo imponibile/IVA/totale, normalizzazione dei dati e formattazione. Il workflow GitHub esegue i test prima della build. Questi test non sostituiscono una prova di login e salvataggio sul progetto Supabase effettivo.

## 5. Schema e sincronizzazione

La tabella cloud salva il workspace dell’utente in una colonna JSONB (`quotes`, `items`, `clients`, `settings`). Il database è la fonte primaria: l’app non apre l’area di lavoro se non riesce a leggere o inizializzare il workspace remoto. Le modifiche si sincronizzano dopo una breve pausa e le scritture successive vengono accodate per non perdere l’ultima modifica. Se un salvataggio fallisce, lo stato cloud segnala l’errore: usa **Riprova** e scarica un backup JSON prima di chiudere la pagina se ci sono modifiche non confermate.

Se compaiono errori `relation does not exist`, `permission denied`, `row-level security` o `Failed to fetch`, controlla rispettivamente: script SQL eseguito sul progetto corretto, accesso allo schema `public` via Data API, policy RLS, URL/chiave pubblicabile, rete e URL di autenticazione.

## 6. Pubblicazione e verifica

Questa cartella contiene il codice e il workflow di deploy. Il sito diventa effettivamente online solo dopo che i file sono nel repository corretto, GitHub Pages è abilitato e il workflow completa la build. Dopo il deploy è necessario verificare l’accesso con un account di prova e controllare la tabella in Supabase.
