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

Il dominio `canapalandia.com` su Resend era invece correttamente VERIFIED
(verifica effettuata da Luca direttamente nell'account Resend).

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
- Resend (verificato da Luca): dominio VERIFIED, sending enabled, DKIM/SPF/MX verificati.
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

Una sola modifica di configurazione, nessuna modifica di codice/DNS/Resend-dominio:

1. Creata in Resend una nuova API key `canapalandia-production`
   (Sending access, dominio `canapalandia.com`) — eseguito da Luca.
2. Aggiornato il valore di `RESEND_API_KEY` su Vercel per Production e Preview — eseguito da Luca.
3. Redeploy di produzione — eseguito da Luca.

La vecchia chiave NON è stata revocata (decisione rimandata a dopo la verifica).

## Deployment

| | Deployment | Note |
|---|---|---|
| Prima | `dpl_3Pa4Xsqdy42L6rtTvm6o6HKXBm2f` (`canapalandia-4akuahp3n-…vercel.app`) | chiave vecchia, errore 400 |
| Dopo | `dpl_HQFkMNE2eGGkBAWvrbSeSkQmz9tB` (`canapalandia-k58poeu0n-…vercel.app`) | creato 2026-09-15 11:03:43 UTC, READY, alias `canapalandia.com` e `www.canapalandia.com` verificati con `vercel inspect` |

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

| Endpoint | Ora | HTTP | Redirect | Log runtime |
|---|---|---|---|---|
| `POST /api/contatti/` (`[TEST] post-rotation`) | 11:18:48 | 303 | `/contatti/?sent=1` | nessun errore |
| `POST /api/collaborazione/` (`[TEST] post-rotation`) | 11:18:51 | 303 | `/grazie-collaborazione/` | nessun errore |

Nessun log error/fatal/warning sul nuovo deployment nella finestra di test.
Il 303 viene emesso dal codice solo se Resend risponde `ok`.
Ricezione email in `info@canapalandia.com`: verifica in carico a Luca.
Dashboard Resend (log invii): non consultata da Claude.

## Risultato

RISOLTO E VERIFICATO (percorso form → endpoint → Resend → redirect di successo),
con conferma di ricezione email demandata a verifica umana.

## Rollback

- Non esiste un rollback utile: il deployment precedente e il valore precedente della
  chiave riportano esattamente al guasto.
- In caso di problemi con la nuova chiave: generare un'altra chiave nell'account Resend
  corretto, aggiornare `RESEND_API_KEY` su Vercel, un solo redeploy, ripetere i test.

## Lezione / prevenzione

- Un errore del provider su dominio/chiave è configurazione, non codice: nessun fix
  applicativo era necessario.
- Il messaggio Resend "domain not verified" può riferirsi al dominio **associato alla chiave**
  (Domain ID / account precedente), non allo stato attuale del dominio: verificare
  sempre in quale account è stata creata la chiave in uso, prima di concludere.
  La prima diagnosi di questo incidente ("dominio non verificato") era imprecisa ed è
  stata corretta dopo la verifica diretta dell'account.
- Account Resend condiviso tra più progetti: usare chiavi dedicate per progetto con
  nome esplicito (`canapalandia-production`) e minimo privilegio.
- `vercel env ls` mostra la data di creazione, non di ultimo aggiornamento: non usarla
  come prova dell'avvenuta rotazione; verificare con deployment nuovo + test.
- Pending: valutare la revoca della vecchia chiave nell'account precedente (HUMAN_GATE).
