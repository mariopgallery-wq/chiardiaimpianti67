# Verifica tecnica del pacchetto unificato

Data: 2026-10-30

## Controlli eseguiti

- `node --test`: 30 test superati, 0 falliti.
- Parsing JSX/JavaScript: nessuna diagnostica nei file `src/App.jsx`, `src/main.jsx`, `src/lib/domain.js`, `src/lib/importQuote.js` e `src/lib/supabase.js`.
- `package.json`: JSON valido; script `test`, `build`, `dev` e `preview` presenti.
- `.github/workflows/deploy.yml`: workflow manuale (`workflow_dispatch`); nessun trigger su `push`; installazione, test, build, verifica asset PDF.js e pubblicazione GitHub Pages presenti.
- Deploy manuale limitato al branch `main`; `cancel-in-progress: false` evita che un successivo avvio annulli una pubblicazione in corso.
- `src/App.jsx` passa al parser le coordinate del layout PDF/DOCX e il parser aggiornato usa `options.layoutLines`.
- Catalogo editor: menu visibile per ogni riga, alimentato da tutte le voci del workspace dell'account corrente senza filtro per categoria.
- Riordino: maniglia sul numero con pressione prolungata, cattura puntatore, rilevamento della riga di destinazione e scorciatoie da tastiera.
- Bozza: la navigazione ordinaria conserva la bozza; il comando esplicito “Torna all'archivio” la elimina senza salvare modifiche. Le azioni che aprono un altro preventivo chiedono conferma prima di sostituirla.
- Anteprima: elenco attività con marcatori puntati espliciti.
- Supabase: non sono state modificate tabelle, policy, chiavi o dati.

## Limiti della verifica

La build `npm run build` non è stata eseguita localmente: l'installazione dei pacchetti npm è andata in timeout in questo ambiente. Non dichiariamo quindi una build locale superata. Il workflow aggiornato esegue la build e verifica che il worker PDF.js Vite sia effettivamente presente negli asset prima della pubblicazione.

## Nota sul catalogo multi-account

La funzione del selettore è presente per tutti gli account. Il contenuto mostrato è quello del workspace associato all'account autenticato (`preventivi_workspace.user_id`); gli archivi privati non vengono mescolati o condivisi automaticamente. Un account senza voci nel proprio catalogo vedrà il messaggio che invita ad aggiungerle.

## Nota per il caricamento su GitHub

Estrarre lo ZIP e caricare i contenuti della cartella `chiardiaimpianti67-main/` nella radice del repository, mantenendo tutti i percorsi, inclusa `.github/workflows/deploy.yml`. Il workflow è configurato intenzionalmente senza trigger `push`: i commit e i caricamenti manuali dei singoli file non avviano build. Dopo aver terminato tutti gli aggiornamenti, avviare una sola volta **Actions → Deploy Preventivi Pro to GitHub Pages → Run workflow** sul branch `main`.

Non eseguire `SUPABASE_SETUP.sql` se il workspace Supabase è già configurato. Il file è incluso come parte del progetto originale; non è stata richiesta alcuna modifica allo schema o ai dati.
