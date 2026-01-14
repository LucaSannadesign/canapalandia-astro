# 🔍 SEO Audit Report - Canapalandia
**Data:** 2025-01-XX  
**Engineer:** Senior Astro + SEO  
**Obiettivo:** Rendere Canapalandia SEO-safe e pronto per crescita organica

---

## 📋 EXECUTIVE SUMMARY

Il progetto Astro è ben strutturato ma presenta **problemi critici SEO** che possono impattare l'indicizzazione e la visibilità organica. Priorità: **P0** (bloccanti), **P1** (importanti), **P2** (miglioramenti).

---

## 🚨 PROBLEMI TROVATI

### **P0 - CRITICI (Bloccanti SEO)**

#### 1. **Meta Description Mancanti** 
**File:** `src/layouts/SiteLayout.astro` (linea 119-129)  
**Problema:** Il layout principale non gestisce `description` prop. Solo `title` e `canonical` sono passati.  
**Impatto:** Pagine senza meta description = snippet Google generici, CTR più basso.  
**Pagine affette:**
- `/blog/` - nessuna description
- `/ribaltatore/` - nessuna description  
- `/frasi-ribaltate/` - nessuna description
- `/contatti/` - nessuna description
- `/cerca/` - ha description ma via `MigratedLayout`

**Fix richiesto:**
```typescript
// SiteLayout.astro - aggiungere prop description
const { title, canonical, description, yoastHeadHtml, shell = true } = Astro.props;

// In <head>:
{description ? <meta name="description" content={description} /> : null}
```

---

#### 2. **Open Graph Tags Mancanti (Tutte le pagine tranne ribaltate-ai)**
**File:** `src/layouts/SiteLayout.astro`  
**Problema:** Solo `/ribaltate-ai/[id]` ha OG tags (injectati via script inline, non ideale). Tutte le altre pagine non hanno OG/Twitter cards.  
**Impatto:** Condivisioni social senza preview, CTR social basso.  
**Pagine affette:**
- Home (`/`)
- Blog (`/blog/`)
- Categorie (`/categoria/[slug]`)
- Tag (`/tag/[slug]`)
- Post singoli (`/[...path]`)
- Ribaltatore (`/ribaltatore/`)
- Frasi Ribaltate (`/frasi-ribaltate/`)

**Fix richiesto:** Aggiungere componente `<SEOHead>` con OG/Twitter tags standardizzati.

---

#### 3. **Escape Caratteri Speciali nei JSON (ribaltate.json)**
**File:** `src/data/ribaltate.json` (linee 41, 59, 71, 101, 107, ecc.)  
**Problema:** Output contiene `\\\"` invece di `"` (escape doppio).  
**Esempio:**
```json
"output": "\\\"Chi fuma è un'erba vivente\\\""
```
**Impatto:** Rendering frontend mostra `\"` invece di `"`, testo poco leggibile, potenziale problema SEO se indicizzato così.  
**Fix richiesto:** Sanitizzare JSON o fixare escape nel rendering (`src/pages/frasi-ribaltate.astro` linea 76, `src/pages/ribaltate-ai/[id].astro`).

---

#### 4. **Canonical URLs Inconsistenti**
**File:** Multiple  
**Problema:** Mix di `import.meta.env.SITE`, `Astro.url.origin`, e `WP_HOST`.  
**Esempi:**
- `src/pages/blog.astro` (linea 107): `import.meta.env.SITE || Astro.url.origin`
- `src/pages/ribaltatore.astro` (linea 15): `Astro.url.origin`
- `src/pages/index.astro` (linea 188): `WP_HOST` (hardcoded)
- `src/pages/[...path].astro` (linea 161): path relativo senza origin

**Impatto:** Canonical duplicati o errati = rischio penalizzazione Google.  
**Fix richiesto:** Standardizzare su helper `getCanonicalUrl()` che usa `import.meta.env.SITE` con fallback.

---

