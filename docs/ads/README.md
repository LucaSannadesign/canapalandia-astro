# Advertising Manager — Canapalandia

Sistema proprietario per gli spazi pubblicitari. **Stato di consegna: implementato, testato, INATTIVO.**
Nessuna campagna reale esiste, nessun banner è visibile, nessuna migrazione è stata applicata.

> Pevgrow è un **potenziale** inserzionista: l'offerta non è approvata e non esiste alcuna prenotazione.
> Le sue condizioni proposte sono usate solo come scenario nei test, con dati sintetici
> (codici `synth-`, domini `*.example.test`) e senza nome, logo o creatività del brand.

## 1. Architettura

```
Articolo (blog/[slug].astro)
  └─ <AdSlot slug position="article_end">      ADS_ENABLED !== "true" → nessun markup, nessuna query
       └─ getServableAd()                        filtro dominio: active + periodo + checklist + creatività approvata + allowlist
            └─ AdsRepository (Supabase, service_role, solo server)

Browser ──beacon──▶ POST /api/ads/event/              impressione visibile ≥50% per ≥1 s
Browser ──clic────▶ GET  /api/ads/click/:placement/   registra + 302 verso la destinazione APPROVATA salvata nel DB
Admin  ──Bearer──▶ /api/ads/admin/*                   API JSON minime (nessuna dashboard)
```

| File | Ruolo |
|---|---|
| `supabase/migrations/20261103120000_ads_manager.sql` | schema, vincoli, trigger, RLS (non applicata) |
| `supabase/migrations/20261103120000_ads_manager.down.sql` | rollback (distruttivo, solo con autorizzazione) |
| `src/lib/ads/types.ts` | modello dati |
| `src/lib/ads/config.ts` | interruttore `ADS_ENABLED`, lettura env |
| `src/lib/ads/campaigns.ts` | validazione bozze, disponibilità/esclusività, checklist, transizioni, idoneità |
| `src/lib/ads/destination.ts` | allowlist destinazioni, percorsi immagine |
| `src/lib/ads/tracking.ts` | filtro bot/prefetch, hash pseudonimo, deduplica |
| `src/lib/ads/reports.ts` | report settimanale/conclusivo, CSV |
| `src/lib/ads/handlers.ts` | logica degli endpoint (indipendente da Astro, testabile) |
| `src/lib/ads/http.ts` | risposte, body limitato, auth admin a tempo costante |
| `src/lib/ads/supabaseRepository.ts` | accesso dati Supabase |
| `src/components/AdSlot.astro` | slot di fine articolo |
| `src/pages/api/ads/**` | route sottili verso `handlers.ts` |

Nessuna nuova dipendenza, nessun servizio esterno, nessun cookie.

## 2. Schema del database

| Tabella | Contenuto | Note |
|---|---|---|
| `ads_advertisers` | anagrafica, contatti, sito, `allowed_domains`, `negotiation_status` (`prospect` → `confirmed` …), `is_synthetic` | storico campagne via `ads_campaigns.advertiser_id` |
| `ads_positions` | catalogo posizioni | unico seed: `article_end` (configurazione tecnica) |
| `ads_campaigns` | codice, inserzionista, `contract_type`, `price_cents`, `starts_on`/`ends_on` (giorni Europe/Rome inclusi), `status`, checklist di attivazione | `auto_renew` vietato; `shared_rotation` bloccato in bozza; `scheduled/active` impossibili senza checklist completa o con dati sintetici |
| `ads_creatives` | `creative_key`, immagine self-hosted `/ads/…`, testi, `destination_url` https, revisione e landing | immutabili dopo l'approvazione della campagna; i posizionamenti si collegano per `creative_key`, mai per ordine di inserimento |
| `ads_placements` | articolo × posizione × periodo, `is_blocking` | **vincolo `EXCLUDE` (btree_gist)**: due campagne bloccanti non possono occupare lo stesso articolo/posizione in date sovrapposte |
| `ads_events` | impressioni/clic grezzi, `visitor_hash`, `is_bot`, `is_duplicate`, `is_unverified`, `is_eligible` | grezzi 35 giorni, pseudonimo 2 giorni |
| `ads_daily_stats` | aggregati giornalieri persistenti | alimentata da `ads_purge_events()` |
| `ads_campaign_daily_stats` (vista) | aggregati + grezzi non consolidati | fonte dei report |
| `ads_audit_log` | chi ha fatto cosa e quando | scritto nella stessa transazione della modifica |

