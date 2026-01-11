# Ribaltatore AI - Migrazione a Supabase

## Analisi Logica OpenAI dal Tema WordPress

### Chiamata OpenAI (ribalta-ai.php)

```php
$prompt = "Agisci come un attivista antiproibizionista e satirico. Ribalta con ironia e intelligenza lo slogan: \"$frase\"";

$data = [
    "model" => "gpt-3.5-turbo",
    "messages" => [["role" => "user", "content" => $prompt]],
    "temperature" => 0.9
];
```

### Parametri Identificati

- **Model**: `gpt-3.5-turbo`
- **Temperature**: `0.9`
- **Messages**: Solo `role: "user"` (nessun system message)
- **Max tokens**: Non specificato (usa default OpenAI)
- **Prompt**: "Agisci come un attivista antiproibizionista e satirico. Ribalta con ironia e intelligenza lo slogan: \"{frase}\""

### Formattazione Output PHP

```php
// Formattazione: sostituisce punteggiatura con <br><br>
$frase_html = preg_replace('/([\.!?])(\s+)/', "$1<br><br>", htmlspecialchars($ribaltata));
```

### JSON Response PHP

```php
echo json_encode([
    'ribaltata' => $ribaltata,
    'originale' => $frase,
    'html' => $html
]);
```

Nota: L'Astro attuale ritorna `{ id, originale, ribaltata }` che è compatibile (aggiunge `id` per il DB).

## Variabili Environment Vercel

Aggiungere in Vercel Dashboard → Settings → Environment Variables:

```
OPENAI_API_KEY=sk-proj-...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Schema Database Supabase

Eseguire in SQL Editor di Supabase:

```sql
-- Tabella ribaltatore
CREATE TABLE IF NOT EXISTS ribaltatore (
  id BIGSERIAL PRIMARY KEY,
  frase_originale TEXT NOT NULL,
  frase_ribaltata TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_hash TEXT,
  user_id UUID REFERENCES auth.users(id) -- Opzionale per futuro
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_ribaltatore_created_at ON ribaltatore(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ribaltatore_user_id ON ribaltatore(user_id) WHERE user_id IS NOT NULL;

-- RLS (Row Level Security): disabilitato per ora
ALTER TABLE ribaltatore ENABLE ROW LEVEL SECURITY;

-- Policy: tutti possono leggere (per pagine pubbliche)
CREATE POLICY "Public read access" ON ribaltatore
  FOR SELECT USING (true);

-- Policy: solo service role può inserire (via API)
-- Nota: l'inserimento viene fatto via service role, non serve policy INSERT per utenti
```

## Modifiche Implementate

### File Creati

1. **`src/lib/supabaseServer.ts`** - Client Supabase server-side
2. **`src/lib/repositories/ribaltatoreRepo.ts`** - Repository pattern per DB
3. **`supabase/schema.sql`** - Schema SQL per Supabase

### File Modificati

1. **`src/pages/api/ribalta-ai.ts`** - Aggiornato per usare repository Supabase
2. **`src/pages/ribaltate-ai/[id].astro`** - Aggiornato per usare repository
3. **`src/pages/frasi-ribaltate.astro`** - Aggiornato per usare repository

### Allineamento OpenAI

- ✅ Rimossi `max_tokens` per allinearsi al PHP (usa default OpenAI)
- ✅ Prompt identico al PHP
- ✅ Temperature 0.9
- ✅ Model gpt-3.5-turbo
- ✅ Solo user message (nessun system)

### Sicurezza

- ✅ Service Role Key solo server-side (API routes e SSR)
- ✅ Rate limiting per IP (10 req/10min)
- ✅ Honeypot validazione
- ✅ Input sanitization (trim, min/max)
- ✅ Output sanitization (rimozione HTML)

## Installazione Dipendenze

```bash
npm install @supabase/supabase-js
```

## Deploy Checklist

1. ✅ Aggiungi variabili env in Vercel:
   - `OPENAI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. ✅ Esegui schema SQL su Supabase (SQL Editor)
3. ✅ Verifica che build passi: `npm run build`
4. ✅ Testa API endpoint: `POST /api/ribalta-ai`
5. ✅ Testa pagine SSR: `/ribaltate-ai/[id]` e `/frasi-ribaltate`

## Note Tecniche

- **Repository Pattern**: Interfaccia identica a `db.ts` per swap trasparente
- **Rate Limiting**: In-memory Map (ok per serverless, TODO: Upstash Redis per distribuito)
- **RLS**: Abilitato ma solo SELECT pubblico, INSERT via service role
- **Auth**: Struttura pronta per `user_id` (colonna nullable, non obbligatoria ora)
- **IP Hash**: Salvataggio opzionale per analytics/privacy (sha256)

## Compatibilità

- ✅ UI esistente mantenuta (nessuna modifica frontend)
- ✅ Formato JSON API invariato (aggiunto solo `id`)
- ✅ Pagine SSR esistenti aggiornate per Supabase
- ✅ Fallback: se DB fallisce, API ritorna comunque risultato (id=0)
