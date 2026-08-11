import type { CollectionEntry } from "astro:content";

/** Restituisce la data di pubblicazione valida del post, se presente. */
export function blogPublishDate(entry: CollectionEntry<"blog">): Date | null {
  const raw = entry.data.publishDate;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Un post è raggiungibile sul suo URL se è esplicitamente pronto, non è marcato
 * draft e la sua data di pubblicazione non è futura. Questo include i contenuti
 * `legacy-review`, che devono conservare lo storico URL durante la revisione.
 */
export function isReachableBlogEntry(
  entry: CollectionEntry<"blog">,
  now: Date = new Date(),
): boolean {
  if (entry.data.draft === true) return false;
  if (entry.data.status !== "ready") return false;

  const publishDate = blogPublishDate(entry);
  return publishDate !== null && publishDate.getTime() <= now.getTime();
}

/**
 * Un post è pubblicabile nei percorsi editoriali solo se è raggiungibile e non
 * è in quarantena editoriale. Le pagine `legacy-review` restano quindi vive sul
 * loro URL ma non vengono proposte in feed, archivi, correlati o automazioni.
 */
export function isPublishedBlogEntry(
  entry: CollectionEntry<"blog">,
  now: Date = new Date(),
): boolean {
  return (
    isReachableBlogEntry(entry, now) &&
    entry.data.editorialStatus !== "legacy-review"
  );
}
