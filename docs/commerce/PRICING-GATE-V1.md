# Canapalandia Commerce — Pricing Gate V1

Stato: internal / pre-launch.

Scopo: evitare che un prezzo retail venga deciso sulla base di prezzi pubblici non equivalenti al costo Partner Area.

## 1. Regola fondamentale

Il prezzo finale si decide solo con dati Partner Area reali.

Non usare come base economica definitiva:
- prezzo pubblico Spreadshirt/Spreadshop;
- prezzo di un prodotto già personalizzato da terzi;
- prezzo mostrato in un mercato diverso;
- stime di margine non confermate.

## 2. Dati minimi necessari per ogni SKU

Prima del pricing finale devono essere noti:
- base price partner;
- costo stampa/ricamo della tecnica scelta;
- supplementi colore/area/prodotto;
- eventuale setup/digitizzazione;
- valuta;
- indicazione IVA mostrata;
- etichetta economica del payout/margine nel Partner Area.

## 3. Target interni attuali

| Prodotto | Target corrente | Stato |
| --- | ---: | --- |
| T-shirt PT2940 | €34,90 | working target |
| Tote PT4133 | €26,90 | working target |
| Beanie | TBD | attendere modello e tecnica |

I target non sono prezzi pubblicabili.

## 4. Formula di lavoro

Per la sessione Partner Area usare:

`Costo operativo prodotto = base price + costi tecnica + supplementi ricorrenti`

`Margine lordo provider-side stimato = prezzo retail - costo operativo prodotto`

Il setup/digitizzazione una tantum va registrato separatamente e non nascosto nel costo unitario, salvo decisione esplicita di ammortamento.

Non derivare da questa formula imposte personali, INPS, ritenute o netto fiscale italiano: questi elementi appartengono al gate fiscale separato.

## 5. Gate economico

Uno SKU può essere marcato `PRICE-READY` soltanto se:
- costo operativo reale acquisito;
- prezzo retail realistico rispetto al posizionamento Canapalandia;
- margine provider-side positivo e non simbolico;
- nessun costo tecnico ignoto rilevante;
- nessuna dipendenza da sconti temporanei per sostenere il prezzo.

Se il target corrente non supera il gate:
1. valutare una tecnica meno costosa senza abbassare la qualità percepita;
2. valutare il fallback SKU già previsto;
3. solo dopo valutare un aumento prezzo;
4. rifiutare lo SKU se resta economicamente incoerente.

## 6. Decisioni per prodotto

### T-shirt
Mantenere €34,90 come primo punto di test. Se il margine risulta insufficiente, valutare la fascia €35,90–36,90 solo dopo aver visto costo reale e concorrenza percepita del prodotto specifico.

### Tote
Mantenere €26,90 come primo punto di test. PT56 entra in valutazione solo se PT4133 fallisce un gate concreto di disponibilità, tecnica o margine.

### Beanie
Nessun prezzo congelato prima di sapere:
- Fisherman effettivamente disponibile o meno;
- ricamo/stampa disponibile;
- costo ricamo;
- eventuale setup/digitizzazione;
- base price reale.

Il fallback PT3339 ha priorità rispetto a PT1089 se il Fisherman non supera il gate.

## 7. Regola di pubblicazione

Nessun prezzo entra in `/shop/`, nel provider o nel copy pubblico finché lo SKU non è contemporaneamente:
- `FROZEN`;
- `PRICE-READY`;
- `COMPLIANCE-READY`;
- fiscalmente non bloccante per il lancio.
