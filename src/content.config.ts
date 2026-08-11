import { defineCollection, z } from "astro:content";
// 1. Aggiunto l'import per il loader
import { glob } from "astro/loaders";

/** Categorie blog consentite: non introdurne di nuove nel frontmatter senza decisione editoriale esplicita (aggiornare questa lista di conseguenza). */
const BLOG_CATEGORY_WHITELIST = [
  "cannabis-news-it",
  "Normativa",
  "cbd-alimentazione",
  "canapa-e-ambiente",
  "salute-benessere",
  "guide-tutorial",
  "cannabis-e-innovazione",
  "Attualità",
  "Ricerca",
  "cbd-bellezza-cura-pelle",
  "cannabis-news",
  "cannabis-legalization",
  "cbd-and-nutrition",
  "cannabis-and-innovation",
  "medical-cannabis",
  "hemp-sustainability",
  "health-wellness",
] as const;

/** Tag consentiti (whitelist editoriale IT/EN). Nuove etichette solo con decisione editoriale esplicita. */
const BLOG_TAG_WHITELIST_EDITORIAL = ["cbd","cannabis-light","legalizzazione-cannabis","cannabis-terapeutica","decreto-sicurezza","controlli","etichette","claim","efsa","novel-food","codice-della-strada","proibizionismo","canapa-industriale","coltivazione-canapa","economia-verde","cannabinoidi","diritti-dei-pazienti","bioedilizia","biodiversita","controinformazione","cbd-en","cannabis-legalization","medical-cannabis","cannabis-light-en","hemp-sustainability","cannabinoids","patient-rights","anti-prohibition","corte-di-cassazione","sentenze-ue","tar","filiera-canapa","coa","epilessia","oncologia","autismo","gravidanza","fitodepurazione","bioenergia","canapa-sport","disinformazione","politiche-internazionali","court-rulings","eu-policy","epilepsy","oncology","autism","pregnancy","bioenergy","soil-regeneration","misinformation","international-policy"] as const;

/** Tag già presenti nei contenuti, fuori dalla whitelist editoriale: da normalizzare in una fase dedicata (senza cambiare gli MDX qui). */
const BLOG_TAG_WHITELIST_LEGACY = ["1925","25-aprile","420","affiliate-program","affiliate-programs","affiliazione","ai","albania-cannabis","albania-medical-cannabis","alfredo-mantovano","alimentazione","allattamento","alternativa-allalcol","ambiente","anti-aging","api","april-25","aromatherapy-devices","articolo-187","attivismo","autism-research","bees","bellezza-naturale","benefici-della-canapa","benessere","benessere-autismo","benessere-cucina","best-hemp-varieties","best-seed-banks","best-vaporizers","bilancio-2025","biodiversity","borghi-italiani","brain","california-sober","california-sober-en","canada","canapa","canapa industriale","canapa-e-sostenibilita","canapa-legale","canapa-legale-italia","canapa-sativa","canapa-sostenibile","canapa-terapeutica","canapalandia-partner","cancro","cannabidiol-and-autism","cannabielsoxa","cannabis","Cannabis","cannabis italia","cannabis light","cannabis-culture","cannabis-day","cannabis-e-propaganda","cannabis-europa","cannabis-europe","cannabis-it","cannabis-laws","cannabis-legale","cannabis-legale-2025","cannabis-legalization-2025","cannabis-legalization-italy","cannabis-lifestyle","cannabis-light-decreto-sicurezza","cannabis-light-in-italy","cannabis-light-vietata","cannabis-marocco","cannabis-news","cannabis-oil","cannabis-referendum","cannabis-regulation-italy","cannabis-repression","cannabis-sativa","cannabis-seed-banks","cannabis-seeds","cannabis-slovenia","cannabis-therapy","cannabis-tourism","CBD","cbd-2025","cbd-ansia","cbd-for-sleep","cbd-guide","cbd-in-italy","cbd-legal-europe","certificazioni-canapa","cervello","civil-rights","coltivazione","coltivazione-canapa-2025","coltivazione-domestica-cannabis","coltivazione-legale","corte-di-giustizia-ue","cosmetici-canapa","cucina-naturale","cura-della-pelle","decreto-sicurezza-2025","dieta-vegana","dietavegana","direttiva-ue-2015-1535","disinformazione-mediatica","during","easyjoint","eco-friendly-construction","eco-friendly-textiles","epilessia-e-cannabis","fake-news-en","female-wellness","filiera canapa","futuro-green","germania","giustizia-sociale-cannabis","global-420","green-building","green-future","guida","guida-pratica","health-benefits-of-cannabis","hemp-and-heart-health","hemp-bioenergy","hemp-cultivation","hemp-fashion","hemp-nutrition","hemp-seeds","hemp-snacks","hemp-sports","hemp-strains-2025","hempcrete-en","herb-vaporizers","hhc","hhc-regulation-eu","hormonal-health","innovazione","intelligenza-artificiale","intossicazione-cannabis","invecchiamento","italy","italy-cannabis-policy","jose-mujica","legal-cannabis-usa","legal-cultivation","legal-hemp","legale","legalizzazione","legalizzazione cannabis","liberation-day","liberazione","light-cannabis","menopausa","menopause","modelli-cannabis-usa-italia","natural-anti-inflammatory","neuroprotezione","neuroscienze","new-cannabinoids","normativa","normativa canapa","normativa cannabis","normativa Italia","normativa-2025","normativa-canapa","novel food","nuovi-cannabinoidi","olio-di-canapa","omega-3","omega3","ormones","partner-selezionati","pasqua canapa","pelle-sana","politica droghe","Politiche Internazionali","politics","processo","prodotti-naturali-canapa","proibizionismo-cannabis","qualità","regolazione-ormonale","renewable-resources","Report 2026","ricerca","salute-e-cannabis","salute-mentale","seedsman","semi-da-collezione","sicurezza","skincare","smoothie-bowl","social-justice-cannabis","sonno-migliore","storia-della-cannabis","superfood","superfood-en","sustainability","sustainable-fabrics","sustainable-hemp","technology","test-antidroga","thc-en","therapeutic-cannabis","turismocannabis","ue","uruguay","vaporizzatori","varieta-di-canapa","vegan-diet","verita","weed-travel"] as const;

