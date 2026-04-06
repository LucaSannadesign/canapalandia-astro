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
      tags: z.array(z.string()).max(3).default([]),
      coverImage: z.string().optional(),
      coverAlt: z.string().optional(),
      image: z.string().optional(), // Alias per coverImage
      canonical: z.string().optional(),
      homeFeatured: z.boolean().optional(), // Flag per selezione editoriale "In evidenza"
      homeFeaturedRank: z.number().optional(), // Priorità manuale (più basso = più importante)
      showShare: z.boolean().optional(), // Disabilita sezione share per singolo post
      showSupportCta: z.boolean().optional(), // Disabilita CTA sostegno per singolo post
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