import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    slug: z.string(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date(),
    author: z.string(),
    category: z.string().optional(),
    tags: z.array(z.string()).default([]),
    coverImage: z.string().optional(),
    coverAlt: z.string().optional(),
    canonical: z.string().optional(),
  }),
});

export const collections = { blog };
