# Audit tecnico SEO — 2026-10-21

## Fonti

- **Search Console:** non consultata direttamente (nessuna sessione autenticata disponibile). Gli export CSV dei rapporti *Indicizzazione → Pagine* non erano presenti su Drive. Nessun conteggio GSC in questo documento è stimato.
- **Storico GSC già lavorato:** report 404 del 15/10/2026 (26 URL), chiuso con #116, #117 e #118.
- **Questo audit:** crawl della produzione (`main` @ `89ac562`, deployment Vercel `dpl_12pg1Y4…`), sitemap, link interni, export WordPress `data/wp/out` (645 URL pubblici storici).

## Stato produzione

La produzione serve `main` (`89ac562`, PR #121 integrata il 20/10). La divergenza tra `main` e produzione descritta nella PR #123 non è più presente. #123 (guardia di build, draft) e #119 (ricerca) restano aperte e non toccano i file modificati qui.

## Risultati prima/dopo

| Controllo | Produzione (prima) | Build locale (dopo) |
|---|---|---|
| URL in sitemap | 238, tutti 200 | 238, invariati |
| Canonical, noindex, hreflang, JSON-LD su URL in sitemap | 0 errori | 0 errori |
| Link interni verso 404 | 5 URL (da `/mappa-del-sito/`) + `/cdn-cgi/l/email-protection` (12 pagine) | 0 (Cloudflare non incluso, vedi sotto) |
| Link interni verso 410 | 1 (`/partner-selezionati/`) | 0 |
| Link interni verso redirect | 11 | 0 |
| URL WordPress storici in 404 | 133 su 645 | 88 su 645 |

## Correzioni

1. **`/mappa-del-sito/` linkava 5 bozze (404).** La pagina filtrava solo `draft: true` e ignorava `status: "draft"` e le date future. Ora usa `isPublishedBlogEntry`, come archivi e sitemap XML.
2. **Permalink EN storici `/en/<slug>/` in 404.** `src/pages/en/[slug].astro` ricavava la lingua da `category`, che lo schema azzera per i post `legacy-review`. Ora usa `blogEntryLanguage`. Risultato: 32 URL `/en/<slug>/` reindirizzano (301) allo stesso articolo su `/blog/<slug>/`, che resta `noindex,follow` se in revisione. Nessun articolo è stato pubblicato o modificato.
3. **Redirect 301 con destinazione equivalente** (`src/middleware.ts`):
   - pagine EN WordPress: `about-us`, `privacy-policy-en`, `terms-and-conditions`, `disclaimer-legale-canapalandia-eng`, vecchia pagina blog EN → pagine EN attuali;
   - slug EN con anno (`*-2025`) → stesse destinazioni già usate in `astro.config.mjs` per `/blog/`;
   - categorie WP oggi vuote: `normative-aspetti-legali` (50 post in WP) → `/categoria/normativa/`; `ribellario` (5 post, oggi in `cannabis-news-it`) → `/categoria/cannabis-news-it/`; `cbd-bellezza-cura-pelle` → `/categoria/salute-benessere/` (stesso criterio delle categorie thin già consolidate).
4. **Redirect verso 404 eliminato:** `categoria-prodotto/cosmetici` puntava a `/categoria/cbd-bellezza-cura-pelle/` (404); ora punta direttamente a `/categoria/salute-benessere/`.
5. **`/en/partners/`:** 410, coerente con `/partner-selezionati/`.
6. **Vecchia pagina blog EN** (`vercel.json`): destinazione `/en/blog/` invece del blog italiano.
7. **Link interni:** 11 link aggiornati alla destinazione finale; rimosso il pulsante commerciale verso `/partner-selezionati/` (410) in `cannabis-tecnologia-innovazioni`, senza modificare il testo.

## 404/410 conservati intenzionalmente

- 84 `/en/tag/*`: i tag EN non sono più pubblicati e non esiste un equivalente 1:1.
- `/en/donor-dashboard/`, `/en/faq-frequently-asked-questions/`, `/en/website-maintenance/`: funzioni o pagine dismesse senza sostituto.
- `/en/partner-seedsman/`: contenuto partner commerciale classificato italiano.
- Bozze e paginazioni fuori intervallo (già documentato in #116).

## Problemi residui (non risolti nel codice)

| Problema | Causa | Priorità | Azione |
|---|---|---|---|
| `/cdn-cgi/l/email-protection` in 404, linkato da 12 pagine | *Email Address Obfuscation* di Cloudflare riscrive i `mailto:` | Bassa: 404 innocuo per l'indicizzazione delle altre pagine | Decidere in Cloudflare (Scrape Shield) se disattivarla. È una protezione anti-spam: va valutata, non è un difetto del codice |
| `http://www.` → 3 redirect | http→https (Cloudflare), www→apex (Vercel), poi slug | Bassa | Facoltativo: regola Cloudflare `www` → apex in un solo hop |
| `/shop/`, `/negozio/`, `categoria-prodotto/<sconosciuta>` → 301 `/blog/` | Scelta precedente nel middleware | Media se GSC segnala soft 404 | Con export GSC, valutare 410 per le sezioni commerciali senza equivalente |
| 4 articoli con due `<h1>` | `<h1>` nel corpo MDX oltre al titolo del template | Bassa | Facoltativo, editoriale |
| Pagine `legacy-review` (noindex) | Quarantena editoriale | — | Esclusione intenzionale, non un errore |

## Verifiche successive in Search Console

1. Esportare *Indicizzazione → Pagine* (tutte le categorie) e passare gli URL a `node scripts/seo-check.mjs --urls export.csv`.
2. Dopo il deploy, ispezionare a campione: `/en/about-us/`, `/en/cbd-vs-thc-differences/`, `/categoria/normative-aspetti-legali/`, `/mappa-del-sito/`.
3. Avviare *Convalida correzione* solo sulla categoria *Non trovata (404)*, e solo dopo aver verificato con lo script che gli URL del rapporto non siano più in 404 o siano 404/410 intenzionali.
4. *Esclusa dal tag noindex* e *Pagina con reindirizzamento* aumenteranno per i permalink EN: è l'effetto atteso.

## Strumenti

```bash
pnpm build && pnpm seo:serve          # emula il routing Vercel su http://localhost:4321
pnpm seo:check -- --base http://localhost:4321
pnpm seo:check                        # produzione
pnpm seo:check -- --urls export.csv   # lista di URL (es. export GSC)
```

## Aggiornamento — verifica post-deploy e dati strutturati

**Produzione verificata** (`main` @ `06d882f`, deployment `dpl_AT2Qhc8…`, PR #125):

- sitemap 238/238 a 200, canonical/noindex/hreflang senza errori;
- link interni: resta solo `/cdn-cgi/l/email-protection` (Cloudflare);
- URL WordPress storici in 404: 88 su 645, identico alla verifica locale.

**Dati strutturati** (controllo completo sui 238 URL della sitemap):

| Problema | URL | Causa | Intervento |
|---|---|---|---|
| JSON-LD visibile ai lettori in un blocco di codice e quindi non letto come dato strutturato | `/blog/cbd-novel-food-ue-2026/` | Blocco ` ```json ` mai chiuso a fine articolo | Convertito in `<script type="application/ld+json">` con la sola `FAQPage` |
| Secondo `Article` senza `image`, in conflitto con il `BlogPosting` del template | `/blog/efsa-sicurezza-cbd-2026/` (e Novel Food) | Nodo `Article` scritto a mano nel corpo MDX | Nodo rimosso; resta il `BlogPosting` del template, completo |

`scripts/seo-check.mjs` ora segnala anche JSON-LD dentro `<pre>` ed `Article`/`BlogPosting` senza `headline`, `image` o `datePublished`.

**Non verificabile da qui:** Core Web Vitals. L'API PageSpeed Insights anonima ha restituito 429 (quota esaurita) e non c'è accesso a Search Console.

**Residuo editoriale:** in `/blog/cbd-novel-food-ue-2026/` i rimandi `[^1]`…`[^12]` compaiono come testo, perché le definizioni delle note non sono mai state nel repository. Vanno aggiunte le fonti: non sono state ricostruite.
