# Sistema Reazioni Post Blog

Sistema di reazioni (👍 ❤️ 😂 🔥) per i post del blog con contatori condivisi persistenti su Supabase.

## Endpoint API

**Endpoint pubblico**: `/api/reactions/<slug>` (senza `.json`)

- **GET**: Recupera contatori per un post
- **POST**: Incrementa una reazione (normalizza "likes"/"like" -> "up")

## Setup

### 1. Eseguire lo schema SQL

Eseguire il file `supabase/post_reactions.sql` nel SQL Editor di Supabase:

```sql
-- Vedi supabase/post_reactions.sql
```

Questo crea:
- Tabella `post_reactions` con colonne: `slug` (PK), `up`, `love`, `laugh`, `fire`, `updated_at`
- Funzione RPC `increment_post_reaction(p_slug, p_reaction)` per incremento atomico

### 2. Variabili ambiente

Assicurarsi che siano configurate:
- `SUPABASE_URL` - URL del progetto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (non anon key)

### 3. Componenti

- **API Endpoint**: `src/pages/api/reactions/[slug].ts`
  - GET: ritorna contatori per un post
  - POST: incrementa una reazione (chiama RPC)
  - Normalizza "likes"/"like" -> "up" automaticamente

- **Componente**: `src/components/Reactions.astro`
  - Props: `slug` (string)
  - Carica contatori al load
  - Gestisce click e localStorage per anti-spam
  - Stile coerente con il sito

- **Integrazione**: `src/pages/blog/[slug].astro`
  - Componente inserito dopo il contenuto articolo

## Funzionalità

- ✅ Contatori condivisi globali (persistenti su Supabase)
- ✅ Incremento atomico (no race condition via RPC)
- ✅ Anti-spam base: localStorage (1 voto per reazione per slug per browser)
- ✅ UI coerente: card con border white/10, bg white/5, hover elegante
- ✅ Accessibilità: aria-label, focus-visible

## Utilizzo

Il componente viene automaticamente renderizzato sotto ogni post in `/blog/:slug/`.

Gli utenti possono:
1. Vedere i contatori aggiornati
2. Cliccare su una reazione per incrementarla
3. Non possono votare due volte la stessa reazione (bloccato via localStorage)

## Note

- I contatori sono persistenti e condivisi tra tutti gli utenti
- Il localStorage previene doppi voti solo lato client (non è una protezione server-side)
- Per protezione server-side avanzata, implementare rate limiting o autenticazione

## Test locale

```bash
# Avvia server dev
pnpm dev

# Test GET
curl -i -X GET "http://localhost:4321/api/reactions/test-slug" \
  -H "Content-Type: application/json"

# Test POST con normalizzazione "likes" -> "up"
curl -i -X POST "http://localhost:4321/api/reactions/test-slug" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"likes"}'

# Test POST con IPv6
curl -i -X POST "http://[::1]:4321/api/reactions/test-slug" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"likes"}'
```

**Valori reazioni validi**: `up`, `love`, `laugh`, `fire`  
**Alias supportati**: `likes`/`like` -> `up`
