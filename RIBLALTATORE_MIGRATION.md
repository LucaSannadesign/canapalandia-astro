# Ribaltatore AI - Migrazione da WordPress/PHP ad Astro

## Overview

Questa migrazione replica **ESATTAMENTE** il comportamento del sistema originale PHP/WordPress mantenendo lo stesso flusso utente e migliorando sicurezza, accessibilità e UI.

## Struttura File

```
src/
├── pages/
│   ├── ribaltatore.astro          # Pagina principale (form)
│   ├── frasi-ribaltate.astro      # Archivio paginato
│   ├── ribaltate-ai/
│   │   └── [id].astro             # Pagina singola SSR
│   └── api/
│       └── ribalta-ai.ts          # Endpoint API (POST)
├── lib/
│   ├── db.ts                      # Database abstraction layer
│   └── rateLimit.ts               # Rate limiting per IP
schema.sql                         # Schema database (SQLite/Postgres)
```

## Configurazione

### 1. Variabili d'Ambiente

Aggiungi al file `.env` (o configurazione Vercel):

```bash
# OpenAI API Key (obbligatoria)
OPENAI_API_KEY=sk-proj-...

# Opzionale: modello e temperature
OPENAI_MODEL=gpt-3.5-turbo        # Default: gpt-3.5-turbo
OPENAI_TEMPERATURE=0.9             # Default: 0.9

# Opzionale: path file JSON (se non si usa DB)
DATABASE_URL=data/ribaltatore.json # Default: data/ribaltatore.json
```

### 2. Database

**Opzione A: File JSON (default, sviluppo)**
- Nessuna configurazione necessaria
- File creato automaticamente in `data/ribaltatore.json`
- Compatibile con Vercel Serverless Functions

**Opzione B: SQLite (locale)**
- Installa `better-sqlite3`: `npm install better-sqlite3`
- Aggiorna `src/lib/db.ts` per usare SQLite
- Esegui `schema.sql` per creare tabella

**Opzione C: Postgres (produzione)**
- Configura `DATABASE_URL` con stringa connessione Postgres
- Aggiorna `src/lib/db.ts` per usare Postgres (es. `@vercel/postgres`)
- Esegui schema Postgres da `schema.sql`

### 3. Inizializzazione

Per inizializzare il database:

```bash
# Se usi SQLite, crea il file manualmente o esegui:
sqlite3 data/ribaltatore.db < schema.sql

# Se usi Postgres:
psql $DATABASE_URL < schema.sql
```

## Funzionalità Replicate

### ✅ API Endpoint (`/api/ribalta-ai`)

- **POST** con `FormData` (`frase`, `email_trap`)
- **Honeypot**: valida campo `email_trap` (se compilato = spam)
- **Rate Limit**: 10 richieste / 10 minuti per IP
- **Validazione**: frase 3-400 caratteri
- **OpenAI**: chiamata a `chat/completions` (gpt-3.5-turbo, temperature 0.9)
- **Prompt**: identico al PHP originale
- **Output**: JSON `{ id, originale, ribaltata }`

### ✅ Pagina Principale (`/ribaltatore`)

- Form con `textarea` (min 3 / max 400 caratteri)
- Honeypot `email_trap` (nascosto)
- Submit via `fetch` POST a `/api/ribalta-ai`
- UI: loading, error, risultato
- Risultato include:
  - Frase originale
  - Frase ribaltata (formattata tipograficamente)
  - Pulsante "Copia" + feedback "Copiato!"
  - Link condivisibile `/ribaltate-ai/{id}`
  - Share buttons (Facebook, X, Telegram, WhatsApp, LinkedIn)

### ✅ Pagina Archivio (`/frasi-ribaltate`)

- Lista paginata (20 per pagina)
- Ordine DESC (più recenti in alto)
- Card per ogni frase con:
  - Testo originale e ribaltato
  - Pulsante copia
  - Share buttons
- Paginazione (Prev/Next + indicazione pagina)

### ✅ Pagina Singola (`/ribaltate-ai/{id}`)

- **SSR**: legge dal DB per ID
- **Meta SEO/OG**: titolo, description, og:title, og:description, og:url, og:image
  - ⚠️ **Nota**: Meta tag attualmente aggiunti via script inline (non ideale per SEO)
  - **TODO**: Aggiungere supporto per meta tag personalizzati nel layout `SiteLayout`
- **Structured Data**: JSON-LD schema.org
- Formattazione tipografica "a respiro" (paragrafi)
- Pulsante copia testo e share
- **404** se ID non esiste

## Migliorie Implementate

### Sicurezza