#### 5. **Robots Meta Inconsistente**
**File:** `src/layouts/SiteLayout.astro` (linea 126)  
**Problema:** Solo check `isProduction` per robots. Alcune pagine (es. `/en/*`) hanno `robots: { index: false }` ma non viene applicato nel layout principale.  
**Impatto:** Pagine EN indicizzate quando non dovrebbero, o viceversa.  
**Fix richiesto:** Passare `robots` prop al layout e renderizzare `<meta name="robots">` dinamicamente.

---

### **P1 - IMPORTANTI (Alto impatto SEO)**

#### 6. **Excerpt Potenzialmente "[object Object]"**
**File:** `src/components/CardPost.astro` (linea 23)  
**Problema:** `excerpt` prop viene passato direttamente senza validazione. Se arriva oggetto invece di stringa, renderizza `[object Object]`.  
**Impatto:** Snippet visibili con "[object Object]" = UX pessima, potenziale penalizzazione qualità.  
**Fix richiesto:** Validazione in `CardPost.astro`:
```typescript
const excerptSafe = typeof excerpt === 'string' ? excerpt : String(excerpt || '').replace(/\[object Object\]/g, '');
```

---

#### 7. **Sitemap Redirects Strani**
**File:** `vercel.json` (linee 24-31)  
**Problema:** Redirect `/sitemap.xml` → `/sitemap-0.xml` e `/sitemap_index.xml` → `/sitemap-0.xml`.  
**Impatto:** Google potrebbe non trovare sitemap se cerca `/sitemap.xml`.  
**Fix richiesto:** Verificare che `@astrojs/sitemap` generi `/sitemap.xml` correttamente, rimuovere redirect se non necessario.

---

#### 8. **RSS Feed: Description Potenzialmente Vuota**
**File:** `src/pages/rss.xml.ts` (linea 65)  
**Problema:** Fallback chain `excerpt?.rendered || excerpt || content?.rendered || ""` potrebbe restituire stringa vuota.  
**Impatto:** Feed RSS con `<description></description>` vuoto = feed non valido per alcuni aggregatori.  
**Fix richiesto:** Aggiungere fallback descrizione generica se tutto è vuoto.

---

#### 9. **Structured Data Mancante (Schema.org)**
**File:** Tutte le pagine tranne `/ribaltate-ai/[id]`  
**Problema:** Solo pagina ribaltate-ai ha JSON-LD. Home, blog, post non hanno Article/Breadcrumb/Organization schema.  
**Impatto:** Perdita di rich snippets in SERP (date, author, breadcrumbs).  
**Fix richiesto:** Aggiungere componenti Schema.org per:
- `Article` (post singoli)
- `BreadcrumbList` (tutte le pagine con navigazione)
- `Organization` (footer/tutte le pagine)
- `WebSite` (home)

---

#### 10. **Meta Tags Injectati via Script (Non SEO-friendly)**
**File:** `src/pages/ribaltate-ai/[id].astro` (linee 60-122)  
**Problema:** OG/Twitter/JSON-LD injectati via `<script is:inline>` invece che in `<head>` server-side.  
**Impatto:** Crawler potrebbero non vedere i tag (soprattutto JSON-LD), preview social potrebbero fallire.  
**Fix richiesto:** Spostare tutto in `<head>` server-side o componente Astro.

---

#### 11. **robots.txt Base**
**File:** `public/robots.txt`  
**Problema:** Solo `User-agent: *` e `Allow: /`. Manca:
- Disallow per `/api/*`
- Disallow per `/en/*` (se non devono essere indicizzate)
- Sitemap reference (già presente ma verificare path)

**Fix richiesto:** Aggiungere regole specifiche.

---

### **P2 - MIGLIORAMENTI (Nice to have)**

#### 12. **Title Tags Non Ottimizzati**
**File:** Multiple  
**Problema:** Alcuni title troppo generici:
- `/blog/`: "Blog — Canapalandia" (manca keyword)
- `/ribaltatore/`: "🧠 Ribalta con l'AI | Canapalandia" (emoji nel title = non ideale SEO)

