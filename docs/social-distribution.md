# Distribuzione social Canapalandia

## Obiettivo

Separare tre concetti che prima erano confusi:

1. **contenuto pubblicato sul sito**;
2. **contenuto disponibile nel feed per Make**;
3. **post realmente pubblicato sulla piattaforma social**.

La fonte di verità operativa per il punto 3 è il tab **Diario distribuzione** del file `Canapalandia – Calendario editoriale AI`.

## Stati del Diario

- `Pianificato`: evento previsto ma non ancora pronto.
- `In coda`: evento pronto per essere processato.
- `Feed pronto`: il feed espone correttamente il contenuto, ma non abbiamo ancora conferma della piattaforma.
- `Pubblicato`: la piattaforma ha restituito un ID/URL di post valido.
- `Da verificare`: evento storico o ambiguo in HOLD; non deve essere ripubblicato automaticamente.
- `Errore`: tentativo fallito; compilare `ultimo_errore` e incrementare `tentativi`.
- `Saltato`: evento volontariamente non distribuito.
- `Archiviato`: evento chiuso e non più operativo.

## Nuovo feed di coda

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

## Feed legacy

Gli endpoint esistenti restano compatibili:

- `/social-feed.json` → Facebook;
- `/social-instagram-feed.json` → Instagram;
- `/social-repost-feed.json` → evergreen.

I primi due continuano temporaneamente a restituire un solo item per non rompere gli scenari Make esistenti, ma ora includono `eventId`, URL canonica, UTM e copy per canale.

## Copy per canale

Il frontmatter supporta ora:

```yaml
facebookCopy: "..."
instagramCopy: "..."
socialCampaign: "nome_campagna"
```

Se i campi non sono presenti, i feed usano `description` come fallback. Gli hashtag vengono aggiunti separatamente dal formatter già esistente.

Il Calendario editoriale contiene gli equivalenti `copy_facebook`, `copy_instagram` e `social_campaign`.

## Flusso Make consigliato

1. HTTP GET su `/social-queue-feed.json`.
2. Iterator sugli eventi.
3. Cerca `eventId` nel tab `Diario distribuzione`.
4. Se l'evento esiste con stato `Pubblicato`, `Da verificare`, `Saltato` o `Archiviato`, interrompi quel ramo: non pubblicare automaticamente.
5. Se l'evento non esiste, crea una riga con stato `In coda` e prosegui.
6. Se esiste con stato `In coda`, può essere processato. Un evento `Errore` può essere ritentato solo secondo la policy di retry definita nello scenario.
7. Pubblica sul canale indicato.
8. In caso di successo, salva:
   - `stato = Pubblicato`;
   - `pubblicato_at`;
   - `post_url`;
   - `external_id`;
   - `tentativi`;
   - `ultimo_aggiornamento`.
9. In caso di errore, salva:
   - `stato = Errore`;
   - `ultimo_errore`;
   - `tentativi + 1`;
   - `ultimo_aggiornamento`.

Durante la migrazione, gli eventi storici di cui non è possibile dimostrare l'esito sulla piattaforma devono essere registrati come `Da verificare`, non come `In coda`.

## Evergreen

Un evergreen non deve usare un `eventId` fisso nel feed, perché lo stesso contenuto può essere rilanciato più volte. Ogni rilancio viene creato nel Diario come evento autonomo, per esempio:

- `DIST-CAN260828-FB-EV1`
- `DIST-CAN260828-FB-EV2`

Il feed `/social-repost-feed.json` fornisce quindi un `contentKey`, non un evento definitivo. La rotazione e la prossima data di pubblicazione devono essere governate dal Diario/registro evergreen, non dal semplice ordine per data dell'articolo.

## Regola editoriale

Una news fuori piano non può chiudere il ciclo senza:

- riga nel `Calendario`;
- almeno un evento nel `Diario distribuzione`;
- URL canonica definitiva;
- stato di pubblicazione social distinto dal semplice flag `socialShare`/`instagramShare`.
