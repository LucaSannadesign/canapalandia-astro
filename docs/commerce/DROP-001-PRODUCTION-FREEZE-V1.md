# Canapalandia Commerce — Drop 001 Production Freeze V1

Stato: pre-launch / internal branch only.

Scopo: trasformare il Drop 001 in un pacchetto eseguibile e congelabile nel Partner Area senza introdurre dati provider non verificati, spese o modifiche a produzione.

## 1. Core release

Core confermato:
- T-shirt
- Tote
- Beanie

Il poster resta fuori dal core commerciale del Drop 001.

## 2. Brand lock

### Master di riferimento

Asset ufficiale nel repository:
- `public/images/logo-canapalandia.svg`

Il master completo contiene anche il simbolo C con foglia. Per il primo drop commerciale l'applicazione prudente resta **wordmark-only**.

Regole:
- non inventare un nuovo logo;
- non ridisegnare il marchio;
- non utilizzare il simbolo con foglia sui master commerciali finché il gate compliance non viene chiuso;
- usare `CANAPALANDIA` come elemento primario riconoscibile;
- evitare claim espliciti su cannabis, marijuana, 420, consumo o legalizzazione nel Drop 001;
- direzione editoriale, brand-first, non gadget-promozionale.

Tipografie già ammesse per uso commerciale nel progetto:
- Archivo
- Source Serif 4

## 3. SKU freeze matrix

| Prodotto | Candidato principale | Fallback | Stato corrente | Prezzo target interno |
| --- | --- | --- | --- | ---: |
| T-shirt | Spreadshop PT2940 | — | PUBLIC ID VERIFIED / PARTNER DATA TBD | €34,90 |
| Tote | Spreadshop PT4133 | PT56 | PUBLIC ID VERIFIED / PARTNER DATA TBD | €26,90 |
| Beanie | Fisherman path / PT2450 candidate | PT3339, poi PT1089 | MODEL TBD / PARTNER DATA TBD | TBD |

Note:
- i prezzi sopra sono esclusivamente target di pianificazione, non prezzi provider confermati;
- nessun `productTypeId` viene marcato `frozen` finché non è verificato nel Partner Area reale;
- STAU296 Fisherman Beanie 2.0 resta WATCH finché non viene mappato con certezza nel catalogo Spreadshop utilizzabile dal partner.

## 4. Direzione applicazione per prodotto

### T-shirt — hero del drop

Obiettivo:
- percezione premium/editoriale;
- wordmark CANAPALANDIA come elemento dominante;
- composizione leggibile da distanza media;
- evitare grafica troppo illustrativa o legata direttamente al tema cannabis.

Freeze richiesto nel Partner Area:
- PT2940 disponibile per il mercato di vendita;
- colori reali;
- taglie reali;
- tecnica disponibile;
- area massima di stampa;
- base price partner;
- supplementi;
- eventuali limiti file.

### Tote — supporto editoriale quotidiano

Obiettivo:
- applicazione sobria;
- grande riconoscibilità del wordmark;
- preferenza per composizione semplice e riproducibile;
- evitare elementi minuti che perdono leggibilità sul canvas.

Freeze richiesto nel Partner Area:
- PT4133 disponibile;
- colori reali;
- area decorazione;
- tecnica;
- base price partner;
- supplementi;
- eventuale fallback PT56 solo se PT4133 fallisce un gate concreto.

### Beanie — elemento stagionale

Ordine decisionale:
1. Fisherman premium se disponibile con tecnica/costi accettabili;
2. PT3339 come fallback low-friction;
3. PT1089 come secondo fallback.

Applicazione:
- wordmark compatto;
- priorità al ricamo o alla soluzione tecnicamente più coerente con il modello scelto;
- niente spesa per digitizzazione prima del freeze del prodotto e del costo reale.

Freeze richiesto nel Partner Area:
- modello esatto;
- one-size/taglie;
- colori;
- area utile;
- ricamo/stampa disponibile;
- costo digitizzazione o setup;
- base price partner;
- supplementi.

## 5. Export master

I file finali vanno generati solo dopo il freeze delle aree provider.

Naming previsto:
- `canapalandia-drop001-tshirt-wordmark-master.*`
- `canapalandia-drop001-tote-wordmark-master.*`
- `canapalandia-drop001-beanie-wordmark-master.*`

Per ogni master conservare:
- sorgente vettoriale;
- export richiesto dal provider;
- variante positiva;
- variante negativa se necessaria;
- dimensioni finali;
- tecnica prevista;
- SKU/provider ID associato.

Non rasterizzare prematuramente il master principale.

## 6. Partner Area capture — una sola sessione

Per ogni prodotto registrare nella stessa sessione:
- provider product ID;
- nome prodotto esatto;
- mercato/paese;
- base price;
- valuta e indicazione IVA mostrata;
- colori;
- taglie;
- tecnica disponibile;
- area stampa/ricamo;
- supplementi;
- costo setup/digitizzazione se presente;
- vincoli file;
- etichetta economica usata dal provider (`Margin`, bonus o equivalente);
- eventuali limitazioni geografiche;
- screenshot/evidenza interna se utile.

Output ammessi per ogni SKU:
- `FROZEN`
- `FALLBACK`
- `REJECTED`
- `NEEDS SUPPORT`

## 7. Hard gates prima dei master finali

Non creare i master finali finché manca uno dei seguenti elementi:
- SKU congelato;
- area decorazione verificata;
- tecnica verificata;
- costo reale verificato;
- compliance visiva chiusa;
- prezzo target sostenibile rispetto al costo reale.

## 8. Hard gates prima della vendita

Nessuna vendita finché non sono chiusi anche:
- risposta/validazione fiscale per partner italiano;
- trattamento documentale dei payout;
- eventuale ritenuta tedesca chiarita;
- storefront reale Spreadshop pronto;
- copy legale/editoriale del sito aggiornato;
- staging QA completato;
- `PUBLIC_COMMERCE_INDEXABLE=true` abilitato solo nel batch finale approvato;
- nessun testo legacy in conflitto con la vendita di merchandise.

## 9. Regole operative

Fino al GO esplicito:
- nessun merge su `main`;
- nessun deploy volontario solo per verifiche minori;
- nessun prodotto reale creato nel provider;
- nessun upload commerciale;
- nessuna spesa;
- nessun ordine campione;
- nessun cambio DNS;
- nessun checkout;
- nessuna indicizzazione dello shop.

Questo documento è il riferimento operativo per chiudere il Drop 001 nella sessione Partner Area senza riaprire decisioni già prese.