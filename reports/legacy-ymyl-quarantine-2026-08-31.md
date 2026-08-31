# Quarantena YMYL / legale legacy — 31/08/2026

Seconda tranche di bonifica dell'archivio Canapalandia, eseguita dopo verifica dei contenuti ancora pubblici e indicizzabili con affermazioni sanitarie o legali ad alto rischio di obsolescenza, eccessiva certezza o contestualizzazione insufficiente.

## Intervento tecnico

La quarantena è centralizzata in `src/content.config.ts`: gli slug elencati vengono normalizzati a `editorialStatus: legacy-review` anche se il vecchio frontmatter non contiene ancora il flag.

Il comportamento già esistente per `legacy-review` viene quindi applicato automaticamente:

- URL storico raggiungibile;
- `noindex,follow`;
- corpo legacy non mostrato;
- avviso editoriale;
- esclusione da sitemap XML, mappa del sito, feed/listing e contenuti correlati;
- reazioni, share e CTA di sostegno disabilitate durante la revisione.

La quarantena è reversibile: uno slug va rimosso dal registro solo dopo riscrittura, verifica delle fonti e controllo della pagina risultante.

## Slug messi in quarantena

### P0 — revisione scientifica/sanitaria prioritaria

1. `history-therapeutic-cannabis-origins-challenges` — confonde canapa industriale e coltivazione di cannabis a uso medico; usa inoltre un brevetto come supporto di efficacia clinica.
2. `black-spots-cannabis-brain` — identifica in modo errato studio, tipo di segnale neuroradiologico e stato peer-reviewed della ricerca criticata.
3. `california-nuns-medical-cannabis` — trasforma una storia di costume in una lista di benefici terapeutici del CBD per dolore, ansia, depressione, insonnia e altre condizioni.
4. `uk-nhs-trials-vaporizers-for-cannabis` — presenta come trial clinico NHS sui pazienti quella che nel 2016 era una valutazione della formulazione/prodotto; contiene claim su sollievo rapido e condizioni specifiche.
5. `cbd-hormones-womens-health` — affermazioni su ormoni, PMS, menopausa, cortisolo, PCOS, insulina e fertilità non supportate con il livello di evidenza dichiarato.
6. `cbd-female-hormonal-health-benefits` — analoghe affermazioni su estrogeni/progesterone, PMS, menopausa, ossa, PCOS e cortisolo.
7. `hemp-sports-performance-recovery-cbd` — claim su performance, recupero, DOMS, circolazione, resistenza, sonno e infiammazione formulati come effetti dimostrati.
8. `cbd-explained-benefits-uses-safety` — guida generale che presenta numerosi impieghi terapeutici, dosaggio e sicurezza con eccessiva certezza.
9. `how-choose-right-cbd-products-complete-guide` — guida all'acquisto con claim sanitari, indicazioni di dosaggio e semplificazioni sulla legalità/THC.
10. `cbd-vs-thc-differences` — tabelle di indicazioni terapeutiche e legali troppo categoriche e in parte obsolete.

### P1 — revisione legale/storica o editoriale

11. `cbd-vs-fentanyl-hypocrisy` — confronto sanitario/politico con claim assoluti su CBD, dipendenza, insonnia, stress e interessi industriali.
12. `als-patients-buying-cannabis-from-dealers` — articolo del 2018 che continua a descrivere al presente l'impossibilità di accesso legale; incoerenza anche tra titolo SLA e caso narrato di sclerosi multipla.
13. `walter-de-benedetto-medical-cannabis-acquittal` — fatto storico reale, ma sovrainterpretato come riconoscimento generale di un diritto all'autocoltivazione terapeutica.
14. `argentina-legalizes-medical-cannabis` — fotografia del 2017 non aggiornata alle modifiche normative e regolatorie successive.
15. `cannabis-laws-italy` — guida 2026 con semplificazioni non più affidabili sullo status di CBD/cannabis light, soglie THC e coltivazione.
16. `migliori-varieta-cbd-2025` — contenuto affiliato con affermazioni legali/di coltivazione e benefici/effetti che richiedono aggiornamento prima di restare indicizzabili.

## Contenuti verificati ma non aggiunti alla quarantena

- `cannabis-during-pregnancy-and-breastfeeding-safe-guide-2025`: impostazione complessivamente prudente; raccomanda di evitare cannabis durante gravidanza e allattamento e non presenta il CBD come sicuro in queste fasi.
- diversi contenuti oncologici, sonno, dermatologia, vista, autismo, depressione e migraine erano già sotto `editorialStatus: legacy-review`; nessuna duplicazione.

## Criterio di uscita dalla quarantena

Per ogni slug: riscrittura con fonti primarie/istituzionali aggiornate, distinzione tra evidenza preclinica/osservazionale/clinica, rimozione di claim terapeutici non autorizzati o non dimostrati, aggiornamento del quadro legale alla data di revisione, QA di title/description/canonical/robots e verifica della pagina live prima di ripristinare `current`.
