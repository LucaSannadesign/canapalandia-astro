# Runbook rilascio produzione — Canapalandia

Regola: **feature branch e PR → solo Preview. Production → solo `main`, dopo test e revisione.**
Origine: [incidente 2026-10-19](incidents/2026-10-19-produzione-da-feature-branch.md).

Un deployment `READY` o una CI verde non bastano a dire che il sito funziona su tutte le rotte. Sono condizioni necessarie, non sufficienti.

## Flusso in tre fasi

### A. Preview automatica (per ogni push su un branch ≠ `main`)

1. Push del branch, poi PR **draft** verso `main`.
2. Vercel crea la Preview, protetta da Vercel Authentication. La guardia di build non interviene sulle Preview.
3. Check sulla PR: `audit-and-build` (se tocca i path i18n), GitGuardian, Vercel, `test-guard` (se tocca la guardia).

### B. QA e approvazione

- [ ] CI verde **sull'ultimo SHA** della PR (non su uno precedente).
- [ ] Preview verificata: browser autenticato su Vercel, oppure smoke in CI con un bypass secret conservato solo come secret GitHub.
- [ ] Rotte toccate dalla PR verificate a mano, più `/`, `/blog/`, `/cerca/` e i form se coinvolti.
- [ ] PR tolta da draft e approvazione di Luca scritta nella PR.

### C. Rilascio autorizzato e verificato

1. Merge (squash) su `main`: Vercel costruisce Production da `main` e la guardia passa.
2. Il workflow **Production guard** (evento `deployment_status`) deve risultare verde.
3. Controllo sul dominio: `curl -sI https://canapalandia.com/` → 200, più le rotte toccate.
4. Controllo degli errori runtime su Vercel (Logs → Production) nei 10 minuti successivi.
5. Se serve tornare indietro: Instant Rollback **solo** verso il deployment production precedente costruito da `main`, con approvazione.

### Mai

- "Promote to Production" o "Redeploy" su una **Preview** (dashboard, app, API, MCP).
- `vercel --prod`, `vercel deploy --prod`, `vercel promote <preview>`, `vercel redeploy --target production`.
- Promozione o rollback verso un deployment production costruito da un feature branch (es. `dpl_8Wwt…`, `dpl_ATz3…`, `dpl_CTRJ…`).
- Hotfix fuori da `main`: anche in urgenza, branch `hotfix/…` → PR → merge.

## Protezioni nel repository

| Protezione | Dove | Cosa fa | Limite |
|---|---|---|---|
| Guardia di build | `scripts/production-guard.mjs build`, primo comando del `prebuild` | Se `VERCEL_ENV=production` e `VERCEL_GIT_COMMIT_REF ≠ main`, la build fallisce prima di compilare. Il deployment corrente resta online | Funziona solo se il branch contiene la guardia (branch creati da `main` dopo il merge). Non interviene sulle promozioni **senza rebuild** di build production già esistenti. Richiede le System Environment Variables esposte: se mancano, avvisa e non blocca |
| Monitor | `scripts/production-guard.mjs monitor`, workflow `production-guard.yml` | Legge l'ultimo deployment GitHub `Production` registrato da Vercel e verifica che il commit sia contenuto in `main` (API compare). Gira su `deployment_status` e ogni 30 minuti. Sola lettura (`contents: read`, `deployments: read`), nessun secret Vercel | Si basa sui deployment che Vercel registra su GitHub: un deploy da CLI locale potrebbe non comparire. Ritardo fino a ~30 minuti sui cron. GitHub disattiva i cron dopo 60 giorni senza attività nel repository |
| Test | `tests/production-guard.test.mjs` (`pnpm test:production-guard`) | 16 casi con env e API GitHub simulati, compresi gli SHA reali dell'incidente | — |

Exit code dello script: `0` ok · `1` violazione · `2` verifica impossibile (API non raggiungibile, nessun deployment trovato).

### Copertura dei percorsi verso Production

| Percorso | Bloccato da | Rilevato da |
|---|---|---|
| Push su `main` | — (percorso ammesso) | monitor: ok |
| Push su feature branch | Vercel crea solo Preview | — |
| Promote / Redeploy di una Preview (dashboard, app, CLI `promote`, API, MCP) | **guardia di build** (rebuild con env Production) | monitor |
| API `create deployment` con `target=production` e `gitSource` di un feature branch | guardia di build | monitor |
| `vercel --prod` da cartella locale su un branch ≠ `main` | guardia di build (ref ≠ `main` o assente) | monitor solo se Vercel registra il deployment su GitHub |
| `vercel --prod` da `main` locale con modifiche non committate | **non bloccato** | non garantito: va impedito revocando i token non necessari |
| Promote / rollback verso una build production già esistente | non bloccato (nessun rebuild) | monitor, se GitHub riceve un nuovo stato |

Le regole Git (ruleset, PR obbligatoria, check richiesti) proteggono solo `main`. **Nessuna regola GitHub può impedire un'azione eseguita in Vercel**: per quella servono la guardia di build e i permessi Vercel.

## Quando il monitor fallisce