Stati campagna: `draft → pending_approval → approved → scheduled → active ⇄ paused → completed`,
più `cancelled` / `rejected`. Occupano lo spazio solo `approved`, `scheduled`, `active`, `paused`.

Permessi: RLS attiva su tutte le tabelle senza policy, `revoke all` per `anon` e `authenticated`;
accesso solo da `service_role` lato server. Tutte le funzioni hanno `search_path` fisso e sono eseguibili solo da `service_role`.

### Operazioni amministrative atomiche

Ogni scrittura amministrativa è una funzione SQL unica (RPC): **modifica e riga di audit nella stessa transazione**,
o entrambe o nessuna. Non esiste un percorso applicativo che scriva senza audit.

| RPC | Garanzie |
|---|---|
| `ads_admin_create_advertiser` / `ads_admin_update_advertiser` | whitelist dei campi (`code` e `is_synthetic` immutabili), audit con stato di trattativa prima/dopo |
| `ads_admin_create_campaign` | campagna + creatività + posizionamenti collegati per `creative_key` + audit; qualsiasi errore → nessun residuo |
| `ads_admin_update_campaign` | whitelist (stato e checklist), **concorrenza ottimistica** su `updated_at` (una lettura superata → 409), vincoli e trigger nella stessa transazione |
| `ads_admin_review_creative` | whitelist dei campi di revisione + audit |

`actor` è obbligatorio (2-80 caratteri) in ogni RPC.

## 3. Configurazione

| Variabile | Default | Effetto |
|---|---|---|
| `ADS_ENABLED` | assente = spento | Solo la stringa esatta `true` accende gli annunci. Qualsiasi altro valore: nessun banner, endpoint pubblici 404, **anche con campagne `active` nel DB**. |
| `ADS_ADMIN_TOKEN` | assente | Token Bearer per `/api/ads/admin/*` (≥ 32 caratteri). Assente o corto: l'area admin risponde 404. |
| `ADS_HASH_SECRET` | assente | Secret HMAC per pseudonimo e token di visualizzazione (≥ 32 caratteri). **Obbligatorio per erogare**: assente o corto → nessun banner (anche con `ADS_ENABLED=true`), nessuna query, endpoint pubblici 404. Un annuncio non misurabile non viene mai mostrato. |
| `ADS_DESTINATION_ALLOWLIST` | vuoto | Domini di destinazione ammessi per tutti gli inserzionisti, separati da virgola (in aggiunta a `allowed_domains`). |

Usa anche `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` già esistenti. Nessuna variabile `PUBLIC_`.
I secret si generano con `openssl rand -hex 32` e si inseriscono direttamente su Vercel, mai in chat o nel repository.

**Requisito di cache**: il token di visualizzazione è legato al lettore, quindi l'HTML degli articoli con annuncio
non deve essere messo in cache condivisa (CDN). Oggi gli articoli sono serviti con `Cache-Control: public, max-age=0,
must-revalidate` (Vercel `MISS`, Cloudflare `DYNAMIC`, verificato il 2026-11-03). Se in futuro si attivasse una cache
condivisa, le impressioni risulterebbero sottostimate (token di altri lettori rifiutati), mai gonfiate.

### Applicare lo schema (quando autorizzato)

1. Verificare la migrazione in locale: `./scripts/test-ads-migration.sh` (cluster PostgreSQL usa-e-getta, nessuna connessione remota).
2. Applicarla prima a un progetto/branch Supabase **isolato**, poi alla produzione solo con autorizzazione esplicita.
3. Non serve alcun seed commerciale.

## 4. API admin

Tutte richiedono `Authorization: Bearer $ADS_ADMIN_TOKEN` e, per le scritture, `"actor": "<nome>"` (finisce nel registro).
Funzionano anche con `ADS_ENABLED` spento: si configura senza pubblicare.

