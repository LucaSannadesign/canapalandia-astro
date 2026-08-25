# Distribuzione social Canapalandia

## Obiettivo

Separare quattro concetti che prima erano confusi:

1. **contenuto pubblicato sul sito**;
2. **contenuto disponibile nei feed per Make**;
3. **post realmente pubblicato sulla piattaforma social**;
4. **memoria editoriale necessaria per decidere se e quando un contenuto può tornare in rotazione**.

Le fonti di verità operative sono:

- `Calendario` = stato del contenuto;
- `Diario distribuzione` = singoli eventi di pubblicazione;
- `Canapalandia Evergreen` = memoria aggregata del contenuto e prossima eleggibilità.

## Stati del Diario

- `Pianificato`: evento previsto ma non ancora pronto.
- `In coda`: evento pronto per essere processato.
- `Feed pronto`: il feed espone correttamente il contenuto, ma non abbiamo ancora conferma della piattaforma.
- `Pubblicato`: la piattaforma ha restituito un ID/URL di post valido.
- `Da verificare`: evento storico o ambiguo in HOLD; non deve essere ripubblicato automaticamente.
- `Errore`: tentativo fallito; compilare `ultimo_errore` e incrementare `tentativi`.
- `Saltato`: evento volontariamente non distribuito.
- `Archiviato`: evento chiuso e non più operativo.

## Feed di lancio

Endpoint:

`/social-queue-feed.json`

Espone gli eventi di lancio Facebook/Instagram eleggibili negli ultimi **14 giorni**, fino a 100 eventi. La finestra iniziale è volutamente prudente: permette di recuperare interruzioni brevi senza ripescare in massa vecchi post durante la migrazione.

Ogni evento contiene:

- `eventId` stabile;
- `channel`;
- `variant`;
- `copy`;
- `canonicalUrl`;
- `url` con UTM;
- `image`;
- `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`;
- `publishDate` e `notBefore`.

L'`eventId` è la chiave di idempotenza. Lo stesso evento non deve essere pubblicato due volte.

## Pool evergreen / autopilot

Endpoint:

`/social-evergreen-candidates.json`

Espone tutti i contenuti con `socialEvergreen: true` pubblicati negli ultimi sei mesi. Non decide da solo quale post pubblicare: fornisce a Make il **pool candidato** con una policy editoriale già calcolata.

Per ogni candidato restituisce:

- `contentKey`;
- titolo, descrizione, canonical e asset;
- `contentClass`;
- `autopilotState`;
- `eligibleForAutomaticRepost`;
- `freshnessDays`;
- `cooldownDays`;
- `maxRepostsSixMonths`;
- `requiresFreshnessCheck`;
- `allowedAngles`;
- `basePriorityScore`.

### Classi contenuto

#### `evergreen-safe`

Contenuti relativamente stabili nel tempo, per esempio canapa industriale, materiali, agronomia, cultura, guide non normative.

Policy iniziale:

- finestra massima: 180 giorni;
- cooldown stesso contenuto: 21 giorni;
- massimo 3 rilanci in 6 mesi;
- controllo freschezza automatico (`AUTO`);
- angoli disponibili: `insight`, `question`, `checklist`, `myth`.

#### `evergreen-review`

Contenuti che possono restare utili ma devono essere verificati prima del riuso, per esempio normativa, salute, CBD/alimentazione, ricerca e cannabis medica.

Policy iniziale:

- finestra massima: 60 giorni;
- cooldown: 30 giorni;
- massimo 2 rilanci in 6 mesi;
- `freshness_check=OK` obbligatorio nel registro Evergreen;
- angoli disponibili: `context`, `question`, `checklist`.

#### `news-temporal`

Notizie, attualità e dati fortemente temporali.

Policy iniziale:

- non entrano nel fallback evergreen lungo;
- `max_reposts_6m = 0`;
- possono essere rilanciate soltanto come evento editoriale esplicito, non dal pilota automatico.

## Registro Canapalandia Evergreen

Il foglio `Canapalandia Evergreen` contiene la memoria aggregata per contenuto:

- `active`;
- `content_id`;
- `content_key`;
- `title`;
- `canonical_url`;
- `image_url` / `instagram_image_url`;
- `category`;
- `content_class`;
- `freshness_check`;
- `freshness_days`;
- `cooldown_days`;
- `max_reposts_6m`;
- `next_eligible_at`;
- `last_published_at`;
- `times_published`;
- `last_channel`;
- `last_angle`;
- `performance_score`;
- `priority_score`;
- `status`;
- `notes`;
- `updated_at`.

Il Diario conserva i singoli eventi; il registro Evergreen conserva lo stato cumulativo. Non duplicare la logica aggregata nel Diario.

## Strategia autopilot

Ordine di priorità dello scenario:

1. eventi `launch` o `follow-up` già pronti;
2. eventi manuali/editoriali pianificati;
3. solo se non esiste nulla ai punti 1-2, fallback autopilot;
4. il fallback sceglie un contenuto dal registro Evergreen.