1. Non fare rollback automatici. Aprire il riepilogo del job: commit di produzione, `main`, stato del confronto.
2. Confermare in Vercel → Deployments il deployment **Current**.
3. Seguire il "Piano d'azione per lo stato attuale" dell'[incidente 2026-10-19](incidents/2026-10-19-produzione-da-feature-branch.md#piano-dazione-per-lo-stato-attuale): conservare e regolarizzare via PR, oppure Instant Rollback approvato.
4. Exit `2` (verifica impossibile): rilanciare a mano da Actions → Production guard → Run workflow. Se persiste, controllare a mano.

## Checklist impostazioni remote (da applicare solo con approvazione)

Nessuna di queste impostazioni è stata modificata. Piano attuale: **Vercel Hobby**, repository GitHub **pubblico**.

### Vercel — progetto `canapalandia` (`prj_uZX8oi35FjM8chBwDVUK0NmygU1F`)

| # | Dove | Valore | Perché / conseguenze |
|---|---|---|---|
| V1 | Settings → Environments → Production → Branch Tracking | `main` (solo verifica) | Il comportamento lo conferma, ma l'API MCP non espone il valore. Non va cambiato |
| V2 | Settings → Environment Variables → "Automatically expose System Environment Variables" | **attivo** | Serve alla guardia di build. Se è spento la guardia avvisa ma non blocca |
| V3 | Settings → Deployment Protection | lasciare **Standard Protection** (`all_except_custom_domains`, attuale) | Le Preview restano private. Un bypass per automazione va creato solo se serve uno smoke in CI, e conservato solo come secret GitHub |
| V4 | Account Settings → Tokens | censire, revocare quelli non usati, impostare una scadenza, un token per strumento | Su Hobby i token hanno pieni poteri (deploy, promote, rollback). Ogni strumento con un token revocato smette di funzionare: verificare prima chi lo usa |
| V5 | Integrazioni e connettori con accesso Vercel (connettore Vercel di claude.ai, eventuali scenari Make o altri assistenti) | disconnettere quelli non necessari, oppure vietare promote/redeploy nelle loro istruzioni | Il connettore Vercel espone strumenti di scrittura (create deployment, promote, rollback). È un percorso possibile verso Production |
| V6 | Activity (dashboard del team) | consultare l'evento delle 15:52 UTC del 2026-10-19 | Unico modo per attribuire il redeploy. Via API la lettura risponde 403 |
| V7 | Settings → Deployment Checks | facoltativo, **verificare la disponibilità su Hobby** | Blocca l'assegnazione dei domini finché i check GitHub del commit non passano. Non impedisce la promozione di un branch sbagliato con CI verde: non sostituisce la guardia |
| V8 | Notifiche account (email/push sui deployment production) | attivare se disponibili, da verificare | Avviso immediato a ogni nuovo deployment production |

Non disponibili su Hobby: Rolling Releases e rollback verso deployment arbitrari (Pro), ruoli di team/RBAC (Pro). Audit log del team: da verificare, l'API eventi risponde 403.

### GitHub — `LucaSannadesign/canapalandia-astro`

| # | Dove | Valore | Perché / conseguenze |
|---|---|---|---|
| G1 | Settings → Rules → ruleset `11953452` su `main` (oggi: `deletion`, `non_fast_forward`) | aggiungere **Require a pull request before merging**, approvazioni richieste `0` | Con un solo maintainer non è possibile approvare la propria PR: `0` impone comunque il passaggio da PR. Blocca i push diretti su `main`, compresi quelli degli script (gli attuali workflow creano PR e non fanno push diretti) |
| G2 | Stesso ruleset → Require status checks | **non** richiedere check con filtro `paths` (`audit-and-build`) | Un check richiesto che non parte lascia la PR bloccata in "Expected". In alternativa: togliere il filtro `paths` da `i18n-pr-check.yml` e poi richiederlo (minuti gratuiti sui repository pubblici) |
| G3 | Stesso ruleset → Bypass list | `Repository admin`, solo "for pull requests" | Lascia una via d'emergenza tracciata senza riaprire i push diretti |
| G4 | Settings → Actions → General → Workflow permissions | `Read repository contents` | Riduce i permessi predefiniti. `auto-post` dichiara già i propri permessi e usa `GH_PAT` |
| G5 | Profilo → Settings → Notifications → Actions | "Notify on failed workflows only", via email | È l'alert del monitor. Le notifiche dei cron vanno a chi ha modificato per ultimo il cron (dopo il merge, Luca) |
| G6 | Settings → Environments → `Production` | **non** affidarsi ai required reviewers | Vercel non attende le approvazioni degli environment GitHub: sarebbe una protezione solo apparente |

## Verifiche locali

```bash
pnpm test:production-guard                     # 16 test, nessuna rete
node scripts/production-guard.mjs build        # in locale: "guardia non applicata"
VERCEL=1 VERCEL_ENV=production VERCEL_GIT_COMMIT_REF=feature/x node scripts/production-guard.mjs build   # exit 1
pnpm guard:production                          # monitor reale, sola lettura (dietro proxy: NODE_USE_ENV_PROXY=1)
```
