import type { CollectionEntry } from "astro:content";
import { blogPublishDate, isPublishedBlogEntry } from "./blogVisibility";
import { blogEntryLanguage, type SiteLanguage } from "./localization";

/**
 * Ricerca interna del magazine (IT /cerca/ ed EN /en/search/).
 *
 * Fonte unica: la content collection `blog`, filtrata con lo stesso gate editoriale
 * di listing e feed (`isPublishedBlogEntry`). Nessun indice esterno né dipendenze:
 * con poche centinaia di articoli il match server-side in memoria resta nell'ordine
 * dei millisecondi.
 */

type BlogEntry = CollectionEntry<"blog">;

export const SEARCH_MAX_QUERY_LENGTH = 100;
export const SEARCH_RESULTS_LIMIT = 30;
const MAX_TOKENS = 8;

/** Minuscolo, senza accenti e senza punteggiatura: "Perché l’EFSA?" -> "perche l efsa". */
export function normalizeSearchText(input: unknown): string {
  if (typeof input !== "string" || !input) return "";
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Legge `q` (o `s`, compatibilità URL WordPress) e ne limita la lunghezza. */
export function readSearchQuery(url: URL): string {
  const raw = url.searchParams.get("q") ?? url.searchParams.get("s") ?? "";
  return raw.replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_QUERY_LENGTH);
}

export function tokenizeSearchQuery(query: string): string[] {
  const unique = [...new Set(normalizeSearchText(query).split(" ").filter(Boolean))];
  // Le parole di una lettera ("e", "a") matcherebbero tutto: le ignoriamo se c'è altro.
  const meaningful = unique.filter((t) => t.length > 1);
  return (meaningful.length ? meaningful : unique).slice(0, MAX_TOKENS);
}

/** Testo leggibile dal sorgente MD/MDX: via import/export, JSX/HTML, URL e sintassi markdown. */
function mdxToPlainText(body: unknown): string {
  if (typeof body !== "string") return "";
  return body
    .replace(/^\s*(import|export)\s.*$/gm, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, " $1 ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[{}]/g, " ");
}

type IndexedFields = { title: string; meta: string; description: string; body: string };

const indexCache = new Map<string, IndexedFields>();

function indexEntry(entry: BlogEntry): IndexedFields {
  const key = `${entry.id}:${(entry as { digest?: string }).digest ?? ""}`;
  const cached = indexCache.get(key);
  if (cached) return cached;

  const data = entry.data;
  const fields: IndexedFields = {
    title: normalizeSearchText(data.title),
    meta: normalizeSearchText([...(data.tags ?? []), data.category ?? ""].join(" ")),
    description: normalizeSearchText(data.description),
    body: normalizeSearchText(mdxToPlainText(entry.body)),
  };
  indexCache.set(key, fields);
  return fields;
}

/** 0 = nessun match. Tutte le parole devono comparire (anche come prefisso/parziale). */
function scoreEntry(fields: IndexedFields, tokens: string[], phrase: string): number {
  let score = 0;
  for (const token of tokens) {
    let tokenScore = 0;
    if (fields.title.includes(token)) tokenScore += 10;
    if (fields.meta.includes(token)) tokenScore += 5;
    if (fields.description.includes(token)) tokenScore += 3;
    if (fields.body.includes(token)) tokenScore += 1;
    if (!tokenScore) return 0;
    score += tokenScore;
  }
  if (tokens.length > 1 && fields.title.includes(phrase)) score += 20;
  return score;
}

function timeOf(entry: BlogEntry): number {
  return blogPublishDate(entry)?.getTime() ?? 0;
}

/** Articoli pubblicati nella lingua richiesta, dal più recente. */
export function searchablePosts(
  entries: BlogEntry[],
  language: SiteLanguage,
  now: Date = new Date(),
): BlogEntry[] {
  return entries
    .filter((entry) => isPublishedBlogEntry(entry, now) && blogEntryLanguage(entry.data) === language)
    .sort((a, b) => timeOf(b) - timeOf(a));
}

/** Tutti i match, ordinati per pertinenza e poi per data (il taglio lo fa la pagina). */
export function searchPosts(posts: BlogEntry[], tokens: string[]): BlogEntry[] {
  if (!tokens.length) return [];
  const phrase = tokens.join(" ");
  return posts
    .map((entry) => ({ entry, score: scoreEntry(indexEntry(entry), tokens, phrase) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || timeOf(b.entry) - timeOf(a.entry))
    .map((r) => r.entry);
}

export function postHref(entry: BlogEntry): string {
  return `/blog/${String(entry.data.slug || entry.id).trim()}/`;
}
