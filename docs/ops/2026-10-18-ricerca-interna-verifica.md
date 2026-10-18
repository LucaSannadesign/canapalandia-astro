# Ricerca interna Canapalandia — diagnosi e ripristino

Data: 2026-10-18
Branch: `fix/internal-search-restore-20261018`
Commit: `37d3c3e`
Stato: HUMAN_GATE_REQUIRED (nessun merge, push o deploy eseguito)

## 1. Causa del problema

Il motore di ricerca **non era rotto**. `src/lib/search.ts` (ripristinato dalle PR
#106/#108/#109) funziona end-to-end:

- indicizza titolo, tag+categoria, description e corpo MD/MDX (`entry.body`);
- rispetta la quarantena editoriale `legacy-review` tramite `isPublishedBlogEntry`;
- normalizza accenti e maiuscole, gestisce query senza match e query troppo corte.

Verificato su contenuto reale: 268 articoli, 136 IT e 59 EN indicizzabili,
68 in quarantena correttamente esclusi.

I difetti reali erano **a monte e a valle del matcher**:

| # | Difetto | Impatto |
|---|---------|---------|
| 1 | `/cerca/` usava colori dark hardcoded (`rgba(255,255,255,.14)` / `rgba(0,0,0,.18)`) | In light mode il campo diventava un riquadro grigio su bianco con bordo a **1.07:1** — sotto la soglia 3:1 di WCAG 2.2 SC 1.4.11 |
| 2 | `/en/search/` mostrava solo "Results" e troncava a 30 senza dichiararlo | Oltre 30 match i risultati sparivano senza avviso; nessuna parità con `/cerca/` |
| 3 | URL legacy WordPress `/?s=termine` atterravano in home | `readSearchQuery` accetta già `s`, ma su una route che non la legge: la ricerca non veniva mai eseguita |

## 2. Modifiche apportate

1. **`/cerca/` theme-aware** — token di tema (`--panel-2`, `--text`, `--muted`) al posto
   dei valori dark hardcoded. Bordo rinforzato con
   `color-mix(in oklab, var(--text) 55%, transparent)`: **3.42:1** in light e
   **4.54:1** in dark, entrambi sopra 3:1.
2. **Conteggio e troncamento su `/en/search/`** — "30 results" / "Top 30 of 32 results",
   allineato a "Primi 30 di 74 risultati" della versione IT.
3. **Redirect 301 per gli URL legacy WordPress** in `src/middleware.ts`:
   `/?s=x` → `/cerca/?q=x`, `/en/?s=x` → `/en/search/?q=x`.

Non sono state toccate le regole di quarantena SEO, le credenziali o la
configurazione di produzione.

## 3. File modificati

- `src/pages/cerca.astro` (+8 −3)
- `src/pages/en/search.astro` (+12 −4)
- `src/middleware.ts` (+14)

## 4. Test eseguiti ed esiti

| Verifica | Esito |
|---|---|
| Build di produzione (`astro build`) | ✅ verde, 0 errori |
| Output pagine vs baseline pre-modifica | ✅ identico (23 pagine); `/cerca/` e `/en/search/` restano on-demand |
| `scripts/i18n-audit.mjs` | ✅ exit 0 |
| Matrice 16 query reali + casi limite (IT/EN) | ✅ tutte corrette |
| Accenti e maiuscole (`perché` = `PERCHE` = 79 risultati) | ✅ |
| Query senza match (`xyzzy`, `caffè`) | ✅ empty state corretto |
| Query troppo corta (`a`) e query vuota | ✅ messaggio + ultimi articoli |
| Quarantena: 38 slug `legacy-review` su 24 pagine di risultati | ✅ **nessun leak** |
| Escaping della query (`"><img src=x onerror=…>`) | ✅ nessuna XSS, nessun elemento iniettato |
| Contrasto input light/dark (canvas, pixel reali) | ✅ 3.42:1 / 4.54:1 |
| Focus visibile da tastiera (Tab reale) | ✅ outline 2px solid |
| Invio da tastiera (Enter → `/cerca/?q=terpeni`) | ✅ 6 risultati, 6 card |
| Mobile 375px | ✅ no scroll orizzontale, target 44px, font 16px, form stacked, 1 colonna |
| SEO: canonical stabile + `robots` dichiarato `noindex,follow` | ✅ invariato |

Nota: il motore di ricerca è stato testato anche in isolamento, eseguendo il
modulo reale `src/lib/search.ts` transpilato contro i 268 file di contenuto
reali, con gli stessi risultati del server.

## 5. Problemi residui (non risolti, fuori perimetro)

- **Nessuna test suite nel repository.** `npm run smoke` punta a
  `scripts/smoke.mjs`, che non esiste — preesistente e non legato alla ricerca.
- **Prefix-only matching**: `terpene` non trova `terpeni` (una parola di query più
  lunga non può matchare una parola più corta nel contenuto). È il comportamento
  scelto nella PR #108; `terpen` trova entrambi. Cambiarlo richiede una decisione
  editoriale, non un fix tecnico.
- **In dev gli URL senza slash finale danno 404** (`/cerca`, `/contatti`, `/blog`).
  È comportamento site-wide del dev server: in produzione lo gestisce il
  redirect 308 di Vercel. Non toccato perché esula dalla ricerca.
- **Canonical legacy nei frontmatter EN** segnalati da `i18n:audit`: preesistenti,
  di natura editoriale.
- Il contrasto dei bordi è stato alzato solo per il campo di ricerca. Il token
  `--border` resta sotto 3:1 in tutto il sito: intervento più ampio da valutare
  separatamente.

## 6. Verifica in localhost

```bash
git checkout fix/internal-search-restore-20261018
npx astro dev --port 4321
```

Poi:

- `http://localhost:4321/cerca/?q=cbd` → "Primi 30 di 74 risultati per «cbd»"
- `http://localhost:4321/cerca/?q=terpeni` → 6 risultati
- `http://localhost:4321/cerca/?q=perché` → 79 risultati (uguale a `PERCHE`)
- `http://localhost:4321/cerca/?q=xyzzy` → "Nessun risultato" + ultimi articoli
- `http://localhost:4321/cerca/?q=a` → "Query troppo corta"
- `http://localhost:4321/en/search/?q=hemp` → "Top 30 of 32 results"
- `http://localhost:4321/?s=cbd` → 301 verso `/cerca/?q=cbd`
- Tema chiaro/scuro: il campo di ricerca deve avere bordo visibile in entrambi
- Tab da input a pulsante: outline verde visibile; Invio esegue la ricerca

Build completa:

```bash
npx astro build
```
