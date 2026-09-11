export type SiteLanguage = "it" | "en";

export const EN_BLOG_CATEGORIES = new Set<string>([
  "cannabis-news",
  "cannabis-legalization",
  "cbd-and-nutrition",
  "cannabis-and-innovation",
  "medical-cannabis",
  "hemp-sustainability",
  "health-wellness",
]);

export type BlogTranslationPair = {
  it: string;
  en: string;
};

/**
 * Registry intenzionale delle sole traduzioni verificate.
 *
 * Non dedurre mai una coppia da titolo, slug o somiglianza semantica: hreflang e
 * language switcher vengono emessi soltanto quando entrambe le URL sono state
 * revisionate e registrate esplicitamente qui.
 */
export const BLOG_TRANSLATION_PAIRS: readonly BlogTranslationPair[] = [
  {
    it: "festa-420-cannabis-italia-2025",
    en: "420-global-cannabis-day-2025",
  },
  {
    it: "malati-di-sla-comprano-cannabis-dai-pusher",
    en: "als-patients-buying-cannabis-from-dealers",
  },
  {
    it: "25-aprile-canapa-light-lotta-liberta",
    en: "april-25-light-cannabis-security-decree-freedom",
  },
  {
    it: "argentina-legalizzazione-cannabis",
    en: "argentina-legalizes-medical-cannabis",
  },
  {
    it: "cannabis-seed-banks-migliori-banche-seme-cannabis",
    en: "best-cannabis-seed-banks-affiliate-programs",
  },
  {
    it: "migliori-varieta-cbd-2025",
    en: "best-cbd-strains",
  },
  {
    it: "migliori-snack-canapa-vita-sana",
    en: "best-hemp-snacks-for-health",
  },
  {
    it: "canapa-sativa-legale-qualita-piu-utilizzate-per-la-coltivazione",
    en: "best-hemp-varieties-italy",
  },
  {
    it: "migliori-vaporizzatori-erbe-aroma-terapia",
    en: "best-vaporizers-herbs-aromatherapy",
  },
  {
    it: "macchie-nel-cervello-no-sono-le-bufale-ad-avere-effetti-collaterali",
    en: "black-spots-cannabis-brain",
  },
  {
    it: "cannabis-combatte-dipendenza-oppiacei-eroina-cocaina",
    en: "bozza-automaticacannabis-fights-opioid-addiction",
  },
  {
    it: "uso-medicinale-vaporizzatori-cannabis",
    en: "buying-vaporizers-for-aromatherapy-a-healthier-choice",
  },
  {
    it: "cannabis-terapeutica-suore-la-coltivano",
    en: "california-nuns-medical-cannabis",
  },
  {
    it: "california-sober-cannabis-vs-alcol",
    en: "california-sober-cannabis-vs-alcohol",
  },
  {
    it: "legalizzazione-cannabis-canada-2018",
    en: "canada-legalizes-cannabis-2018",
  },
  {
    it: "cannabielsoxa-nuovo-cannabinoide-cannabis",
    en: "cannabielsoxa-new-cannabinoid-cannabis-research",
  },
  {
    it: "cannabis-raggiunto-il-quorum-delle-500-mila-firme",
    en: "cannabis-500000-signatures-referendum",
  },
  {
    it: "cannabis-e-api-unalleanza-per-salvare-il-pianeta",
    en: "cannabis-and-bees-an-alliance-to-save-the-planet",
  },
  {
    it: "codice-della-strada-e-cannabis-una-riforma-controversa",
    en: "cannabis-driving-laws-italy",
  },
  {
    it: "cannabis-durante-gravidanza-e-allattamento-cosa-sapere-per-un-uso-sicuro-e-consapevole",
    en: "cannabis-during-pregnancy-and-breastfeeding-safe-guide-2025",
  },
  {
    it: "cannabis-cuore-infarto-rischi",
    en: "cannabis-heart-attack-risk",
  },
  {
    it: "legislazione-canapa-italia",
    en: "cannabis-laws-italy",
  },
  {
    it: "legalizzazione-della-cannabis-la-nomina-della-dadone-potrebbe-essere-la-svolta-decisiva",
    en: "cannabis-legalization-dadone-turning-point",
  },
  {
    it: "legalizzazione-cannabis-europa-aggiornamenti",
    en: "cannabis-legalization-europe-2025-new-regulations",
  },
  {
    it: "olio-cannabis-medicinale-anticancro",
    en: "cannabis-oil-anti-cancer-treatment-science-hope",
  },
  {
    it: "cannabis-raccolta-firme-online-per-il-referendum-autoproduzione",
    en: "cannabis-petition-decriminalization-cultivation",
  },
  {
    it: "cannabis-tecnologia-innovazioni",
    en: "cannabis-technology-innovations",
  },
  {
    it: "cannabis-governo-salva-referendum-con-decreto",
    en: "cannabis-the-government-saves-the-referendum-with-decree-extends-deadline-by-one-month",
  },
  {
    it: "turismo-cannabis-2025",
    en: "cannabis-tourism-2025",
  },
  {
    it: "cbd-autismo-evidenze-terapeutiche",
    en: "cbd-autism-scientific-evidence",
  },
  {
    it: "benefici-cbd-sonno-migliore",
    en: "cbd-benefits-better-sleep-myths-facts",
  },
  {
    it: "cbd-cannabis-cura-contro-la-depressione",
    en: "cbd-cannabis-depression-treatment",
  },
  {
    it: "cbd-e-benessere-ormonale-femminile-nuove-scoperte",
    en: "cbd-female-hormonal-health-benefits",
  },
  {
    it: "cbd-e-ormoni-benefici-salute-femminile",
    en: "cbd-hormones-womens-health",
  },
  {
    it: "cbd-salute-mentale-ansia-depressione",
    en: "cbd-mental-health-anxiety-depression",
  },
  {
    it: "i-benefici-della-canapa-cosa-non-sai-superfood",
    en: "cbd-or-cannabidiol-uses-and-how-to-use-it",
  },
  {
    it: "cbd-della-cannabis-allevia-la-psoriasi-dermatite",
    en: "cbd-thc-cannabis-psoriasis-dermatitis",
  },
  {
    it: "cannabis-light-fentanyl-ipocrisia",
    en: "cbd-vs-fentanyl-hypocrisy",
  },
  {
    it: "cbd-vs-thc-differenze",
    en: "cbd-vs-thc-differences",
  },
  {
    it: "la-cannabis-cura-epilessia-sindrome-dravet",
    en: "charlotte-figi-cannabis-epilepsy-treatment",
  },
  {
    it: "ddl-sicurezza-e-il-futuro-della-cannabis-light-in-italia-un-passo-indietro-per-lindustria",
    en: "ddl-sicurezza-cannabis-light-italy-impact",
  },
  {
    it: "easyjoint-la-cannabis-legale",
    en: "easyjoint-legal-cannabis-in-italy",
  },
  {
    it: "cannabis-assolta-uno-studio-dimostra-che-aumenta-la-memoria",
    en: "french-farmers-protest-cannabis-cultivation-bill",
  },
  {
    it: "legalizzazione-cannabis-germania-italia",
    en: "germany-cannabis-legalization-italy-model",
  },
  {
    it: "germania-record-importazioni-cannabis-medica-2026",
    en: "germany-medical-cannabis-imports-record-2026",
  },
  {
    it: "marcia-mondiale-legalizzazione-marijuana",
    en: "global-march-marijuana-legalization-argentina",
  },
  {
    it: "canapa-bioenergia-risorsa-futuro",
    en: "hemp-bioenergy-sustainable-resource",
  },
  {
    it: "canapa-salute-cardiovascolare-cosa-dice-scienza",
    en: "hemp-cardiovascular-health",
  },
  {
    it: "canapa-e-industria-della-moda-tessuti-ecosostenibili-per-un-futuro-sostenibile",
    en: "hemp-fashion-sustainable-fabrics",
  },
  {
    it: "olio-di-canapa-proprieta-benefici-usi-in-cucina",
    en: "hemp-oil-properties-benefits-and-uses-in-cooking",
  },
  {
    it: "proteine-canapa-sportivi-vegani",
    en: "hemp-protein-benefits-vegans-athletes",
  },
  {
    it: "benefici-olio-di-semi-di-canapa-salute-pelle",
    en: "hemp-seed-oil-benefits-for-skin",
  },
  {
    it: "canapa-sport-performance-recupero-cbd",
    en: "hemp-sports-performance-recovery-cbd",
  },
  {
    it: "canapa-sostenibilita-futuro",
    en: "hemp-sustainability-future",
  },
  {
    it: "ecosostenibilita-canapa-futuro-green",
    en: "hemp-sustainability-green-future",
  },
  {
    it: "canapa-sostenibilita-salvare-ambiente",
    en: "hemp-sustainability-reducing-environmental-impact",
  },
  {
    it: "hhc-vietato-europa",
    en: "hhc-ban-europe",
  },
  {
    it: "storia-canapa-origini-giorni-nostri",
    en: "history-of-hemp-origins-to-modern-times",
  },
  {
    it: "storia-cannabis-terapeutica-origini-sfide",
    en: "history-therapeutic-cannabis-origins-challenges",
  },
  {
    it: "come-scegliere-prodotti-cbd",
    en: "how-choose-right-cbd-products-complete-guide",
  },
  {
    it: "come-scegliere-prodotti-canapa-etichette",
    en: "how-to-choose-quality-hemp-products-what-to-look-for-on-the-labels",
  },
  {
    it: "realizzare-cosmetici-canapa-casa",
    en: "how-to-make-diy-hemp-cosmetics",
  },
  {
    it: "olio-di-cannabis-tintura-marijuana",
    en: "how-to-make-green-dragon-cannabis-oil",
  },
  {
    it: "decreto-sicurezza-cannabis-light",
    en: "italy-light-cannabis-ban-security-decree",
  },
  {
    it: "ho-sconfitto-il-cancro-grazie-allolio-di-cannabis",
    en: "joy-smith-cannabis-oil-terminal-cancer",
  },
  {
    it: "tar-sospende-decreto-cannabis-light-economia-italiana-2",
    en: "lazio-court-blocks-cannabis-light-decree-green-economy",
  },
  {
    it: "legalizzazione-della-cannabis-woodcock-favorevole",
    en: "magistrate-woodcock-supports-cannabis-legalization",
  },
  {
    it: "cappato-distribuisco-semi-di-cannabis",
    en: "marco-cappato-now-distributing-cannabis-seeds-through-his-website",
  },
  {
    it: "cannabis-medicinale-migliora-vista",
    en: "medical-cannabis-improves-vision",
  },
  {
    it: "cannabis-terapeutica-oncologia",
    en: "medical-cannabis-oncology",
  },
  {
    it: "cannabis-terapeutica-slovenia-albania-italia-2025",
    en: "medical-cannabis-slovenia-albania-italy",
  },
  {
    it: "marocco-legalizzazione-cannabis-uso-terapeutico",
    en: "morocco-cannabis-medical-legalization",
  },
  {
    it: "partner-seedsman",
    en: "partner-seedsman-canapalandia",
  },
  {
    it: "analisi-dichiarazioni-sospensione-decreto-cbd",
    en: "political-activist-reactions-italy-cbd-ruling",
  },
  {
    it: "referendum-sulla-legalizzazione-della-cannabis-la-corte-di-cassazione-ha-validato-le-oltre-600mila-firme-raccolte",
    en: "referendum-cannabis-legalization-signatures-validated",
  },
  {
    it: "san-francisco-vuole-concedere-amnistia-le-condanne-possesso-cannabis",
    en: "san-francisco-cannabis-amnesty",
  },
  {
    it: "cannabis-light-sardegna-procura-mette-freno-alla-produzione",
    en: "sardinia-legal-cannabis-industry-cagliari-seizures",
  },
  {
    it: "decreto-sicurezza-2025-repressione-liberta-zero",
    en: "security-decree-2025-total-repression-freedom-zero",
  },
  {
    it: "situazione-cannabis-italia-risultati-mondo",
    en: "situation-cannabis-light-italy",
  },
  {
    it: "giustizia-sociale-cannabis-legale-usa-italia",
    en: "social-justice-legal-cannabis-us-italy",
  },
  {
    it: "monopolio-stato-cannabis",
    en: "state-monopoly-cannabis",
  },
  {
    it: "ritorno-canapalandia-blog",
    en: "the-return-of-canapalandia-relaunching-our-blog-project",
  },
  {
    it: "varieta-canapa-2025",
    en: "top-hemp-strains",
  },
  {
    it: "cannabis-sanita-sperimenta-vaporizzatori",
    en: "uk-nhs-trials-vaporizers-for-cannabis",
  },
  {
    it: "uruguay-cannabis-legale",
    en: "uruguay-legal-cannabis-pharmacies-2017",
  },
  {
    it: "usa-test-clinico-per-la-cannabis-contro-emicrania",
    en: "us-clinical-trial-cannabis-migraine-relief",
  },
  {
    it: "cannabis-terapeutica-walter-de-benedetto-e-stato-assolto-coltiva-la-cannabis-per-uso-medicinale",
    en: "walter-de-benedetto-medical-cannabis-acquittal",
  },
] as const;

export function languageFromCategory(category: unknown): SiteLanguage {
  return typeof category === "string" && EN_BLOG_CATEGORIES.has(category) ? "en" : "it";
}

export function findBlogTranslationPair(slug: string): BlogTranslationPair | null {
  const normalized = String(slug || "").trim();
  if (!normalized) return null;
  return BLOG_TRANSLATION_PAIRS.find((pair) => pair.it === normalized || pair.en === normalized) ?? null;
}

export function blogUrl(slug: string, siteUrl = "https://canapalandia.com"): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/blog/${slug}/`;
}

export function translationAlternates(slug: string, siteUrl = "https://canapalandia.com") {
  const pair = findBlogTranslationPair(slug);
  if (!pair) return null;

  return {
    pair,
    it: blogUrl(pair.it, siteUrl),
    en: blogUrl(pair.en, siteUrl),
    xDefault: blogUrl(pair.it, siteUrl),
  };
}