- ✅ Sanitizzazione output AI (rimozione HTML non controllato)
- ✅ Limite lunghezza output (max 1200 caratteri)
- ✅ Honeypot per spam
- ✅ Rate limiting per IP
- ✅ Validazione input lato server

### Robustezza

- ✅ Timeout chiamata OpenAI (30s)
- ✅ Error message user-friendly
- ✅ Fallback per errori DB (non blocca output)

### Accessibilità

- ✅ Label associate ai form
- ✅ `aria-live` per "copiato"
- ✅ Focus states visibili
- ✅ Contrasto sufficiente
- ✅ Tap targets comodi (min 44px)

### UI

- ✅ Layout moderno ma coerente
- ✅ Card, spaziature, tipografia
- ✅ Mobile-first
- ✅ Gutter globale (10px mobile, 24px desktop)
- ✅ Transizioni fluide

## Compatibilità 1:1 con PHP

### Comportamento Identico

1. **Prompt OpenAI**: identico al PHP (`"Agisci come un attivista antiproibizionista e satirico. Ribalta con ironia e intelligenza lo slogan: \"{frase}\""`)
2. **Parametri OpenAI**: `gpt-3.5-turbo`, `temperature: 0.9` (come PHP)
3. **Formattazione output**: sostituzione punteggiatura con `<br><br>` (come PHP)
4. **Share URLs**: identici (stessi parametri, stesse piattaforme)
5. **Testo condivisibile**: formato identico con hashtag
6. **Honeypot**: stesso nome campo (`email_trap`)

### Differenze Minori (Migliorie)

- **Rate Limit**: aggiunto (non presente nel PHP originale)
- **Timeout**: aggiunto (30s) per evitare hang
- **Sanitizzazione**: migliorata (rimozione HTML non sicuro)
- **Error handling**: più robusto con messaggi user-friendly

## Deployment

### Vercel

1. Configura `OPENAI_API_KEY` in Vercel Dashboard
2. Deploy automatico (build detection)
3. File JSON funziona su Serverless Functions

### Build Locale

```bash
# Install dependencies
npm install

# Setup .env
echo "OPENAI_API_KEY=sk-proj-..." > .env

# Build
npm run build

# Preview
npm run preview
```

## Test

### Test Manuale

1. **Form principale**: inserisci frase, verifica loading, risultato
2. **Honeypot**: compila campo nascosto, verifica blocco
3. **Rate limit**: fai 11 richieste rapide, verifica 429
4. **Archivio**: verifica paginazione, copy, share
5. **Singola**: verifica meta SEO/OG, formattazione, 404 per ID inesistente

### Checklist

- [ ] Form valida min/max caratteri
- [ ] Honeypot blocca spam
- [ ] Rate limit funziona (10/10min)
- [ ] OpenAI chiamata correttamente
- [ ] Output formattato correttamente
- [ ] Copy button funziona
- [ ] Share buttons link corretti
- [ ] Paginazione funziona
- [ ] Meta SEO/OG presenti
- [ ] 404 per ID inesistente
- [ ] Mobile responsive
- [ ] Accessibilità OK

## Note Tecniche

### Database

L'implementazione attuale usa file JSON per compatibilità con Vercel Serverless. Per migrare a SQLite/Postgres:

1. Installa dipendenza (`better-sqlite3` o `@vercel/postgres`)
2. Aggiorna `src/lib/db.ts` mantenendo la stessa interfaccia
3. Il codice chiamante (`insertRibaltata`, `getRibaltataById`, `listRibaltate`) non deve cambiare

### Rate Limiting

Rate limit è in-memory (non persistente tra riavvii). Per produzione distribuita:

- Usa Redis o database
- Mantieni stessa interfaccia (`checkRateLimit`)

### OpenAI

Se vuoi usare un modello diverso:

- Modifica `OPENAI_MODEL` in `.env`
- Modifica `OPENAI_TEMPERATURE` se necessario

## Troubleshooting

### "OPENAI_API_KEY non configurata"
- Verifica `.env` o variabile Vercel
- Riavvia dev server dopo modifica `.env`

### "Errore DB"
- Verifica permessi scrittura su `data/` (JSON)
- Se SQLite: verifica path e permessi
- Se Postgres: verifica connessione

### "Rate limit superato"
- Aspetta 10 minuti o riavvia server (in-memory)

### "404 su /ribaltate-ai/{id}"
- Verifica ID esiste nel DB
- Verifica routing Astro (file `[id].astro` presente)

## Changelog

- **v1.0.0** (2025-01-XX): Migrazione completa da PHP/WordPress ad Astro
  - Replica comportamento 1:1
  - Migliorie sicurezza, accessibilità, UI
  - Supporto file JSON (default) + SQLite/Postgres (opzionale)
