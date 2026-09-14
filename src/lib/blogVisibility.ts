import type { CollectionEntry } from "astro:content";

/** Restituisce la data di pubblicazione valida del post, se presente. */
export function blogPublishDate(entry: CollectionEntry<"blog">): Date | null {
  const raw = entry.data.publishDate;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

function meetsPublicationGate(
  entry: CollectionEntry<"blog">,
  now: Date,
): boolean {
  if (entry.data.draft === true) return false;
  if (entry.data.status !== "ready") return false;

  const publishDate = blogPublishDate(entry);
  return publishDate !== null && publishDate.getTime() <= now.getTime();
}

/**
 * Un post e raggiungibile sul suo URL se supera il gate editoriale normale.
 * Durante `astro dev`, invece, consentiamo la raggiungibilita diretta anche a
 * bozze e contenuti futuri: e il gate di preview locale usato per il controllo
 * umano prima della pubblicazione.
 *
 * `import.meta.env.DEV` e false in build, `astro preview` e deploy, quindi questa
 * eccezione non puo rendere pubblica online una bozza.
 */
export function isReachableBlogEntry(
  entry: CollectionEntry<"blog">,
  now: Date = new Date(),
): boolean {
  if (import.meta.env.DEV) return true;
  return meetsPublicationGate(entry, now);
}

/**
 * Un post e pubblicabile nei percorsi editoriali solo se supera comunque il
 * gate di pubblicazione ed e fuori dalla quarantena editoriale. La modalita
 * dev locale non inserisce quindi bozze o contenuti futuri in feed, archivi,
 * correlati, hreflang o automazioni.
 */
export function isPublishedBlogEntry(
  entry: CollectionEntry<"blog">,
  now: Date = new Date(),
): boolean {
  return (
    meetsPublicationGate(entry, now) &&
    entry.data.editorialStatus !== "legacy-review"
  );
}
