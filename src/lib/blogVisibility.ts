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
 * Abilita l'anteprima editoriale solo nel server di sviluppo locale e solo
 * quando l'operatore la richiede esplicitamente. In build/preview/deploy
 * `import.meta.env.DEV` è false, quindi questa eccezione non può rendere
 * raggiungibili bozze o contenuti futuri online.
 */
function isExplicitLocalPreview(): boolean {
  return import.meta.env.DEV && process.env.CANAPALANDIA_LOCAL_PREVIEW === "1";
}

/**
 * Un post è raggiungibile sul suo URL se è esplicitamente pronto, non è marcato
 * draft e la sua data di pubblicazione non è futura. Questo include i contenuti
 * `legacy-review`, che devono conservare lo storico URL durante la revisione.
 *
 * In sviluppo locale, `CANAPALANDIA_LOCAL_PREVIEW=1` consente di aprire anche
 * bozze e contenuti futuri senza modificarne frontmatter o data editoriale.
 */
export function isReachableBlogEntry(
  entry: CollectionEntry<"blog">,
  now: Date = new Date(),
): boolean {
  return isExplicitLocalPreview() || meetsPublicationGate(entry, now);
}

/**
 * Un post è pubblicabile nei percorsi editoriali solo se supera comunque il
 * gate di pubblicazione ed è fuori dalla quarantena editoriale. La preview
 * locale non inserisce quindi bozze o contenuti futuri in feed, archivi,
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