```text
# Inserzionisti
GET   /api/ads/admin/advertisers/                 # elenco
GET   /api/ads/admin/advertisers/?id=<uuid>       # dettaglio + storico campagne
POST  /api/ads/admin/advertisers/                 # {actor, code, legal_name, display_name, website_url, allowed_domains[], contact_*}
PATCH /api/ads/admin/advertisers/                 # {actor, id, negotiation_status, ...}

# Campagne
GET   /api/ads/admin/campaigns/                   # elenco
POST  /api/ads/admin/campaigns/                   # crea BOZZA con creatives[] e placements[]
GET   /api/ads/admin/campaigns/<uuid>/            # dettaglio + checklist + conflitti + diagnosi "would_serve_if_enabled"
POST  /api/ads/admin/campaigns/<uuid>/            # {actor, action: "mark" | "review_creative" | "transition", ...}

# Disponibilità e report
GET   /api/ads/admin/availability/?slug=a,b,c&position=article_end&from=2027-01-01&to=2027-03-31
GET   /api/ads/admin/report/?campaign=<uuid>&type=weekly|final&format=json|csv
```

Esempio di bozza (valori illustrativi):

```json
{
  "actor": "Luca",
  "code": "inserzionista-2027-01-fine-articolo",
  "advertiser_id": "<uuid>",
  "name": "Esclusiva fine articolo gennaio 2027",
  "price_cents": 8000,
  "starts_on": "2027-01-10",
  "ends_on": "2027-02-08",
  "creatives": [{
    "key": "main", "label": "Banner gennaio", "alt_text": "…",
    "image_path": "/ads/inserzionista/2027-01.webp", "image_width": 1200, "image_height": 300,
    "headline": "…", "cta_label": "Scopri", "destination_url": "https://www.dominio-autorizzato.example/pagina"
  }],
  "placements": [
    { "article_slug": "slug-articolo-1", "position_code": "article_end", "creative_key": "main" }
  ]
}
```

Le immagini si caricano come file statici in `public/ads/<inserzionista>/` (commit dedicato, nessun asset remoto).

## 5. Procedura di attivazione di una campagna

L'attivazione è impossibile finché ogni condizione non è soddisfatta; le regole sono applicate sia dal codice sia dal database.

| # | Passo | Come si registra | Blocchi |
|---|---|---|---|
| 1 | Conferma scritta dell'inserzionista | `PATCH advertisers` → `negotiation_status: "confirmed"`, poi `mark: "written_confirmation"` con `ref` (id email/PDF) | rifiutato se l'inserzionista non è `confirmed` |
| 2 | Dati commerciali approvati | bozza con prezzo/periodo/spazi, poi `mark: "commercial_terms"` | prezzo obbligatorio |
| 3 | Disponibilità | `GET availability`, poi `mark: "availability"` | rifiutato se esiste un conflitto |
| 4 | Creatività caricata | file in `public/ads/…` + bozza | solo `/ads/…`, dimensioni obbligatorie |
| 5 | Revisione landing page | `action: "review_creative", decision: "approved", landing_reviewed: true` | destinazione in allowlist |
| 6 | Condizioni fiscali e contrattuali | `mark: "tax_contract"` | verifica umana/esterna |
| — | Approvazione | `transition → pending_approval → approved` | passi 1-6 + nessun conflitto; da qui lo spazio è bloccato |
| 7 | Test del tracciamento (+ verifica privacy) | `mark: "tracking"` e `mark: "tracking_privacy"` | entrambe obbligatorie |
| 8 | Conferma delle date | `mark: "dates"` | — |
| 9 | Autorizzazione umana | `mark: "authorization", confirm: "AUTORIZZO <code>"` | solo su `approved`, mai su dati sintetici |
| 10 | Avvio | `transition → scheduled`, poi dal giorno di inizio `transition → active, confirm: "ATTIVA <code>"` **e** `ADS_ENABLED=true` su Vercel (redeploy) | fuori periodo o sintetica: rifiutato |

Scadenza: dal giorno dopo `ends_on` l'annuncio non viene più mostrato anche se lo stato resta `active`;
il report segnala la campagna da chiudere (`transition → completed`). Nessun rinnovo automatico.