**Fix richiesto:** Ottimizzare title con keyword primarie, max 60 caratteri, senza emoji.

---

#### 13. **Hreflang Mancante (se multi-lingua)**
**File:** Tutte le pagine  
**Problema:** Pagine `/en/*` esistono ma non c'è `<link rel="alternate" hreflang="en">` nelle pagine IT.  
**Impatto:** Google potrebbe indicizzare versioni sbagliate per utenti EN.  
**Fix richiesto:** Aggiungere hreflang se le pagine EN sono attive.

---

#### 14. **Alt Text Immagini Potenzialmente Vuoti**
**File:** `src/components/CardPost.astro` (linea 12)  
**Problema:** `alt={title || ""}` - se title è vuoto, alt è vuoto.  
**Impatto:** Immagini senza alt = perdita opportunità SEO immagini.  
**Fix richiesto:** Fallback alt text generico.

---

#### 15. **Trailing Slash Inconsistente**
**File:** `astro.config.mjs` (linea 10)  
**Problema:** `trailingSlash: "always"` ma alcuni canonical potrebbero non rispettarlo.  
**Impatto:** Duplicati URL (con/senza trailing slash).  
**Fix richiesto:** Verificare che tutti i canonical abbiano trailing slash.

---

#### 16. **Newsletter: Meta Description Mancante**
**File:** Componente Newsletter (non trovato in audit)  
**Problema:** Se newsletter è pagina standalone, potrebbe mancare SEO.  
**Fix richiesto:** Verificare e aggiungere se necessario.

---

## 📝 PATCH PLAN

### **FASE 1: P0 - Fix Critici (1-2 giorni)**

#### Step 1.1: Fix Meta Description
**File:** `src/layouts/SiteLayout.astro`
- Aggiungere prop `description?: string`
- Renderizzare `<meta name="description">` in `<head>`
- Aggiornare tutte le pagine per passare `description`

**Pagine da aggiornare:**
- `src/pages/blog.astro`
- `src/pages/ribaltatore.astro`
- `src/pages/frasi-ribaltate.astro`
- `src/pages/contatti.astro`
- `src/pages/index.astro`
- `src/pages/[...path].astro` (già ha description, verificare)

**Test:** Verificare `<meta name="description">` in HTML source di ogni pagina.

---

#### Step 1.2: Fix Escape Caratteri (ribaltate.json)
**File:** `src/data/ribaltate.json` + rendering components
- Opzione A: Sanitizzare JSON (rimuovere `\\\"` → `"`)
- Opzione B: Fix rendering in `frasi-ribaltate.astro` e `ribaltate-ai/[id].astro` per decodificare escape

**Preferenza:** Opzione B (non toccare JSON se è legacy, fix rendering).

**File da modificare:**
- `src/pages/frasi-ribaltate.astro` (linea 76-97)
- `src/pages/ribaltate-ai/[id].astro` (linea 52-55, 139-141)

**Test:** Verificare che output non mostri `\"` nel browser.

---

#### Step 1.3: Standardizzare Canonical URLs
**File:** `src/lib/utils.ts` (creare nuovo helper)
- Creare funzione `getCanonicalUrl(path: string): string`
- Usare `import.meta.env.SITE` con fallback `Astro.url.origin`
- Assicurare trailing slash

**File da aggiornare:**
- `src/pages/blog.astro`
- `src/pages/ribaltatore.astro`
- `src/pages/frasi-ribaltate.astro`
- `src/pages/contatti.astro`
- `src/pages/index.astro`
- `src/pages/[...path].astro`

**Test:** Verificare che tutti i canonical siano assoluti e corretti.

---

#### Step 1.4: Fix Robots Meta
**File:** `src/layouts/SiteLayout.astro`
- Aggiungere prop `robots?: { index?: boolean; follow?: boolean }`
- Renderizzare `<meta name="robots">` dinamicamente
- Default: `index,follow` in produzione, `noindex,nofollow` in dev

