# Test Reactions API

## Setup locale

1. Avvia il server di sviluppo:
```bash
pnpm dev
```

Il server sarà disponibile su `http://localhost:4321` (o porta configurata).

## Test comandi curl

### 1. Test GET (recupera contatori)

```bash
# Sostituisci <slug> con uno slug reale di un post, es: "legalizzazione-cannabis-germania-italia"
curl -X GET "http://localhost:4321/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -v
```

**Esempio con slug reale:**
```bash
curl -X GET "http://localhost:4321/api/reactions/legalizzazione-cannabis-germania-italia.json" \
  -H "Content-Type: application/json" \
  -v
```

**Risposta attesa (200 OK):**
```json
{
  "slug": "legalizzazione-cannabis-germania-italia",
  "up": 0,
  "love": 0,
  "laugh": 0,
  "fire": 0
}
```

### 2. Test POST (incrementa reazione)

```bash
# Sostituisci <slug> con uno slug reale
curl -X POST "http://localhost:4321/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"up"}' \
  -v
```

**Esempio con slug reale:**
```bash
curl -X POST "http://localhost:4321/api/reactions/legalizzazione-cannabis-germania-italia.json" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"up"}' \
  -v
```

**Risposta attesa (200 OK):**
```json
{
  "slug": "legalizzazione-cannabis-germania-italia",
  "up": 1,
  "love": 0,
  "laugh": 0,
  "fire": 0
}
```

### 3. Test POST con altre reazioni

```bash
# Love
curl -X POST "http://localhost:4321/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"love"}' \
  -v

# Laugh
curl -X POST "http://localhost:4321/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"laugh"}' \
  -v

# Fire
curl -X POST "http://localhost:4321/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"fire"}' \
  -v
```

### 4. Test errori

**Reazione non valida (400):**
```bash
curl -X POST "http://localhost:4321/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"invalid"}' \
  -v
```

**Slug mancante (400):**
```bash
curl -X GET "http://localhost:4321/api/reactions/.json" \
  -H "Content-Type: application/json" \
  -v
```

**Metodo non supportato (405):**
```bash
curl -X PUT "http://localhost:4321/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -v
```

## Debug

Se ottieni 404, controlla:

1. **Log del server**: Cerca `[reactions]` nei log
2. **Route file**: Verifica che esista `src/pages/api/reactions/[slug].json.ts`
3. **Config Astro**: Verifica `output: "server"` in `astro.config.mjs`
4. **Variabili ambiente**: Verifica `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`

## Note

- Il frontend chiama `/api/reactions/${slug}.json` (con `.json`)
- L'endpoint deve rispondere a questa route esatta
- Se continua a dare 404, potrebbe essere necessario rinominare il file da `[slug].json.ts` a `[slug].ts` e aggiornare il frontend per rimuovere `.json`
