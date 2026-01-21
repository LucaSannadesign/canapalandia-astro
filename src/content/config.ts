import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    slug: z.string().optional(),
    publishDate: z.coerce.date().optional(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().optional(),
    draft: z.boolean().optional(),
    category: z.string().optional(), // Categoria primaria (per compatibilità)
    categories: z.array(z.string()).optional(), // Tutte le categorie (se disponibili)
    tags: z.array(z.string()).default([]),
    coverImage: z.string().optional(),
    coverAlt: z.string().optional(),
    image: z.string().optional(), // Alias per coverImage
    canonical: z.string().optional(),
    homeFeatured: z.boolean().optional(), // Flag per selezione editoriale "In evidenza"
    homeFeaturedRank: z.number().optional(), // Priorità manuale (più basso = più importante)
    showShare: z.boolean().optional(), // Disabilita sezione share per singolo post
    showSupportCta: z.boolean().optional(), // Disabilita CTA sostegno per singolo post
  }),
});

export const collections = { blog };
