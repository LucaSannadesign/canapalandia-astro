/**
 * Policy SEO: quali hub `/categoria/[slug]/` sono `index,follow` (IT approvati).
 * Lo slug deve coincidere **esattamente** con `category` nel frontmatter (`content.config.ts` → `z.enum`).
 *
 * - **Normativa**: il pillar legale usa `category: "Normativa"` (maiuscola). Non risultano post con
 *   `normative-aspetti-legali`; non duplicare slug: un solo URL canonico per quel tema.
 * - Alcuni slug qui non hanno ancora post: la route risponde 404; la sitemap non li elenca finché
 *   non esiste almeno un articolo con `category` corrispondente.
 */
export const CATEGORY_INDEX_ALLOWLIST = new Set<string>([
  "cannabis-news-it",
  "Normativa",
  "salute-benessere",
  "cbd-alimentazione",
  "coltivazione-legale",
  "novita-tendenze",
  "canapa-e-ambiente",
  "cbd-bellezza-cura-pelle",
  "guide-tutorial",
  "ribellario",
  "cannabis-e-innovazione",
]);
