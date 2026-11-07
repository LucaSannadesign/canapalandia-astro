# Incidente
Data: 2026-10-19 (rilevato) · Ticket: #122

Titolo: commit di feature branch / PR draft servito su `canapalandia.com`
Classificazione: B — processo di rilascio (nessun difetto del codice di build)
Gravità: **alta**. Codice non revisionato e non unito a `main` è stato pubblico. L'episodio si è ripetuto 3 volte in 10 giorni.

Legenda: **V** = verificato con dati (Vercel API, GitHub API, transcript, GET pubbliche) · **H** = ipotesi non confermata dai log.

## Sintomo

Il deployment `dpl_CTRJzQ1yHa6DhtQXiVTKaJ5Jo5ww` è `READY` con target `production`.
È stato costruito da `claude/optimistic-hypatia-vkcakt@c36293b` (PR #121, draft) e ha in alias
`canapalandia.com` e `www.canapalandia.com`. `main` è fermo a `be52d4c`. **V**

Alle 16:01 UTC le GET pubbliche mostrano il comportamento della PR #121: `/?s=cbd` risponde 301 verso `/cerca/?q=cbd`, il form di `/blog/` invia a `/cerca/`. **V**

## Cronologia (UTC)

| Ora | Evento | Fonte |
|---|---|---|
| 15:08 | Push di `7c5f0f7` su `claude/optimistic-hypatia-vkcakt`, Preview Vercel | V GitHub Deployments |
| 15:39:04 | Push di `c36293b`, Preview `dpl_HGM7V1ctC7NxV2w18Y7HfigLAmGD` (target `null`, protetta SSO) | V Vercel |
| 15:40–15:52 | La sessione Claude della PR #121 non esegue azioni (attende la CI) | V transcript |
| **15:52:40** | Creato `dpl_CTRJ…`: `source=redeploy`, `target=production`, branch della PR, cache ripristinata dall'ultimo production (`dpl_4g4iwz…`) | V Vercel build log |
| 15:53:35 | `dpl_CTRJ…` READY, domini di produzione assegnati | V Vercel |
| 15:53:38 | `vercel[bot]` registra su GitHub il deployment `Production` per `c36293b` | V GitHub Deployments |
| 15:52:53 | La sessione della PR #121 nota una build che non ha avviato e verifica che sul branch non ci sono push nuovi | V transcript |

## Episodi precedenti con lo stesso schema

Tutti `source=redeploy`, `target=production`, creati da una Preview già esistente dello stesso SHA. **V**

| Deployment production | Branch @ SHA | Preview di origine | Online | Unito a `main` |
|---|---|---|---|---|
| `dpl_8WwtKVyX76VzMiJSwvmWiYeVAZpN` (2026-10-09 12:11:33) + `dpl_3hypa…` annullato 16 s dopo | `work/can-261006-hemp-protein-pillar@c9a7936` | `dpl_C8S2…` (09:47) | ~32 h 45 min, fino al 2026-10-10 20:57 | **No**: il contenuto CAN-261006 è poi sparito dalla produzione |
| `dpl_ATz3FmTBGkTTRhi9MobvMkuD91Hs` (2026-10-10 20:57:36) | `feat/home-editorial-freshness-20261010@2d56940` | `dpl_ARsL…` (20:53) | 9 s, sostituito da `main@ced3df2` | Sì, come squash `ced3df2` |
| `dpl_CTRJzQ1yHa6DhtQXiVTKaJ5Jo5ww` (2026-10-19 15:52:40) | `claude/optimistic-hypatia-vkcakt@c36293b` | `dpl_HGM7…` (15:39) | in corso | No (PR #121 draft) |

## Causa

### Accertata

1. **Il meccanismo è una promozione o un redeploy manuale di una Preview verso Production**, non un push.
   Vercel registra `source=redeploy` e ricostruisce lo stesso commit con le variabili Production. La documentazione Vercel conferma: promuovere una Preview "triggers a new production build with production environment variables". **V**
2. **Il Production Branch funziona come atteso:** i push sui feature branch generano solo Preview (`target=null`), i push su `main` generano Production. Il valore dell'impostazione non è leggibile via API MCP (risposta ridotta), ma il comportamento lo conferma. **V** (indiretto)
3. **Nessun workflow del repository fa deploy.** I 4 workflow (`auto-post`, `auto-share-telegram`, `i18n-pr-check`, `social-agent`) non chiamano Vercel. **V**
4. **Niente impediva il percorso:**
   - la build non verificava il branch;
   - il piano Vercel è Hobby;
   - su GitHub, `main` ha solo un ruleset con `deletion` e `non_fast_forward` (nessuna PR obbligatoria, nessun check richiesto). In ogni caso, una regola Git non può intervenire su una promozione fatta in Vercel. **V**
5. **La sessione Claude della PR #121 non ha eseguito il redeploy.** Tra 15:40:16 e 15:52:50 non ha prodotto eventi, il suo transcript non contiene chiamate a Vercel e ha segnalato la build come inattesa. **V**
   L'unica altra sessione Claude Code attiva in quel momento (issue #39, altro repository) non contiene chiamate a Vercel né riferimenti a Canapalandia. **V**

### Non accertato: chi o cosa ha avviato il redeploy

- Vercel attribuisce tutti i deployment all'utente `lucasannadesign`, anche quelli Git. Il campo `creator` quindi non distingue dashboard, CLI, API token o agente. **V**
- L'API eventi del team risponde 403 (`GET /v3/events`): il log delle attività non è leggibile con questo accesso. **V**
- Canali possibili, da verificare in Vercel → Activity e nei token:
  - azione manuale in dashboard o app ("Promote to Production" / "Redeploy" su una Preview);
  - `vercel promote` / `vercel redeploy` da CLI locale;
  - un agente con connettore Vercel non coperto da questa analisi (sessioni Cowork, altri assistenti, scenari Make). **H**
- L'episodio del 10-09 (due redeploy a 16 s, il secondo annullato) e quello del 10-10 (redeploy 9 s prima del merge) fanno pensare ad azioni interattive. Restano ipotesi **H**: senza log non si attribuisce l'azione a nessuno.

## Impatto

- Codice non revisionato e non unito a `main` è stato pubblico. I check della PR erano parziali: `audit-and-build` era ancora in coda. **V**
- Al momento il sito risponde 200 sulle rotte verificate (`/`, `/cerca/`, `/blog/`), ma è un controllo a campione, non una verifica funzionale completa. **V** (parziale)
- 10-09/10-10: per circa 33 h la produzione ha servito contenuto editoriale (CAN-261006) che poi è stato rimosso senza passare da `main`. È un'oscillazione di contenuto con possibile effetto SEO. Da valutare in sede editoriale. **V** (fatto) / **H** (effetto SEO)
- Divergenza Git/produzione: quello che è in produzione non è ricostruibile da `main`. Un rollback automatico, la prossima build di `main` o un audit avrebbero dato risultati incoerenti. **V**

## Piano d'azione per lo stato attuale

Nessuna azione è stata eseguita. Ognuna richiede l'approvazione di Luca.

### 1. Confermare cosa è in produzione (sola lettura)

- Vercel → Project `canapalandia` → Deployments → filtro Production: il deployment con badge **Current** deve essere `dpl_CTRJ…`.
- `node scripts/production-guard.mjs monitor` (in locale serve `NODE_USE_ENV_PROXY=1` solo dietro proxy): oggi restituisce exit 1, con `c36293b NON contenuto in main`.
- GET di controllo: `curl -sI 'https://canapalandia.com/?s=cbd'` → 301 = codice della PR #121; 200 = codice di `main`.

### 2. Opzioni

| Opzione | Cosa comporta | Impatto | Quando sceglierla |
|---|---|---|---|
| **A. Conservare e regolarizzare** | Revisione della PR #121, attesa di `audit-and-build`, merge su `main`. Vercel rilascia `main` | Nessun disservizio. Codice non revisionato online finché non avviene il merge | Revisione possibile in giornata e nessun difetto noto |
| **B. Instant Rollback** a `dpl_4g4iwzWDs2j5VsnsiWQGT5oBb5tu` (`main@be52d4c`) | Dashboard → Deployments → `dpl_4g4iwz…` → Instant Rollback. Sul piano Hobby è consentito solo verso il deployment production immediatamente precedente, che è proprio questo (`isRollbackCandidate: true`) | Tornano i difetti di ricerca segnalati in #120 (`/?s=` → homepage 200, ricerca client su `/blog/`). Le 301 già in cache dei browser puntano a `/cerca/`, che esiste anche su `main`. Le variabili d'ambiente tornano quelle di quel build | La PR #121 non si può revisionare in tempi brevi, oppure emergono errori |
| C. Nessuna azione | — | La divergenza resta e il monitor resta rosso | Sconsigliata |

Prima di un rollback, verificare nel dialog di Vercel se l'assegnazione automatica dei domini di produzione viene sospesa. In quel caso il merge successivo su `main` non va online finché non si fa "Undo Rollback" o una promozione esplicita: da verificare, non confermato dalla documentazione consultata.

### 3. Quando serve l'intervento umano

Sempre, per scegliere tra A e B. Con urgenza se compaiono 5xx, errori nei form (`/api/contatti`, `/api/collaborazione`, `/api/newsletter`) o nella sitemap.
Non promuovere né fare rollback verso deployment production costruiti da feature branch (`dpl_8Wwt…`, `dpl_ATz3…`, `dpl_CTRJ…`): sono già build Production e una promozione senza rebuild **non passa dalla guardia di build**.

## Protezioni preparate (PR draft, branch `claude/trusting-tesla-ov5c3g`)

- `scripts/production-guard.mjs build` nel `prebuild`: una build Production su Vercel che non arriva da `main` fallisce prima di compilare e il deployment corrente resta online. Avrebbe bloccato tutti e tre gli episodi.
- `scripts/production-guard.mjs monitor` + `.github/workflows/production-guard.yml`: verifica in sola lettura, sull'evento `deployment_status` e ogni 30 minuti. Se il commit Production non è contenuto in `main`, il job fallisce e GitHub invia una notifica. Rileva tutti e tre gli episodi: verificato sugli SHA reali.
- Runbook e checklist delle impostazioni: [production-release-runbook.md](../production-release-runbook.md).

## Prevenzione (da approvare)

Vedi la checklist nel runbook: impostazioni Vercel e GitHub, revisione dei token e dei connettori con permessi di deploy, notifiche.
