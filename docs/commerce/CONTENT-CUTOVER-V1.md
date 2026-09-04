# Canapalandia Commerce — Content Cutover V1

Stato: pre-launch / staging only.

Questa checklist impedisce che lo shop venga pubblicato mentre il sito continua a dichiarare che Canapalandia non vende alcun prodotto.

## Hard gate

Prima del GO production, tutti i punti sotto devono risultare verificati nello staging. Nessuna modifica va applicata a `main` in anticipo.

### 1. Home — `src/pages/index.astro`

Testo legacy individuato nella nota redazionale:

> Canapalandia è un progetto informativo: non vendiamo prodotti e non forniamo indicazioni mediche.

Sostituzione prevista al cutover:

> Canapalandia è un progetto editoriale indipendente. Non vendiamo cannabis, CBD o altri prodotti destinati al consumo e non forniamo indicazioni mediche. L'eventuale merchandise ufficiale è una linea separata dai contenuti editoriali e viene gestita tramite il provider indicato nello shop.

Gate:
- [ ] patch applicata nello staging;
- [ ] copy QA;
- [ ] nessun claim medico/commerciale ambiguo;
- [ ] produzione aggiornata solo insieme al GO shop.

### 2. FAQ — `/faq-domande-frequenti/`

Il contenuto legacy dinamico contiene `Non vendiamo nulla`.

Soluzione preparata: route statica `src/pages/faq-domande-frequenti.astro`, che deve avere priorità sul catch-all legacy e distinguere:
- progetto editoriale;
- merchandise ordinario, non cannabis/CBD da consumo;
- storefront provider;
- `sprd.net AG` come controparte dell'ordine quando si usa Spreadshop.

Gate:
- [ ] route statica compilata nello staging;
- [ ] vecchia frase assente;
- [ ] noindex staging confermato.

### 3. Chi siamo

File: `src/pages/chi-siamo/index.astro`.

Staging draft già preparato: rimuove `senza venderti un prodotto` e distingue magazine e merchandise.

- [x] draft staging preparato;
- [x] build Astro passata nel batch staging 799fe9f;
- [ ] legal/editorial review finale;
- [ ] production cutover insieme allo shop.

### 4. Missione

File: `src/pages/chi-siamo/missione.astro`.

Staging draft già preparato: sostituisce `Non siamo un negozio` con la separazione fra informazione e merchandise.

- [x] draft staging preparato;
- [x] build Astro passata nel batch staging 799fe9f;
- [ ] legal/editorial review finale;
- [ ] production cutover insieme allo shop.

### 5. Termini

File: `src/pages/termini-e-condizioni.astro`.

Staging draft già preparato con sezione `Merchandise e storefront del provider`.

- [x] draft staging preparato;
- [x] build Astro passata nel batch staging 799fe9f;
- [ ] legal review finale;
- [ ] verificare provider effettivamente scelto e ragione sociale prima del GO;
- [ ] rimuovere la dicitura `Bozza staging commerce` al cutover production.

## Indicizzazione

Durante tutto il pre-launch:
- `/shop/` deve restare `noindex,nofollow,noarchive`;
- il progetto staging `.vercel.app` resta noindex;
- `/shop/` non entra nelle sitemap production;
- nessun cambio DNS o dominio shop viene effettuato prima del GO.

## Release rule

`HOME COPY + FAQ + CHI SIAMO + MISSIONE + TERMINI + SHOP` sono un unico batch editoriale di pubblicazione. Nessuno di questi elementi deve essere promosso singolarmente su `main`.
