# Revisione finale legacy YMYL / legale — 31/08/2026

Terzo passaggio dell'audit editoriale, nato dal QA live delle PR #43 e #44. L'obiettivo è intercettare residui pubblici con claim sanitari, legali o commerciali forti e ridurre la quantità di informazione storica che rimane esposta nei metadata delle pagine ritirate.

## Nuovi slug messi in quarantena

1. `nuovo-partner-canapalandia-nordic-oil` — contenuto affiliato con affermazioni assolute su legalità, THC-free e prodotti acquistabili/non acquistabili in Italia.
2. `cannabis-light-e-corte-di-cassazione-il-decreto-sicurezza-traballa` — attribuisce alla Cassazione un rinvio di costituzionalità che non risulta; il quadro successivo mostra questioni sollevate da giudici di merito e una Cassazione 15691/2026 che non accoglie quelle censure.
3. `canapa-light-sentenza-ue-decreto-sicurezza-2025` — presenta come consolidati effetti giuridici e una procedura d'infrazione UE che, nelle fonti verificate, non risultava avviata nei termini descritti.
4. `benefici-olio-di-semi-di-canapa-salute-pelle` — claim su acne, rosacea, eczema, psoriasi, collagene, infiammazione e anti-aging formulati come effetti/trattamenti.
5. `realizzare-cosmetici-canapa-casa` — ricette cosmetiche fai-da-te con claim dermatologici e indicazioni di conservazione non adeguatamente validate.
6. `olio-di-canapa-proprieta-benefici-usi-in-cucina` — claim su LDL, rischio cardiovascolare, artrite, immunità, memoria e Alzheimer presentati con eccessiva certezza.
7. `canapa-salute-cardiovascolare-cosa-dice-scienza` — claim cardioprotettivi e di pressione/interazioni più una regola italiana sul CBD/THC semplificata e non più affidabile.
8. `come-scegliere-prodotti-cbd` — guida all'acquisto/uso con claim su ansia, sonno, dolore, infiammazione, dosaggio per disturbo e soglia italiana THC 0,6% presentata come regola generale.

Il totale degli slug nella quarantena forzata passa da 27 a 35. Restano inoltre diversi articoli già marcati manualmente `editorialStatus: legacy-review`, verificati a campione durante questo passaggio.

## Hardening applicato a tutti i legacy-review

La trasformazione del content schema ora normalizza non soltanto gli slug della lista forzata ma anche i contenuti già marcati manualmente come `legacy-review`:

- titolo e descrizione generici;
- immagine metadata sostituita dal logo neutro di Canapalandia;
- tag azzerati;
- categoria non esposta nel dato trasformato, così il motore dei correlati non trova match;
- `homeFeatured`, share social, Instagram e CTA disattivati;
- canonical storico e URL conservati;
- `noindex,follow` e corpo ritirato continuano a essere gestiti dalla route esistente.

Questo evita che una pagina ritirata continui a comunicare claim o promozioni tramite Open Graph, JSON-LD, tag o correlati.

## Contenuti verificati e non toccati

- `cbd-2026-leggere-coa-etichette-claim` resta pubblico: distingue correttamente COA, sicurezza, qualità e legalità, usa formulazioni prudenti e non presenta il certificato come prova universale di conformità.
- `cannabis-cbd-ansia-ricerca-lancet-psychiatry` resta in `draft`: l'impostazione è prudente e la pagina non è pubblica.
- `come-scegliere-olio-cbd-qualita-crystalweed` resta in `draft`: contiene però indicazioni commerciali e sanitarie che richiedono una revisione prima di un eventuale passaggio a `ready`.

## Criterio di chiusura

Dopo il merge: build Astro/Vercel, QA live su almeno una pagina legale e una sanitaria appena quarantinate, controllo dell'hub/categoria e verifica che metadata, tag e correlati non espongano più il contenuto ritirato.
