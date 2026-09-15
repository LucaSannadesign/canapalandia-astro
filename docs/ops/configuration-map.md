# Configuration map — Canapalandia

Mappa NON sensibile delle dipendenze esterne. Mai inserire valori di credenziali.
Ultimo aggiornamento: 2026-09-15.

Legenda fonte: **V** = verificato (CLI/log/DNS/codice/provider) · **L** = dichiarato da Luca · **?** = da verificare.

## Hosting

| Voce | Valore | Fonte |
|---|---|---|
| Provider | Vercel | V |
| Team | `lucasannadesigns-projects` (`team_MqJGYZfPstPQtczOfKIs62HE`) | V |
| Progetto | `canapalandia` (`prj_uZX8oi35FjM8chBwDVUK0NmygU1F`) | V |
| Domini produzione | `canapalandia.com`, `www.canapalandia.com` | V |
| Framework | Astro 6, `output: "server"`, adapter `@astrojs/vercel` (serverless) | V |
| Branch produzione | `main` | V |

## DNS / dominio

| Voce | Valore | Fonte |
|---|---|---|
| DNS | Cloudflare (`demi`/`lee.ns.cloudflare.com`) | V |
| Mail in ingresso | Purelymail (MX `mailserver.purelymail.com`) | V |
| Mail in uscita (transazionale) | Resend via `send.canapalandia.com` (Amazon SES eu-west-1) | V |
| DMARC | `p=none`, report Cloudflare | V |

## Servizi e variabili

| Servizio | Provider | Account/Workspace | Environment Vercel | Variabile | Usata da | Fonte |
|---|---|---|---|---|---|---|
| Email form | Resend | account condiviso con PreventivoDentale; dominio `canapalandia.com` (VERIFIED, eu-west-1); chiave dedicata Canapalandia con Sending access | Production, Preview | `RESEND_API_KEY` | `src/pages/api/contatti.ts`, `src/pages/api/collaborazione.ts` | V codice/env/provider · L account |
| Newsletter | Buttondown | ? | Development, Preview, Production | `BUTTONDOWN_API_KEY` | `src/pages/api/newsletter.ts` | V codice/env · ? account |
| Analytics | Google Analytics 4 | ? | Development, Preview, Production | `PUBLIC_GA_ID` | `src/components/GATag.astro`, `src/components/PrivacyConsent.astro` | V codice/env · ? account |
| AI (Ribaltatore, auto-post) | OpenAI | ? | Development, Preview, Production (+ secret GitHub Actions) | `OPENAI_API_KEY` | `src/pages/api/ribalta-ai.ts`, `scripts/auto-post.mjs`, `.github/workflows/auto-post.yml` | V codice/env · ? account |
| Database | Supabase | ? | Development, Preview, Production | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabaseServer.ts`, `src/pages/frasi-ribaltate.astro` | V codice/env · ? account |
| Pagamenti | Stripe | ? | Development, Preview, Production | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | nessun riferimento trovato in `src/`, `scripts/`, `netlify/`, `.github/` | V env · ? utilizzo |
| Feature flag Drop 001 | — (non secret) | — | file `.env.production` nel repo | `DROP_001_TEST_ENABLED` | nessun riferimento trovato con grep testuale | V file · ? utilizzo |

## Destinatari email

| Flusso | From | To | Reply-To |
|---|---|---|---|
| Contatti | `noreply@canapalandia.com` | `info@canapalandia.com` | email utente |
| Collaborazioni | `noreply@canapalandia.com` | `info@canapalandia.com` | email utente |

## Note operative

- Le variabili d'ambiente Vercel vengono lette al deploy: dopo una modifica serve un redeploy.
- Un rollback Vercel a un deployment precedente ripristina anche i valori env di quel build.
- `vercel env ls` mostra la data di creazione della variabile, non l'ultimo aggiornamento.
- Le route `/api/*` rifiutano POST senza header `Origin` same-site (403, CSRF Astro).
- Il nome/valore delle API key ruotabili non è fonte di verità nel repository: prima di una futura rotazione verificare account, dominio e chiave attualmente associata direttamente nel provider e su Vercel.

## Incidenti collegati

- [2026-09-15 — Form contatti, Resend API key](incidents/2026-09-15-form-contatti-resend-api-key.md)
