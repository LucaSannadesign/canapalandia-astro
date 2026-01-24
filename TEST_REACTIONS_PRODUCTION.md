# Test Reactions API in Produzione

## Configurazione verificata

✅ `output: "server"` in `astro.config.mjs`  
✅ Adapter Vercel configurato con `runtime: "serverless"`  
✅ `export const prerender = false;` in `src/pages/api/reactions/[slug].json.ts`  
✅ `@astrojs/vercel` presente in `devDependencies`

## Comandi curl per testare in produzione

### 1. Test GET (recupera contatori)

```bash
# Sostituisci <slug> con uno slug reale di un post
curl -X GET "https://canapalandia.com/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -v
```

**Esempio con slug reale:**
```bash
curl -X GET "https://canapalandia.com/api/reactions/legalizzazione-cannabis-germania-italia.json" \
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
curl -X POST "https://canapalandia.com/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"up"}' \
  -v
```

**Esempio con slug reale:**
```bash
curl -X POST "https://canapalandia.com/api/reactions/legalizzazione-cannabis-germania-italia.json" \
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
curl -X POST "https://canapalandia.com/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"love"}' \
  -v

# Laugh
curl -X POST "https://canapalandia.com/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"laugh"}' \
  -v

# Fire
curl -X POST "https://canapalandia.com/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"fire"}' \
  -v
```

### 4. Test errori

**Reazione non valida (400):**
```bash
curl -X POST "https://canapalandia.com/api/reactions/<slug>.json" \
  -H "Content-Type: application/json" \
  -d '{"reaction":"invalid"}' \
  -v
```

**Risposta attesa (400 Bad Request):**
```json
{
  "error": "Reazione non valida",
  "received": "invalid"
}
```

## Debug se ottieni 404

1. **Verifica deploy**: Assicurati che il deploy su Vercel sia completato dopo le modifiche
2. **Verifica build**: Controlla i log di build su Vercel per errori
3. **Verifica route**: Controlla che il file `src/pages/api/reactions/[slug].json.ts` sia presente
4. **Verifica config**: Controlla che `output: "server"` sia in `astro.config.mjs`
5. **Verifica adapter**: Controlla che l'adapter Vercel sia configurato

## Note

- Le API routes richiedono `output: "server"` (non "static")
- L'adapter Vercel deve essere configurato per deployare le API routes
- `export const prerender = false;` è necessario per le API routes
- Il dominio di produzione è `https://canapalandia.com`
