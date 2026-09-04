# Canapalandia Commerce — Asset Specs V1

Stato: internal / pre-launch.

Scopo: definire i requisiti tecnici minimi dei master Drop 001 prima dell'accesso al Partner Area. I dati pubblici Spreadshop qui sotto sono baseline tecniche; se il Partner Area mostra limiti più restrittivi per uno SKU, prevale il dato specifico dello SKU.

## 1. Regola master

Per T-shirt, Tote e Beanie il master commerciale resta wordmark-only: `CANAPALANDIA`.

Non usare nel Drop 001:
- simbolo C + foglia finché il gate compliance non è chiuso;
- claim espliciti cannabis/marijuana/420/consumo/legalizzazione;
- texture o dettagli che compromettano leggibilità o ricamo.

Conservare sempre una sorgente vettoriale editabile e generare gli export finali solo dopo il freeze delle aree provider.

## 2. Stampa raster — baseline pubblica Spreadshop

Baseline tecnica pubblica:
- PNG consigliato per trasparenza;
- JPG/BMP/GIF accettati come formati raster generali;
- background trasparente per grafica isolata;
- file max 10 MB;
- minimo 1000 px sul lato corto oppure circa 4000 px sul lato lungo;
- per apparel la guida pubblica raccomanda alta risoluzione; usare 4000 px sul lato lungo come baseline prudente;
- colore RGB come baseline operativa.

Regola Canapalandia:
- niente export raster definitivo finché non conosciamo area e tecnica dello SKU;
- se il provider consente SVG senza svantaggi, preferire il vettoriale per il wordmark;
- se serve PNG, esportare su fondo trasparente e senza anti-aliasing sporco sui bordi.

## 3. Vettoriale — baseline pubblica Spreadshop

Formati pubblicamente supportati:
- SVG
- AI
- CDR

Baseline:
- convertire testi e oggetti in tracciati;
- curve chiuse;
- nessuna sovrapposizione problematica;
- per plot print, max 3 colori e colori separati;
- diametro minimo linee/elementi circa 0,06 in;
- dimensione massima pubblica 15 × 15 in, con 11 × 11 in indicato come ideale generale.

Nota: eventuali supplementi legati alla tecnica vanno letti nel Partner Area e non assunti dai prezzi pubblici.

## 4. Ricamo — baseline pubblica Spreadshop

Per il Beanie, prima scelta se tecnicamente disponibile:
- area massima pubblica ricamo: 8 × 5 cm;
- linee almeno 2 mm;
- tratto delle lettere almeno 2 mm;
- altezza testo almeno 8 mm;
- punti/dettagli isolati almeno 2 mm;
- massimo 4 colori filo;
- niente gradienti;
- niente pattern;
- niente fondo;
- oggetti chiusi;
- evitare dettagli minuti;
- artwork sorgente vettoriale, con SVG/AI/EPS come baseline del servizio ricamo.

Per il wordmark CANAPALANDIA:
- verificare la leggibilità reale dentro 8 × 5 cm;
- se il logotipo completo non supera il gate di leggibilità, usare una composizione tipografica autorizzata del wordmark, senza inventare un nuovo marchio;
- non pagare digitizzazione/setup prima del freeze del modello esatto, dell'area e del costo locale effettivo.

## 5. Master da produrre dopo il freeze

### T-shirt
`canapalandia-drop001-tshirt-wordmark-master.svg`

Export derivati solo se richiesti:
- PNG trasparente;
- eventuale variante chiara/scura;
- scheda dimensione finale e posizione.

### Tote
`canapalandia-drop001-tote-wordmark-master.svg`

Export derivati:
- PNG trasparente se richiesto;
- variante chiara/scura;
- scheda dimensione finale e posizione.

### Beanie
`canapalandia-drop001-beanie-wordmark-master.svg`

Se ricamo:
- composizione ottimizzata per 8 × 5 cm;
- massimo 4 colori, preferibilmente 1 colore per ridurre complessità;
- verifica minima spessori/testo prima dell'upload.

## 6. Gate di accettazione asset

Un master può diventare `READY FOR PROVIDER` solo se:
- SKU = FROZEN;
- tecnica = FROZEN;
- area = FROZEN;
- colore prodotto scelto;
- contrasto verificato;
- dimensione reale verificata;
- file entro i limiti provider;
- nessun elemento compliance-open;
- naming e versione registrati.

Finché manca uno di questi elementi, stato asset = `HOLD FOR PARTNER AREA`.
