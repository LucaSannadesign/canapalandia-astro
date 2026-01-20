# Checklist Operativa - Sicurezza Pipeline Auto-Post

## ✅ COSA FARE SUBITO (5 passi)

### 1. Configurare GH_PAT Secret in GitHub
   - Vai su: **Settings > Secrets and variables > Actions**
   - Clicca **"New repository secret"**
   - Nome: `GH_PAT`
   - Valore: Personal Access Token (PAT) con scope `repo` completo
   - Come creare PAT: GitHub Settings > Developer settings > Personal access tokens > Tokens (classic) > Generate new token
   - ⚠️ **SENZA QUESTO IL WORKFLOW FALLIRÀ CON MESSAGGIO CHIARO**

### 2. Verificare che il workflow non committi mai su main
   - ✅ **GIÀ FATTO**: Il workflow ora crea SEMPRE una PR draft (mai commit diretto su main)
   - Verifica: `.github/workflows/auto-post.yml` usa `peter-evans/create-pull-request@v6` con `base: main` e `draft: true`

### 3. Testare il workflow manualmente
   - Vai su: **Actions > Auto Post Generation > Run workflow**
   - Seleziona `workflow_dispatch` con date di test
   - Verifica che:
     - ✅ Crea una PR DRAFT (non merge automatico)
     - ✅ Se manca GH_PAT, fallisce con messaggio esplicito
     - ✅ Filtra post di test (category="Test" o tags include "draft")

### 4. Pulire eventuali post di test esistenti (se presenti)
   - Cerca in `calendar/posts.json` entry con `category: "Test"` o `tags: ["draft"]`
   - Se trovi file generati da questi:
     - Rimuovi `src/content/blog/<slug>.mdx`
     - Rimuovi `public/images/<slug>.webp`
   - **Nota**: I file trovati (`usa-test-clinico-*` e `french-farmers-*`) NON sono test, sono post reali

### 5. Verificare anti-duplicati
   - ✅ **GIÀ IMPLEMENTATO**: Lo script ora controlla sia `.mdx` che `.md` prima di generare
   - Se un post esiste già, viene skippato e loggato

---

## 🔒 SICUREZZA IMPLEMENTATA

### Workflow (`.github/workflows/auto-post.yml`)
- ✅ **NON committa mai su main**: sempre PR draft
- ✅ **Validazione token**: fallisce esplicitamente se manca `GH_PAT`
- ✅ **Messaggio chiaro**: errore esplicito su cosa configurare
- ✅ **Input `allow_test`**: flag opzionale per override filtro test

### Script (`scripts/auto-post.mjs`)
- ✅ **Filtro test**: skippa post con `category="Test"` o `tags` include "draft"/"test"
- ✅ **Flag `--allow-test`**: override esplicito per permettere test
- ✅ **Anti-duplicati**: controlla sia `.mdx` che `.md` prima di generare
- ✅ **Logging chiaro**: indica perché un post viene skippato

---

## 📋 FILE MODIFICATI

1. `.github/workflows/auto-post.yml`
   - Aggiunto step di validazione `GH_PAT`
   - Checkout usa `GH_PAT` invece di `GITHUB_TOKEN`
   - PR creation usa solo `GH_PAT` (non fallback a `GITHUB_TOKEN`)
   - Aggiunto input `allow_test` per override filtro test

2. `scripts/auto-post.mjs`
   - Aggiunta funzione `isTestPost()` per filtrare test/draft
   - Filtro applicato prima della generazione (a meno di `--allow-test`)
   - Controllo anti-duplicati esteso a `.md` oltre a `.mdx`
   - Logging migliorato per indicare motivo dello skip

---

## 🚨 IMPORTANTE

- **Il workflow FALLIRÀ** se `GH_PAT` non è configurato (comportamento voluto per sicurezza)
- **Tutte le PR sono DRAFT** per garantire review obbligatoria
- **Post di test sono automaticamente filtrati** (a meno di `--allow-test` esplicito)
- **Nessun commit diretto su main** è possibile tramite questo workflow
