import type { CollectionEntry } from "astro:content";

/** Restituisce la data di pubblicazione valida del post, se presente. */
export function blogPublishDate(entry: CollectionEntry<"blog">): Date | null {
  const raw = entry.data.publishDate;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Un post è pubblico solo se è esplicitamente pronto, non è marcato draft
 * e la sua data di pubblicazione non è futura.
 */
export function isPublishedBlogEntry(
  entry: CollectionEntry<"blog">,
  now: Date = new Date(),
): boolean {
  if (entry.data.draft === true) return false;
  if (entry.data.status !== "ready") return false;

  const publishDate = blogPublishDate(entry);
  return publishDate !== null && publishDate.getTime() <= now.getTime();
}
