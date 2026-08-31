# Follow-up quarantena YMYL / legale — 31/08/2026

Secondo passaggio nato dal QA live della prima quarantena (PR #43). Il controllo della pagina in produzione ha confermato il comportamento `legacy-review`, ma ha mostrato nei correlati e negli hub alcuni ulteriori contenuti legacy con claim sanitari, nutrizionali, legali o commerciali non sufficientemente affidabili.

## Nuovi slug messi in quarantena

1. `cbd-legale-decreto-sicurezza` — guida legale 2025 con affermazioni assolute su divieti, possesso, full-spectrum, integratori CBD e sequestri; include inoltre partnership Nordic Oil e FAQ sanitarie/legali.
2. `best-cbd-strains` — contenuto affiliato Seedsman con promesse di effetti, “massima conformità legale”, regole di coltivazione semplificate e CTA commerciali.
3. `best-vaporizers-herbs-aromatherapy` — articolo 2016 che presenta la vaporizzazione come esperienza “molto più sicura e salutare”, usa formulazioni medical-grade e ranking prodotto non aggiornato.
4. `hemp-seed-oil-benefits-for-skin` — attribuisce all’olio di semi di canapa trattamento di acne, eczema e psoriasi, stimolo del collagene ed effetti antinfiammatori/anti-aging formulati come certezze.
5. `hemp-cardiovascular-health` — presenta possibili effetti cardioprotettivi del CBD, indicazioni di dosaggio/somministrazione e una soglia italiana “CBD legale sotto 0,6%” non corretta come regola generale.
6. `olio-cbg-come-e-quando-usarlo` — nonostante lo slug CBG, è una guida CBD con claim su dolore, ansia, insonnia, neurodegenerazione, dermatologia, dosaggio, sicurezza e uso terapeutico.
7. `claim-illegali-cbd-esempi-sanzioni` — impostazione prudente sui claim, ma guida legale troppo assertiva e priva di riferimenti puntuali per le specifiche conseguenze/sanzioni elencate; da riscrivere con norme e provvedimenti citati.
8. `migliori-snack-canapa-vita-sana` — claim alimentari su colesterolo, salute cardiovascolare, infiammazione, immunità, glicemia e salute articolare formulati senza adeguata base editoriale.
9. `proteine-canapa-sportivi-vegani` — claim su recupero muscolare, dolore post-allenamento, LDL, infiammazione e riduzione del rischio di diabete/cancro sostenuti anche da fonti commerciali non adeguate.
10. `i-benefici-della-canapa-cosa-non-sai-superfood` — promesse su prevenzione di ipertensione, salute cardiovascolare, eczema/psoriasi, PMS, glicemia e altri benefici generali troppo forti.
11. `come-integrare-i-semi-di-canapa-nella-tua-dieta` — guida alimentare con claim su infiammazione, prevenzione di malattie croniche, pressione, immunità, colesterolo e glicemia presentati con eccessiva certezza.

## Verificati e lasciati pubblici

- `efsa-cbd-2026-cosa-cambia-livello-provvisorio-sicurezza`: il riferimento EFSA del 9 febbraio 2026 (0,0275 mg/kg/die, circa 2 mg/die per 70 kg) e i principali caveat risultano coerenti con la fonte EFSA. L'articolo distingue correttamente valutazione scientifica e autorizzazione novel food.
- `/cbd-benessere/`: la vecchia landing problematica non è più servita come contenuto autonomo; oggi l'URL mostra l'hub CBD aggiornato e canonicalizza su `/categoria/cbd-alimentazione/`.

## Hardening dei metadata

Il QA della prima quarantena ha rilevato che un contenuto ritirato poteva ancora esporre il vecchio title/description nei metadata e nelle anteprime Open Graph. Il follow-up neutralizza quindi, per tutti gli slug della quarantena forzata:

- `title` → `Articolo d’archivio in revisione editoriale`;
- `description` → testo generico di revisione;
- `coverAlt` → testo neutro.

Restano invariati URL e canonical storici. La pagina rimane `noindex,follow` e il corpo precedente resta ritirato.

## Criterio di ripristino

Uno slug viene rimosso dalla quarantena solo dopo riscrittura completa, verifica con fonti primarie/istituzionali, rimozione dei claim non dimostrati, QA legale/scientifico e controllo runtime della pagina risultante.