**File da aggiornare:**
- `src/pages/en/*` (passare `robots: { index: false }`)

**Test:** Verificare robots meta in HTML source.

---

### **FASE 2: P1 - Fix Importanti (2-3 giorni)**

#### Step 2.1: Componente SEO Head (OG/Twitter)
**File:** `src/components/SEOHead.astro` (nuovo)
- Props: `title`, `description`, `canonical`, `ogImage?`, `type?`
- Renderizzare:
  - `<meta name="description">`
  - `<meta property="og:*">`
  - `<meta name="twitter:*">`
  - `<link rel="canonical">`

**File da aggiornare:**
- `src/layouts/SiteLayout.astro` (usare componente)
- Tutte le pagine (passare props SEO)

**Test:** Verificare OG tags con [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) e [Twitter Card Validator](https://cards-dev.twitter.com/validator).

---

#### Step 2.2: Fix Excerpt "[object Object]"
**File:** `src/components/CardPost.astro`
- Validazione tipo e sanitizzazione excerpt
- Fallback a stringa vuota se non valido

**Test:** Verificare che card non mostrino "[object Object]".

---

#### Step 2.3: Structured Data (Schema.org)
**File:** `src/components/StructuredData.astro` (nuovo)
- Componenti per:
  - `Article` (post)
  - `BreadcrumbList`
  - `Organization`
  - `WebSite`

**File da aggiornare:**
- `src/layouts/SiteLayout.astro` (Organization, WebSite)
- `src/pages/[...path].astro` (Article, BreadcrumbList)
- `src/pages/blog.astro` (BreadcrumbList)
- `src/pages/index.astro` (WebSite)

**Test:** Verificare con [Google Rich Results Test](https://search.google.com/test/rich-results).

---

#### Step 2.4: Fix RSS Feed Description
**File:** `src/pages/rss.xml.ts`
- Aggiungere fallback description generica se vuota
- Validare che description non sia solo spazi

**Test:** Validare feed con [W3C Feed Validator](https://validator.w3.org/feed/).

---

#### Step 2.5: Fix robots.txt
**File:** `public/robots.txt`
- Aggiungere `Disallow: /api/*`
- Aggiungere `Disallow: /en/*` (se EN non deve essere indicizzato)
- Verificare sitemap path

**Test:** Verificare con [Google Search Console](https://search.google.com/search-console).

---

#### Step 2.6: Spostare Meta Tags da Script a Head
**File:** `src/pages/ribaltate-ai/[id].astro`
- Rimuovere script inline
- Usare componente `<SEOHead>` con props
- Spostare JSON-LD in componente `<StructuredData>`

**Test:** Verificare che meta tags siano in `<head>` server-side.

---

### **FASE 3: P2 - Miglioramenti (1-2 giorni)**

#### Step 3.1: Ottimizzare Title Tags
**File:** Multiple pagine
- Rimuovere emoji da title
- Aggiungere keyword primarie
- Max 60 caratteri

**Test:** Verificare title in HTML source.

---

#### Step 3.2: Hreflang (se necessario)
**File:** `src/layouts/SiteLayout.astro`
- Aggiungere `<link rel="alternate" hreflang="...">` se pagine EN attive

**Test:** Verificare con [hreflang Tags Testing Tool](https://technicalseo.com/tools/hreflang/).

---

#### Step 3.3: Alt Text Immagini
**File:** `src/components/CardPost.astro`
- Fallback alt text se title vuoto

**Test:** Verificare alt text in HTML source.

---

## ⚠️ RISCHI E REGRESSIONI

### **Rischi P0 Fixes:**

1. **Meta Description Breaking Changes**
   - **Rischio:** Pagine esistenti potrebbero perdere description se prop non passata
   - **Mitigazione:** Fallback a description generica basata su title
   - **Test:** Verificare tutte le pagine dopo deploy

2. **Canonical URL Changes**
   - **Rischio:** Cambio canonical potrebbe causare re-indexing
   - **Mitigazione:** Verificare che nuovi canonical siano corretti prima di deploy
   - **Test:** Confrontare canonical vecchi vs nuovi

3. **Escape Fix Breaking Rendering**
   - **Rischio:** Fix escape potrebbe rompere rendering esistente
   - **Mitigazione:** Testare su staging con dati reali
   - **Test:** Verificare rendering frasi ribaltate in browser

---

### **Rischi P1 Fixes:**

1. **OG Tags Duplicati**
   - **Rischio:** Se `yoastHeadHtml` già contiene OG tags, potrebbero duplicarsi
   - **Mitigazione:** Verificare che `yoastHeadHtml` non contenga OG, o fare merge intelligente
   - **Test:** Verificare HTML source per duplicati

2. **Structured Data Errors**
   - **Rischio:** JSON-LD malformato = errori in Google Search Console
   - **Mitigazione:** Validare JSON-LD con validator prima di deploy
   - **Test:** [Google Rich Results Test](https://search.google.com/test/rich-results)

3. **RSS Feed Breaking**
   - **Rischio:** Modifiche a RSS potrebbero rompere feed esistente
   - **Mitigazione:** Testare feed con validator
   - **Test:** [W3C Feed Validator](https://validator.w3.org/feed/)

---

### **Test Locali Consigliati:**

```bash
# 1. Build e verifica HTML
npm run build
# Verificare HTML in dist/ per meta tags

# 2. Test RSS
curl http://localhost:4321/rss.xml | xmllint --format -

# 3. Test Sitemap
curl http://localhost:4321/sitemap.xml | xmllint --format -

# 4. Test pagine critiche
# - Home: http://localhost:4321/
# - Blog: http://localhost:4321/blog/
# - Post: http://localhost:4321/[qualche-slug]/
# - Ribaltatore: http://localhost:4321/ribaltatore/
# - Frasi: http://localhost:4321/frasi-ribaltate/
```

**Tool esterni:**
- [Google Search Console](https://search.google.com/search-console) - verifica indicizzazione
- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) - test OG tags
- [Twitter Card Validator](https://cards-dev.twitter.com/validator) - test Twitter cards
- [Google Rich Results Test](https://search.google.com/test/rich-results) - test structured data
- [W3C Markup Validator](https://validator.w3.org/) - validazione HTML

---

## 📊 PRIORITÀ ESECUZIONE

**Settimana 1:**
- ✅ P0.1: Meta Description (2h)
- ✅ P0.2: Fix Escape Caratteri (1h)
- ✅ P0.3: Canonical URLs (2h)
- ✅ P0.4: Robots Meta (1h)

**Settimana 2:**
- ✅ P1.1: Componente SEO Head (4h)
- ✅ P1.2: Fix Excerpt (1h)
- ✅ P1.3: Structured Data (6h)
- ✅ P1.4: RSS Feed (1h)

**Settimana 3:**
- ✅ P1.5: robots.txt (30min)
- ✅ P1.6: Meta Tags Server-side (2h)
- ✅ P2.1-3: Miglioramenti (4h)

**Totale stimato:** ~20-25 ore

---

## ✅ ACCETTANZA

**Checklist finale:**
- [ ] Tutte le pagine hanno meta description
- [ ] Tutte le pagine hanno OG/Twitter tags
- [ ] Canonical URLs consistenti e corretti
- [ ] Nessun "[object Object]" visibile
- [ ] Nessun `\"` nei rendering frasi
- [ ] Structured data validi
- [ ] RSS feed valido
- [ ] robots.txt completo
- [ ] Build passa senza errori
- [ ] Test locali passati
- [ ] Test tool esterni passati

---

**Report generato:** 2025-01-XX  
**Prossimi step:** Review report → Approvazione → Esecuzione Fase 1 (P0)
