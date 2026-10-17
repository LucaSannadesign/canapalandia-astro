# Piano editoriale Canapalandia — 17 ottobre 2026

**Stato:** bozze editoriali, non pubblicate.
**Branch:** editorial/canapa-news-20261017
**Ambito:** informazione sanitaria, giuridica e alimentare; verifica obbligatoria delle fonti prima della pubblicazione.
**Controllo duplicati:** nel repository esistono già articoli sulle opinioni EFSA di settembre 2026 e sul procedimento italiano CBD/Corte UE. Evitare nuovi post con lo stesso intento di ricerca; aggiornarli solo se ci sono fatti nuovi.

## Programmazione proposta (non pianificata tecnicamente)

1. Lunedì 19 ottobre — Bedrocan: notizia sanitaria di maggiore urgenza; va aggiornata con eventuali comunicazioni ufficiali.
2. Martedì 20 ottobre — Corte costituzionale: chiarimento sul rinvio, senza descriverlo come sentenza.
3. Giovedì 22 ottobre — Tisane di canapa: articolo di servizio sulle nuove regole UE.

Le date sono raccomandazioni editoriali, non pubblicazioni o invii programmati. La pubblicazione deve essere autorizzata dopo revisione.

## Articolo 1 — Bedrocan

- File: src/content/blog/bedrocan-crisi-cannabis-terapeutica-italia-2026.mdx
- Focus SEO: crisi Bedrocan cannabis terapeutica Italia, importazioni cannabis medica 2026.
- Angolo originale: distinguere fallimento del produttore, interruzione del canale BMC, scorte nei Paesi Bassi e disponibilità effettive in Italia.
- Dati da aggiornare prima dell'online: comunicazioni del Ministero della Salute, quantitativi e tempi per varietà, eventuali annunci di grossisti.

### Facebook — proposta

Il fallimento delle società olandesi Bedrocan riapre il problema delle forniture di cannabis terapeutica in Italia. Ma attenzione: le scorte annunciate nei Paesi Bassi non equivalgono a una garanzia per le farmacie italiane. Abbiamo separato fatti confermati, rischi e domande ancora senza risposta. Nel nuovo approfondimento di Canapalandia analizziamo la filiera e cosa può fare chi segue una terapia prescritta.

### Instagram — proposta

Crisi Bedrocan: quali conseguenze per i pazienti italiani? Il fallimento è confermato; lo stop al canale pubblico olandese di esportazione era già previsto entro il 2026. Il dato che manca è la disponibilità italiana, varietà per varietà. Facciamo chiarezza con le fonti.
#Canapalandia #CannabisTerapeutica #DirittiDeiPazienti #Sanita

## Articolo 2 — Consulta

- File: src/content/blog/cannabis-light-consulta-rinvio-febbraio-2027.mdx
- Focus SEO: corte costituzionale cannabis light febbraio 2027, articolo 18 decreto sicurezza.
- Distinzione irrinunciabile: nuova data udienza ≠ sospensione della legge ≠ decisione sul merito.
- Verificare calendario Corte e comunicazioni delle parti immediatamente prima della pubblicazione.

### Facebook — proposta

La Corte costituzionale discuterà le questioni sull'articolo 18 del Decreto Sicurezza il 9 febbraio 2027. Il rinvio non annulla i divieti sulle infiorescenze e non anticipa la decisione. Che cosa contestano i giudici di Brindisi, Trani e Brescia? Spieghiamo i passaggi senza titoli ingannevoli.

### Instagram — proposta

Cannabis light: udienza alla Consulta rinviata al 9 febbraio 2027. La norma non è stata annullata. Vediamo che cosa cambia davvero e quali questioni restano aperte.
#Canapalandia #CannabisLight #DecretoSicurezza #Canapa

## Articolo 3 — Tisane e THC

- File: src/content/blog/tisane-canapa-limiti-thc-ue-2027.mdx
- Focus SEO: tisane canapa THC 2027, regolamento UE 2026/1828, foglie canapa infusione.
- Valori normativi verificati: foglie per infusione 40 mg/kg; infuso pronto 0,02 mg/kg; applicazione 1 gennaio 2027.
- Distinzione irrinunciabile: limiti ai contaminanti ≠ autorizzazione generale a vendere fiori, estratti o CBD.
- Verificare corrispondenza effettiva di etichettatura e interpretazione della disciplina nazionale con un esperto prima del rilascio.

### Facebook — proposta

Dal 1° gennaio 2027 entrano in applicazione nuovi limiti europei di THC per foglie di canapa da infusione e tisane pronte da bere. Ci sono due valori diversi e obblighi specifici in etichetta. È una liberalizzazione della cannabis light? No: la normativa europea fa salva l'applicazione di regole nazionali più restrittive. Ecco le differenze da conoscere.

### Instagram — proposta

Tisane alla canapa: cosa cambia nel 2027? Il regolamento UE prevede 40 mg/kg per le foglie da infusione e 0,02 mg/kg per le bevande pronte. Non significa via libera generale alle infiorescenze. Il nostro approfondimento spiega cosa prevede il testo.
#Canapalandia #CanapaIndustriale #NormativaUE #THC

## QA e criteri di pubblicazione

- [x] Contenuti distinti dagli articoli già presenti per tema/intento di ricerca.
- [x] Titoli e meta description specifici, non assolutistici.
- [x] Fonti in calce (istituzionali quando disponibili).
- [x] Distinzione tra fatti, dichiarazioni di parte e ipotesi.
- [x] Status draft, draft true; con queste impostazioni la route pubblica deve restituire 404 secondo blogVisibility.ts.
- [ ] Riesame dei fatti e dei collegamenti il giorno dell'uscita.
- [ ] Revisione editoriale e medico-legale proporzionata ai temi.
- [ ] Immagini originali/licenziate, coerenti con l'articolo: file WebP, alt descrittivo, versione social.
- [ ] Aggiornare il frontmatter per lo stato ready: data pubblicazione, immagine e campi social solo dopo QA.
- [ ] Eseguire build e test in locale/CI; controllare eventuale preview e dati strutturati.
- [ ] Ottenere approvazione umana prima di merge su main, deploy, invii o pubblicazione social.

**Nota:** nessun asset visivo è stato generato, nessun invio è stato programmato e nessun articolo è live.
