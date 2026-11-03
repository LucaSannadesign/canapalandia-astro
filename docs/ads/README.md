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
| `ads_creatives` | immagine self-hosted `/ads/…`, testi, `destination_url` https, revisione e landing | immutabili dopo l'approvazione della campagna |
| `ads_placements` | articolo × posizione × periodo, `is_blocking` | **vincolo `EXCLUDE` (btree_gist)**: due campagne bloccanti non possono occupare lo stesso articolo/posizione in date sovrapposte |
| `ads_events` | impressioni/clic grezzi, `visitor_hash`, `is_bot`, `is_duplicate`, `is_eligible` | conservazione 35 giorni |
| `ads_daily_stats` | aggregati giornalieri persistenti | alimentata da `ads_purge_events()` |
| `ads_campaign_daily_stats` (vista) | aggregati + grezzi non consolidati | fonte dei report |
| `ads_audit_log` | chi ha fatto cosa e quando | ogni azione admin |

Stati campagna: `draft → pending_approval → approved → scheduled → active ⇄ paused → completed`,
più `cancelled` / `rejected`. Occupano lo spazio solo `approved`, `scheduled`, `active`, `paused`.

Permessi: RLS attiva su tutte le tabelle senza policy, `revoke all` per `anon` e `authenticated`;
accesso solo da `service_role` lato server.

## 3. Configurazione

| Variabile | Default | Effetto |
|---|---|---|
| `ADS_ENABLED` | assente = spento | Solo la stringa esatta `true` accende gli annunci. Qualsiasi altro valore: nessun banner, endpoint pubblici 404, **anche con campagne `active` nel DB**. |
| `ADS_ADMIN_TOKEN` | assente | Token Bearer per `/api/ads/admin/*` (≥ 32 caratteri). Assente o corto: l'area admin risponde 404. |
| `ADS_HASH_SECRET` | assente | Secret HMAC per il visitatore pseudonimo (≥ 32 caratteri). Assente: nessun evento registrato. |
| `ADS_DESTINATION_ALLOWLIST` | vuoto | Domini di destinazione ammessi per tutti gli inserzionisti, separati da virgola (in aggiunta a `allowed_domains`). |

Usa anche `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` già esistenti. Nessuna variabile `PUBLIC_`.
I secret si generano con `openssl rand -hex 32` e si inseriscono direttamente su Vercel, mai in chat o nel repository.

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

## 6. Tracciamento e report: metodologia

- **Impressione registrata**: box visibile ≥ 50% per ≥ 1 s (IntersectionObserver), inviata con `sendBeacon`. Senza JS non viene contata: è un minimo verificabile.
- **Clic registrato**: passaggio dal redirect server-side; destinazione letta dal DB e ricontrollata sull'allowlist (nessun open redirect, i parametri della richiesta sono ignorati).
- **Evento idoneo**: esclusi user-agent automatizzati, prefetch/prerender, ripetizioni dello stesso visitatore pseudonimo entro 30 min (impressioni) o 10 min (clic).
- **CTR** = clic idonei / impressioni idonee, solo se le impressioni idonee sono > 0.
- **Clic unici: non misurati.** Un HMAC giornaliero non è una metodologia affidabile di unicità.
- **Campagna mai avviata**: tutte le metriche sono `not_measured` (null), mai zero.
- Rate limit: 60 eventi/minuto per IP (per istanza serverless), oltre → 429 senza registrazione.
- Privacy: nessun cookie o storage nel browser; IP mai salvato in chiaro; hash troncato non collegabile tra giorni; grezzi cancellati dopo 35 giorni con `select ads_purge_events(35);` (da schedulare solo dopo approvazione).

Report settimanale: blocchi di 7 giorni dall'inizio contrattuale, fino alla data corrente.
Report conclusivo: tutto il periodo, marcato `provisional` finché la campagna non è conclusa. Entrambi in JSON o CSV
(CSV con BOM UTF-8 e protezione da formula injection), con metodologia, limiti e avvisi inclusi.

## 7. Test

```bash
npm test                          # unitari + integrazione + sicurezza (node --test, nessuna rete)
./scripts/test-ads-migration.sh   # migrazione, vincoli, permessi, rollback su PostgreSQL locale usa-e-getta
```

## 8. Rischi aperti

- **EXTERNAL_CHECK_REQUIRED — privacy**: il tracciamento usa un identificativo pseudonimo (dato personale ai sensi GDPR). Base giuridica, informativa (privacy/cookie policy) e necessità di consenso vanno verificate prima di attivare; per questo `tracking_privacy` è un passo obbligatorio.
- **EXTERNAL_CHECK_REQUIRED — fiscale/contrattuale e categoria merceologica**: fatturazione, contratto, obblighi di trasparenza della pubblicità e limiti sui prodotti a base di canapa non sono verificati dal sistema.
- **Repository Supabase non eseguito contro PostgREST**: lo schema è testato su PostgreSQL 17 locale e la logica su repository in memoria; le query `supabase-js` (embed con hint FK) vanno provate su un progetto Supabase isolato prima dell'attivazione.
- **Rate limit in memoria**: per istanza serverless, non globale. È una mitigazione: traffico anomalo distribuito su più istanze può essere registrato, e finisce tra gli eventi idonei solo se il filtro bot e la deduplica non lo riconoscono.
- **Filtro bot euristico**: riconosce bot dichiarati e segnali evidenti, non bot evoluti.
- **Token admin unico condiviso**: `actor` è dichiarativo. Sufficiente per un solo operatore; per più persone servirà un'autenticazione per utente.
- **Concorrenza nella deduplica**: due richieste simultanee possono non riconoscersi come duplicate (impatto marginale sui conteggi idonei).
