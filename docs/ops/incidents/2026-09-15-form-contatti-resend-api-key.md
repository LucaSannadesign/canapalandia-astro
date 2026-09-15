# Incidente
Data: 2026-09-15

Titolo: form Contatti e Collaborazioni non inviano email (Resend 400)
Classificazione: C — credenziali (nessun difetto di codice)

## Sintomo

Il form pubblico `https://canapalandia.com/contatti/` (e `/en/contact/`), dopo il submit,
portava a `https://canapalandia.com/api/contatti/` con risposta HTTP 500
"Errore durante l'invio". Nessuna email arrivava a `info@canapalandia.com`.

Il form Collaborazioni (`/api/collaborazione/`) condivide la stessa dipendenza ed era
quindi impattato allo stesso modo.

Nota: aprire `/api/contatti/` nel browser esegue una GET → 404 atteso
(l'endpoint espone solo POST). Non è parte del guasto.

## Causa

La `RESEND_API_KEY` configurata su Vercel (progetto `canapalandia`, Production + Preview)
apparteneva a una configurazione/account Resend precedente ed era vincolata a un dominio
non più valido per quella chiave.

Il dominio `canapalandia.com` nell'account Resend attualmente usato era invece correttamente
VERIFIED, con sending enabled e record DKIM/SPF/MX verificati.

## Evidenza

Runtime log Vercel, deployment `dpl_3Pa4Xsqdy42L6rtTvm6o6HKXBm2f`
(orari UTC: 10:00:21, 10:00:33, 10:04:45):

```
POST /api/contatti/ 500
[Contatti] Resend error: 400 {"statusCode":400,"message":"The associated domain with your API key is not verified. Please, create a new API key with full access or with a verified domain."}
```

Il ramo `Configurazione email mancante` non compariva → la variabile era presente;
il rifiuto proveniva da Resend.

Verifiche a supporto:
- DNS Cloudflare pubblicati: `resend._domainkey` (DKIM), `send.` MX + SPF (amazonses, eu-west-1),
  `resend-domain-verification` TXT sul dominio radice.
- Resend: dominio `canapalandia.com` VERIFIED, sending enabled, DKIM/SPF/MX verificati.
- Git: nessuna modifica alla logica di invio dopo `824f1ef` (2026-08-31, migrazione
  Formspree → Resend); `453649b` (2026-09-12) ha solo localizzato risposte/redirect.

## Sistemi coinvolti

| Livello | Dettaglio |
|---|---|
| Frontend | `src/pages/contatti.astro`, `src/pages/en/contact.astro`, `src/pages/collabora-con-canapalandia.astro`, `src/pages/en/collaborate.astro` (form POST nativi) |
| Endpoint | `src/pages/api/contatti.ts`, `src/pages/api/collaborazione.ts` (Astro 6, `@astrojs/vercel` serverless) |
| Hosting | Vercel, progetto `canapalandia` |
| Provider email | Resend, account condiviso che contiene anche PreventivoDentale; dominio `canapalandia.com`, region eu-west-1 |
| DNS | Cloudflare |
| Destinatario | `info@canapalandia.com` (casella su Purelymail) |

## Modifica effettuata

Una sola modifica di configurazione applicativa, nessuna modifica di codice o DNS:

1. Durante la diagnosi è stata generata una prima chiave Resend dedicata a Canapalandia, ma il suo valore è comparso in chat ed è stata quindi considerata esposta e non usata in produzione.
2. Luca ha creato manualmente una nuova API key dedicata, con `Sending access` limitato al dominio `canapalandia.com`, senza condividerne il valore in chat.
3. Aggiornato il valore di `RESEND_API_KEY` su Vercel per Production e Preview — eseguito da Luca.
4. Redeploy di produzione completato.

La vecchia chiave non è stata revocata durante l'incidente: la revoca resta un'attività separata, da eseguire solo dopo identificazione certa della chiave obsoleta.

## Deployment

| | Deployment | Note |
|---|---|---|
| Prima | `dpl_3Pa4Xsqdy42L6rtTvm6o6HKXBm2f` (`canapalandia-4akuahp3n-…vercel.app`) | chiave vecchia, errore 400 |
| Dopo | `dpl_HQFkMNE2eGGkBAWvrbSeSkQmz9tB` (`canapalandia-k58poeu0n-…vercel.app`) | creato 2026-09-15 11:03:43 UTC, READY, produzione su `canapalandia.com` e `www.canapalandia.com` |

## Test eseguiti

Pre-fix (produzione, curl con `Origin: https://canapalandia.com`, equivalente al form):

| Caso | Risultato |
|---|---|
| Payload valido | 500 "Errore durante l'invio" + log Resend 400 |
| Campo mancante | 400 "Dati mancanti" |
| Email non valida | 400 "Email non valida" |
| Privacy mancante | 400 "Dati mancanti" |
| Honeypot compilato | 303 → `/contatti/?sent=1` |
| GET / PUT | 404 |
| POST senza header Origin | 403 (protezione CSRF Astro, comportamento atteso) |

Post-fix (deployment `dpl_HQFk…`, 2026-09-15 UTC):

| Endpoint | Ora | HTTP | Redirect | Resend |
|---|---:|---:|---|---|
| `POST /api/contatti/` (`[TEST] post-rotation`) | 11:18:48 | 303 | `/contatti/?sent=1` | delivered |
| `POST /api/collaborazione/` (`[TEST] post-rotation`) | 11:18:51 | 303 | `/grazie-collaborazione/` | delivered |
| `POST /api/contatti/` (`[TEST] collaudo post-rotation`) | 14:14:01 | 303 | `/contatti/?sent=1` | delivered |
| `POST /api/collaborazione/` (`[TEST] collaudo post-rotation`) | 14:14:04 | 303 | `/grazie-collaborazione/` | delivered |

Nessun log error/fatal/warning sul nuovo deployment nella finestra di test e nessun nuovo
`[Contatti] Resend error: 400`.

La dashboard/API Resend ha confermato stato `delivered` verso `info@canapalandia.com` per tutte
e quattro le email di test sopra elencate.

## Risultato

**RISOLTO E VERIFICATO END-TO-END**.

Percorso verificato:

`form → endpoint Vercel → RESEND_API_KEY ruotata → Resend → delivered a info@canapalandia.com`

Nessuna modifica applicativa è stata necessaria.

## Rollback

- Non esiste un rollback utile: il deployment precedente e il valore precedente della
  chiave riportano esattamente al guasto.
- In caso di problemi con la chiave attuale: identificare prima l'account Resend corretto,
  generare una nuova chiave dedicata con minimo privilegio, aggiornare `RESEND_API_KEY`
  su Vercel, eseguire un solo redeploy e ripetere i test end-to-end.

## Lezione / prevenzione

- Un errore del provider su dominio/chiave è configurazione, non codice: nessun fix
  applicativo era necessario.
- Il messaggio Resend "domain not verified" può riferirsi al dominio **associato alla chiave**
  (Domain ID / account precedente), non allo stato attuale del dominio: verificare
  sempre in quale account è stata creata la chiave in uso, prima di concludere.
  La prima diagnosi di questo incidente ("dominio non verificato") era imprecisa ed è
  stata corretta dopo la verifica diretta dell'account.
- Se un secret compare in chat o log, considerarlo compromesso e non usarlo in produzione.
- Con account Resend condivisi tra più progetti, usare chiavi dedicate per progetto e minimo privilegio.
- `vercel env ls` mostra la data di creazione, non di ultimo aggiornamento: non usarla
  come prova dell'avvenuta rotazione; verificare con deployment nuovo + test.
- Pending: identificare con certezza la vecchia chiave e valutarne la revoca con HUMAN_GATE.
