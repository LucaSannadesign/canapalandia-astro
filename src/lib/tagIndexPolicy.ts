/**
 * Policy SEO per archive tag IT: quali URL /tag/[slug]/ sono indexabili.
 * Replicabile: soglia post + piccola allowlist editoriale, niente keyword stuffing.
 */

/** Soglia “tag forte” solo per volume (post pubblicati, collection blog). */
export const TAG_INDEX_MIN_POSTS = 4;

/**
 * Tag editoriali / hub: possono essere index anche con meno post (minimo assoluto sotto).
 * Slug = segmento URL in minuscolo (come da link interni slugificati).
 */
export const TAG_INDEX_SLUG_ALLOWLIST = new Set<string>([
  "cbd",
  "cannabis",
  "cannabis-light",
  "canapa",
  "cannabis-news",
  "legalizzazione-cannabis",
  "normativa",
  "decreto-sicurezza",
  "canapalegale",
  "cannabislight",
]);

const TAG_INDEX_ALLOWLIST_MIN_POSTS = 2;

/** Junk WordPress (slug numerico): mai in indice. */
function isJunkTagSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (s.length < 2) return true;
  return /^\d+$/.test(s);
}

/**
 * Allinea label tag in frontmatter agli URL /tag/... (come BlogSidebar).
 */
export function slugifyTagForUrl(label: string): string {
  return String(label)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function tagArchiveShouldIndex(urlSlug: string, postCount: number): boolean {
  if (postCount < 1) return false;
  const s = urlSlug.trim().toLowerCase();
  if (isJunkTagSlug(s)) return false;

  if (TAG_INDEX_SLUG_ALLOWLIST.has(s) && postCount >= TAG_INDEX_ALLOWLIST_MIN_POSTS) {
    return true;
  }
  return postCount >= TAG_INDEX_MIN_POSTS;
}
