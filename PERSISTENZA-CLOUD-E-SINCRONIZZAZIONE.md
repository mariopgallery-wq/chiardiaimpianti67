# Persistenza cloud e sincronizzazione MioUfficio / Preventivi Pro

## Obiettivo

`public.preventivi_workspace` resta la fonte ufficiale dei dati già esistenti: preventivi, clienti, catalogo, impostazioni, cestino, revisioni e bozza attiva dell'editor. Il browser non usa `localStorage`, `sessionStorage` o IndexedDB per conservare dati gestionali. Rimangono soltanto la sessione di autenticazione gestita da Supabase (necessaria per non chiedere il login a ogni apertura) e la cache PWA degli asset statici: non contengono preventivi, clienti, revisioni o altri dati di lavoro.

## Cosa cambia nel codice

- La bozza attiva dell'editor viene inclusa in `activeDraft` nel workspace e salvata automaticamente dopo le modifiche; dopo un nuovo accesso viene recuperata dal database.
- Le modifiche al workspace vengono inviate alla RPC atomica `pp_save_workspace`; non esiste più il fallback a un `upsert` non atomico.
- La scrittura usa compare-and-swap sul timestamp: due dispositivi non sovrascrivono silenziosamente una versione più recente.
- Il salvataggio automatico è più rapido e viene anticipato quando la pagina passa in background. Se ci sono modifiche non confermate, il browser avvisa prima di chiudere.
- Revisioni e change log dei preventivi non vengono più tagliati a 100/200 elementi.
- I documenti PDF/Word/TXT originali importati vengono archiviati nel bucket privato `pp-quote-files`; nel preventivo resta il riferimento al file.
- I backup JSON esportati e importati vengono archiviati nel bucket privato `pp-backups`.
- Stampa preventivo, export/import backup e modifiche a preventivi/clienti/catalogo/cestino vengono registrati in `pp_workspace_events`.
- I backup esportati e importati sono conservati anche come file JSON privati su Supabase Storage.
- RLS limita workspace, eventi e file all'utente autenticato proprietario.

## Ordine migrazioni

1. Se non è già stata applicata, eseguire `20261031010000_preventivi_pro_operativo_realtime.sql`.
2. Eseguire `20261102010000_workspace_durability_audit.sql`.
3. Verificare le funzioni `pp_save_workspace`, `pp_log_workspace_event`, tabella `pp_workspace_events`, bucket privati e publication `supabase_realtime`.
4. Solo dopo la migrazione, distribuire il codice aggiornato.

La seconda migrazione sostituisce la RPC a due parametri con una RPC a quattro parametri (gli ultimi due hanno valori predefiniti), aggiunge il registro append-only e i due bucket privati. Non cancella `preventivi_workspace` né i dati esistenti.

## Dati già esistenti e migrazione da storage locale

Nella sorgente esaminata non sono presenti scritture su `localStorage`, `sessionStorage` o IndexedDB. I dati persistenti di Preventivi Pro vengono letti e scritti in `preventivi_workspace`; la bozza dell'editor era invece soltanto in memoria e non era recuperabile dopo la chiusura della pagina. Con questo aggiornamento viene salvata nel campo `activeDraft` del workspace.

Se una versione distribuita diversa da quella esaminata avesse salvato ulteriori dati nel browser, quei dati non possono essere trasferiti senza prima identificare esattamente la chiave e lo schema usati da quella versione. Non cancellare i dati del browser prima di aver verificato tale eventuale versione.

## Limiti da conoscere

- Il PDF generato dal comando nativo `window.print()` viene registrato come evento di stampa, ma il browser non consegna il file PDF risultante all'app: per archiviare anche il PDF finale serve una successiva funzione di generazione PDF tramite blob, non il dialogo di stampa nativo.
- La sincronizzazione Realtime trasferisce le versioni salvate. Se due dispositivi modificano contemporaneamente il workspace, il confronto atomico blocca la sovrascrittura e richiede la risoluzione del conflitto; non effettua una fusione automatica campo per campo.
- Se il dispositivo è offline, il salvataggio cloud non può essere confermato. L'app non mantiene una copia locale persistente nascosta: segnala l'errore e invita a non chiudere finché il salvataggio non è completato.

## Verifiche dopo il deploy

1. Accedere con lo stesso account su due dispositivi.
2. Modificare e salvare un preventivo sul dispositivo A; verificare l'aggiornamento sul dispositivo B.
3. Modificare un campo di una bozza senza premere Salva; attendere la conferma cloud, ricaricare il dispositivo B e verificare il recupero.
4. Spostare un preventivo nel cestino e verificare cestino e registro eventi.
5. Ripristinare e poi eliminare definitivamente un elemento; verificare gli eventi.
6. Importare un PDF e verificare il riferimento al documento in Storage.
7. Esportare e reimportare un backup; verificare il bucket e il registro eventi.
8. Provare due modifiche concorrenti e verificare che venga mostrato il conflitto invece di sovrascrivere i dati.