Un candidato autopilot è utilizzabile solo se:

- `active = TRUE`;
- `status` non è bloccato;
- `next_eligible_at <= now` oppure è vuoto al primo utilizzo;
- `times_published < max_reposts_6m`;
- `content_class != news-temporal`;
- per `evergreen-review`, `freshness_check = OK`;
- non esiste già un evento equivalente in `In coda`, `Feed pronto`, `Da verificare` o `Pubblicato`.

### Priorità

La selezione non deve usare “articolo più recente” come unico criterio.

La priorità finale deve favorire:

- più tempo trascorso dall'ultimo utilizzo;
- meno rilanci già effettuati;
- buona performance storica;
- equilibrio tra categorie;
- alternanza del canale;
- rispetto del cooldown.

E deve penalizzare:

- stessa categoria dello slot precedente;
- stesso angolo del rilancio precedente;
- contenuti già usati molte volte;
- contenuti vicini alla scadenza di freschezza.

Il `basePriorityScore` del feed è solo un punto di partenza. Il punteggio definitivo è calcolato nello scenario usando lo storico del registro Evergreen.

## Social autonomo senza nuovo articolo

Quando non esiste un nuovo articolo, il sistema non deve limitarsi a ripubblicare lo stesso link con lo stesso testo.

Per ogni contenuto madre può creare varianti editoriali:

- `insight`: un dato o concetto centrale;
- `question`: una domanda alla community;
- `checklist`: 3-5 punti sintetici;
- `myth`: un mito da correggere;
- `context`: contesto prudente per temi sensibili.

Ogni evento deve registrare nel Diario:

- `content_class`;
- `content_angle`;
- `distribution_origin=autopilot`;
- `freshness_check_at_publish`;
- `priority_score_snapshot`.

Il copy del rilancio deve essere diverso dal launch e, quando il formato lo consente, può funzionare anche senza link diretto. Il contenuto madre resta comunque tracciato tramite `content_id` / `contentKey`.

## Feed legacy

Gli endpoint esistenti restano compatibili durante la migrazione:

- `/social-feed.json` → Facebook;
- `/social-instagram-feed.json` → Instagram;
- `/social-repost-feed.json` → evergreen legacy.

I primi due continuano temporaneamente a restituire un solo item per non rompere gli scenari Make esistenti. Il feed evergreen legacy non deve diventare la fonte di verità del nuovo autopilot.

## Copy per canale

Il frontmatter supporta:

```yaml
facebookCopy: "..."
instagramCopy: "..."
socialCampaign: "nome_campagna"
```

Se i campi non sono presenti, i feed usano `description` come fallback. Gli hashtag vengono aggiunti separatamente dal formatter già esistente.

Il Calendario editoriale contiene gli equivalenti `copy_facebook`, `copy_instagram` e `social_campaign`.

## Flusso Make consigliato

### A. Nuovi contenuti

1. HTTP GET su `/social-queue-feed.json`.
2. Iterator sugli eventi.
3. Cerca `eventId` nel `Diario distribuzione`.
4. Se l'evento esiste con stato `Pubblicato`, `Da verificare`, `Saltato` o `Archiviato`, interrompi quel ramo.
5. Se l'evento non esiste, crea una riga con stato `In coda`.
6. Pubblica sul canale indicato.
7. In caso di successo registra `Pubblicato`, `pubblicato_at`, `post_url`, `external_id`, `tentativi` e `ultimo_aggiornamento`.
8. In caso di errore registra `Errore`, `ultimo_errore`, `tentativi + 1` e `ultimo_aggiornamento`.

### B. Fallback autonomo

Se non ci sono eventi nuovi processabili:

1. leggi `/social-evergreen-candidates.json`;
2. sincronizza/aggiorna il registro `Canapalandia Evergreen` per `contentKey`;
3. filtra i candidati secondo le regole di eleggibilità;
4. calcola la priorità finale usando storico, cooldown, categoria e performance;
5. seleziona un solo contenuto per slot;
6. scegli un `content_angle` diverso dal precedente;
7. genera/adatta il copy per il canale;
8. crea un nuovo evento nel Diario, per esempio `DIST-<CONTENT>-FB-EV2`;
9. pubblica;
10. in caso di successo aggiorna sia il Diario sia il registro Evergreen (`last_published_at`, `times_published`, `last_channel`, `last_angle`, `next_eligible_at`).

Durante la migrazione, gli eventi storici di cui non è possibile dimostrare l'esito sulla piattaforma devono essere registrati come `Da verificare`, non come `In coda`.

## Regola editoriale

Una news fuori piano non può chiudere il ciclo senza:

- riga nel `Calendario`;
- almeno un evento nel `Diario distribuzione`;
- URL canonica definitiva;
- stato di pubblicazione social distinto dal semplice flag `socialShare`/`instagramShare`.

Un contenuto in autopilot non può essere pubblicato senza lasciare traccia sia nel Diario sia nel registro Evergreen.