const BLOG_TAG_ALLOWED = new Set<string>([
  ...BLOG_TAG_WHITELIST_EDITORIAL,
  ...BLOG_TAG_WHITELIST_LEGACY,
]);

const blog = defineCollection({
  // 2. Rimosso type: "content" e aggiunto il loader.
  // Se i tuoi file si trovano in una cartella diversa da "src/content/blog", aggiorna il percorso di 'base' qui sotto.
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }), 
  schema: z
    .object({
      title: z.string(),
      description: z.string().optional(),
      slug: z.string().optional(),
      publishDate: z.coerce.date().optional(),
      updatedDate: z.coerce.date().optional(),
      author: z.string().optional(),
      draft: z.boolean().optional(), // Mantenuto per compatibilità
      status: z.enum(["ready", "draft", "test"]).default("ready"),
      category: z.enum(BLOG_CATEGORY_WHITELIST).optional(),
      categories: z.array(z.string()).optional(), // Tutte le categorie (se disponibili)
      tags: z
        .array(z.string())
        .max(3)
        .default([])
        .superRefine((arr, ctx) => {
          arr.forEach((tag, i) => {
            if (!BLOG_TAG_ALLOWED.has(tag)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Tag non in whitelist: ${JSON.stringify(tag)}`,
                path: [i],
              });
            }
          });
        }),
      coverImage: z.string().optional(),
      coverAlt: z.string().optional(),
      image: z.string().optional(), // Alias per coverImage
      canonical: z.string().optional(),
      homeFeatured: z.boolean().optional(), // Flag per selezione editoriale "In evidenza"
      homeFeaturedRank: z.number().optional(), // Priorità manuale (più basso = più importante)
      socialShare: z.boolean().optional(),
      socialEvergreen: z.boolean().optional(),
      instagramShare: z.boolean().optional(),
      instagramImage: z.string().optional(),
      showShare: z.boolean().optional(), // Disabilita sezione share per singolo post
      showSupportCta: z.boolean().optional(), // Disabilita CTA sostegno per singolo post
      attachments: z
        .array(
          z.object({
            title: z.string(),
            url: z.string(),
            description: z.string().optional(),
            source: z.string().optional(),
            date: z.coerce.date().optional(),
            type: z.enum(["pdf", "document"]).default("pdf"),
          }),
        )
        .default([]),
    })
    .superRefine((data, ctx) => {
      // Se status === "ready", allora publishDate, category e almeno una tra image o coverImage devono essere presenti
      if (data.status === "ready") {
        if (!data.publishDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "publishDate è obbligatorio quando status è 'ready'",
            path: ["publishDate"],
          });
        }
        if (!data.category) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "category è obbligatoria quando status è 'ready'",
            path: ["category"],
          });
        }
        if (!data.image && !data.coverImage) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "almeno uno tra image o coverImage è obbligatorio quando status è 'ready'",
            path: ["image"],
          });
        }
      }
    }),
});

export const collections = { blog };