Spegnimento d'emergenza: `ADS_ENABLED` diverso da `true` + redeploy, oppure `transition → paused`.

## 6. Tracciamento, conservazione e report

### Tracciamento

- **Token di visualizzazione**: a ogni rendering il server firma (HMAC) un token legato a posizionamento, istante
  (millisecondi) e lettore (IP + user-agent, non salvati). Il token è nel markup dello slot e nel link del clic.
- **Impressione registrata**: box visibile ≥ 50% per **1 s continuo** con la scheda in primo piano (IntersectionObserver +
  Page Visibility). Il conteggio si azzera se il box esce dal viewport, se la scheda va in background o su `pagehide`;
  un solo timer attivo, al massimo un beacon per pagina. Senza JS non viene contata: è un minimo verificabile.
- **Beacon rifiutati senza registrazione (403)**: token mancante, malformato, falsificato, di un altro lettore o
  posizionamento, più giovane di 1 s, più vecchio di 30 min o emesso nel futuro; richieste `Sec-Fetch-Site` cross-site.
- **Clic registrato**: passaggio dal redirect server-side; destinazione letta dal DB e ricontrollata sull'allowlist
  (nessun open redirect, i parametri della richiesta sono ignorati). Senza token valido (o con token > 4 h) il lettore
  viene comunque reindirizzato, ma il clic è `is_unverified` e non idoneo.
- **Evento idoneo**: esclusi user-agent automatizzati, prefetch/prerender, clic non verificati e ripetizioni dello stesso
  visitatore pseudonimo entro 30 min (impressioni) o 10 min (clic).
- **CTR** = clic idonei / impressioni idonee, solo se le impressioni idonee sono > 0.
- **Clic unici: non misurati.** Un HMAC giornaliero non è una metodologia affidabile di unicità.
- **Campagna mai avviata**: tutte le metriche sono `not_measured` (null), mai zero.
- Rate limit: 60 eventi/minuto per IP (per istanza serverless), oltre → 429 senza registrazione.
- Body HTTP letti in streaming con limite effettivo (512 B eventi, 64 KB admin): oltre → lettura interrotta, 413.

**Cosa il server NON può verificare** (limiti dichiarati anche nei report):

- che una persona abbia effettivamente guardato il box: la visibilità è riportata dal browser;
- un client che esegue il JavaScript della pagina (anche un browser headless o uno script che scarica la pagina e
  attende 1 s) può produrre un beacon formalmente valido: il token impedisce eventi fabbricati senza aver ricevuto la
  pagina, ma non distingue un umano da un automatismo che la riceve davvero;
- traffico distribuito su molti IP/user-agent (proxy residenziali): ogni identità ottiene token validi propri;
- blocchi pubblicitari e chiusure rapide: riducono le impressioni (sottostima, mai sovrastima).

### Conservazione e cancellazione

| Dato | Conservazione | Meccanismo |
|---|---|---|
| Eventi grezzi (`ads_events`) | 35 giorni (min 7, max 400) | `ads_purge_events`: consolida in `ads_daily_stats` e cancella, in una transazione |
| Pseudonimo `visitor_hash` | 2 giorni (la deduplica usa ≤ 30 min) | `ads_purge_events`: azzera il campo sugli eventi più vecchi |
| Aggregati giornalieri | durata del rapporto commerciale + obblighi fiscali | nessun dato personale; termine da definire con la verifica fiscale (EXTERNAL_CHECK_REQUIRED) |
| Registro decisioni | come sopra | contiene il nome dell'operatore, non dati dei lettori |

Richieste di cancellazione dei lettori: lo pseudonimo non è collegabile a una persona né tra giorni diversi e viene
rimosso dopo 2 giorni; nessun altro dato dei lettori è conservato.

**Nessuna schedulazione è attiva.** Esecuzione manuale con lo script (dry-run per impostazione predefinita):

```bash
# sola lettura: cosa verrebbe cancellato
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ads-retention.mjs
# esecuzione (host locale)
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ads-retention.mjs --execute
# esecuzione su un progetto remoto: SOLO con autorizzazione e ref esplicito
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… node scripts/ads-retention.mjs --execute --allow-remote=<ref>
```

