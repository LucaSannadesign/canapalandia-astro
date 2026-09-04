# Canapalandia Commerce — Content Cutover V1

Stato: pre-launch / internal branch only.

Questa checklist impedisce che lo shop venga pubblicato mentre il sito continua a dichiarare che Canapalandia non vende alcun prodotto.

## Hard gate

Prima del GO production, tutti i punti sotto devono risultare verificati nello staging. Nessuna modifica va applicata a `main` in anticipo.

### 1. Home — `src/pages/index.astro`

Testo legacy ancora presente nel branch commerce:

> Canapalandia è un progetto informativo: non vendiamo prodotti e non forniamo indicazioni mediche.

Sostituzione prevista al cutover:

> Canapalandia è un progetto editoriale indipendente. Non vendiamo cannabis, CBD o altri prodotti destinati al consumo e non forniamo indicazioni mediche. L'eventuale merchandise ufficiale è una linea separata dai contenuti editoriali e viene gestita tramite il provider indicato nello shop.

Gate:
- [ ] patch Home applicata solo nel batch finale;
- [ ] copy QA;
- [ ] nessun claim medico/commerciale ambiguo;
- [ ] produzione aggiornata solo insieme al GO shop.

### 2. FAQ — `/faq-domande-frequenti/`

Route statica commerce già preparata in `src/pages/faq-domande-frequenti.astro` e separa:
- progetto editoriale;
- merchandise ordinario, non cannabis/CBD da consumo;
- storefront provider;
- `sprd.net AG` come controparte dell'ordine quando si usa Spreadshop.

Gate:
- [x] route statica preparata nel branch commerce;
- [x] vecchia frase `Non vendiamo nulla` rimossa dalla nuova route;
- [ ] QA finale nel batch di release;
- [ ] noindex staging confermato al momento del test finale.

### 3. Chi siamo — `src/pages/chi-siamo/index.astro`

- [x] `senza venderti un prodotto` rimosso nel branch commerce;
- [x] distinzione magazine / merchandise introdotta;
- [x] revisione editoriale preliminare passata;
- [ ] production cutover insieme allo shop.

### 4. Missione — `src/pages/chi-siamo/missione.astro`

- [x] `Non siamo un negozio` rimosso nel branch commerce;
- [x] separazione informazione / merchandise introdotta;
- [x] revisione editoriale preliminare passata;
- [ ] production cutover insieme allo shop.

### 5. Termini — `src/pages/termini-e-condizioni.astro`

- [x] sezione `Merchandise e storefront del provider` preparata;
- [x] ruolo di `sprd.net AG` esplicitato quando Spreadshop è il provider effettivo;
- [ ] confermare provider e ragione sociale al GO;
- [ ] rimuovere `Bozza staging commerce` nel batch finale;
- [ ] legal review finale.

## Scan legacy

Scan repository eseguita: i conflitti reali individuati sul `main` sono limitati a:
- Home: `non vendiamo prodotti`;
- Chi siamo: `senza venderti un prodotto`;
- Missione: `Non siamo un negozio` / `Non vendiamo direttamente prodotti`.

Nel branch commerce gli ultimi due sono già risolti. La Home resta intenzionalmente bloccata fino al cutover coordinato.

## Gate automatico

Comando:

```bash
npm run commerce:content-gate
```

Il controllo blocca la release se trova ancora:
- la frase legacy della Home;
- `senza venderti un prodotto`;
- `Non siamo un negozio`;
- `Non vendiamo direttamente prodotti`;
- `Bozza staging commerce`.

Il comando è incluso in:

```bash
npm run commerce:release-qa
```

## Indicizzazione

Durante tutto il pre-launch:
- `/shop/` deve restare `noindex,nofollow,noarchive`;
- il progetto staging `.vercel.app` resta noindex;
- `/shop/` non entra nelle sitemap production;
- nessun cambio DNS o dominio shop viene effettuato prima del GO.

## Release rule

`HOME COPY + FAQ + CHI SIAMO + MISSIONE + TERMINI + SHOP` sono un unico batch editoriale di pubblicazione. Nessuno di questi elementi deve essere promosso singolarmente su `main`.