Le variabili non vengono lette da file `.env`. Una schedulazione futura (cron Vercel, GitHub Actions o `pg_cron` con
`select public.ads_purge_events(35, 2);` una volta al giorno) richiede una decisione esplicita: **HUMAN_GATE_REQUIRED**.
La funzione è idempotente e può essere rieseguita senza alterare gli aggregati.

### Report

Report settimanale: blocchi di 7 giorni dall'inizio contrattuale, fino alla data corrente.
Report conclusivo: tutto il periodo, marcato `provisional` finché la campagna non è conclusa. Entrambi in JSON o CSV
(CSV con BOM UTF-8 e protezione da formula injection), con metodologia, limiti e avvisi inclusi.

## 7. Test

```bash
npm test                          # unitari, integrazione, sicurezza, script client (node --test, nessuna rete)
./scripts/test-ads-migration.sh   # migrazione, vincoli, RPC atomiche, conservazione, permessi, rollback (PostgreSQL usa-e-getta)
```

### Collaudo su Supabase locale (Docker)

Esegue il repository Supabase reale, PostgREST, RLS con i ruoli `anon`/`service_role`, report e rollback.
Lo script e il test rifiutano qualsiasi URL che non sia `127.0.0.1`/`localhost`.

```bash
supabase init --workdir /percorso/temporaneo
supabase start --workdir /percorso/temporaneo -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
./scripts/test-ads-supabase-local.sh /percorso/temporaneo
supabase db advisors --workdir /percorso/temporaneo --type all   # con la migrazione applicata
supabase stop --workdir /percorso/temporaneo --no-backup
```

Esito dopo l'hardening (2026-11-03, Supabase CLI 3.0.0, Postgres 17.11): 3/3 test di integrazione via PostgREST,
script di conservazione (dry-run, esecuzione locale, rifiuto remoto), 54/54 asserzioni SQL sull'immagine Supabase,
`db lint` senza errori, advisors senza WARN (restano solo INFO attesi: indici non ancora usati su DB vuoto e RLS senza
policy, intenzionale). Rollback completo: 0 tabelle e 0 funzioni `ads_` residue.

## 8. Rischi aperti

- **EXTERNAL_CHECK_REQUIRED — privacy**: il tracciamento usa un identificativo pseudonimo (dato personale ai sensi GDPR). Base giuridica, informativa (privacy/cookie policy) e necessità di consenso vanno verificate prima di attivare; per questo `tracking_privacy` è un passo obbligatorio.
- **EXTERNAL_CHECK_REQUIRED — fiscale/contrattuale e categoria merceologica**: fatturazione, contratto, obblighi di trasparenza della pubblicità e limiti sui prodotti a base di canapa non sono verificati dal sistema.
- **Nessun ambiente Supabase remoto isolato per Canapalandia**: il collaudo reale è stato fatto su stack Supabase locale. Prima dell'attivazione la migrazione va applicata al progetto Supabase effettivamente usato da Canapalandia (account da identificare, vedi `docs/ops/configuration-map.md`), idealmente prima su un suo branch o progetto di staging.
- **Rate limit in memoria**: per istanza serverless, non globale. Mitigazione, non garanzia.
- **Eventi artificiali da client reali**: il token blocca beacon fabbricati senza la pagina, ma non un automatismo che scarica davvero la pagina ed esegue il JavaScript (vedi §6, "Cosa il server NON può verificare"). Il filtro bot è euristico.
- **Cache dell'HTML**: il token presuppone HTML non condiviso tra lettori (vero oggi); una cache CDN futura causerebbe sottostima.
- **Token admin unico condiviso**: `actor` è dichiarativo. Sufficiente per un solo operatore; per più persone servirà un'autenticazione per utente.
- **Concorrenza nella deduplica**: due richieste simultanee dello stesso visitatore possono non riconoscersi come duplicate (impatto marginale sui conteggi idonei). Le scritture admin invece sono protette da concorrenza ottimistica.
- **Conservazione non schedulata**: finché non viene approvato un job, la purge va eseguita manualmente.
