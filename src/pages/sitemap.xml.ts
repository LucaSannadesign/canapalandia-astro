import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { loadWp } from "../lib/wp";
import { slugifyTagForUrl, tagArchiveShouldIndex } from "../lib/tagIndexPolicy";

export const prerender = false;

// Base URL: usa SITE da config o fallback
const SITE_URL = import.meta.env.SITE || "https://canapalandia.com";

// Escape XML
function escapeXml(input: unknown): string {
  const s = String(input ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Formatta data per lastmod (W3C format: YYYY-MM-DD)
function formatLastmod(date: string | undefined): string | undefined {
  if (!date) return undefined;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return undefined;
    return d.toISOString().split("T")[0]; // YYYY-MM-DD
  } catch {
    return undefined;
  }
}

// Normalizza URL: assicura trailing slash e base URL assoluto
function normalizeUrl(path: string): string {
  if (!path) return `${SITE_URL}/`;
  // Se già assoluto, ritorna così
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path.endsWith("/") ? path : `${path}/`;
  }
  // Se relativo, aggiungi base e trailing slash
  const cleanPath = path.replace(/^\/+|\/+$/g, "");
  return cleanPath ? `${SITE_URL}/${cleanPath}/` : `${SITE_URL}/`;
}

async function indexableTagEntries(): Promise<Array<{ loc: string; lastmod?: string }>> {
  let posts;
  try {
    posts = await getCollection(
      "blog",
      ({ data }) => data.draft !== true && data.status !== "draft",
    );
  } catch {
    return [];
  }

  const acc = new Map<string, { count: number; last: Date }>();
  for (const p of posts) {
    const raw = p.data.publishDate ?? p.data.updatedDate;
    const d = raw ? new Date(String(raw)) : null;
    const tValid = d && !Number.isNaN(d.getTime()) ? d : null;
    for (const label of p.data.tags || []) {
      const slug = slugifyTagForUrl(String(label));
      if (!slug) continue;
      const cur = acc.get(slug) || { count: 0, last: new Date(0) };
      cur.count += 1;
      if (tValid && tValid > cur.last) cur.last = tValid;
      acc.set(slug, cur);
    }
  }

  const out: Array<{ loc: string; lastmod?: string }> = [];
  for (const [slug, { count, last }] of acc) {
    if (!tagArchiveShouldIndex(slug, count)) continue;
    const lastmod =
      last.getTime() > 0 ? formatLastmod(last.toISOString()) : undefined;
    out.push({ loc: normalizeUrl(`tag/${slug}`), lastmod });
  }
  return out;
}

export const GET: APIRoute = async () => {
  const { entries } = await loadWp();

  let blogPosts: CollectionEntry<"blog">[] = [];
  try {
    blogPosts = await getCollection(
      "blog",
      ({ data }) => data.draft !== true && data.status !== "draft",
    );
  } catch {
    blogPosts = [];
  }

  const blogPublicSlugByKey = new Map<string, string>();
  for (const post of blogPosts) {
    const publicSlug = (post.data?.slug || post.id || "").trim();
    if (!publicSlug) continue;
    blogPublicSlugByKey.set(post.id, publicSlug);
    const dataSlug = (post.data?.slug || "").trim();
    if (dataSlug) blogPublicSlugByKey.set(dataSlug, publicSlug);
  }

  const SITEMAP_DEBUG_LEGACY_SLUGS = [
    "cbd-per-la-cura-della-pelle-guida-2025-prodotti-nordic-oil",
    "cbd-legale-2025-decreto-sicurezza",
    "decreto-sicurezza-cannabis-light-2025",
    "legalizzazione-cannabis-europa-2025-aggiornamenti",
  ];
  for (const k of SITEMAP_DEBUG_LEGACY_SLUGS) {
    console.log(
      "[sitemap debug] blogPublicSlugByKey",
      k,
      "->",
      blogPublicSlugByKey.get(k) ?? "(missing)",
    );
  }

  function blogPathForSitemap(path: string): string {
    const trimmed = path.replace(/^\/+|\/+$/g, "");
    if (!trimmed) return path;

    let candidate: string | null = null;
    if (trimmed.startsWith("blog/")) {
      const segment = trimmed.slice("blog/".length);
      if (!segment) return path;
      candidate = segment;
    } else if (!trimmed.includes("/")) {
      candidate = trimmed;
    } else {
      return path;
    }

    const publicSlug = blogPublicSlugByKey.get(candidate);
    if (!publicSlug) return path;
    return `blog/${publicSlug}`;
  }

  // Pagine statiche da includere sempre
  const staticPages = [
    "", // home
    "blog",
    "ribaltatore",
    "frasi-ribaltate",
    "cerca",
    "contatti",
    "cookie-policy",
  ];

  const urls: Array<{ loc: string; lastmod?: string }> = [];

  // Aggiungi pagine statiche
  for (const page of staticPages) {
    urls.push({
      loc: normalizeUrl(page),
    });
  }

  // Aggiungi entries (post e page) con path valido
  for (const entry of entries) {
    // Escludi entry senza path valido
    if (!entry.path || entry.path.trim() === "") continue;
    
    // Escludi route tecniche e tassonomie
    if (
      entry.path.startsWith("tag/") ||
      entry.path.startsWith("categoria/") ||
      entry.path.startsWith("autore/") ||
      entry.path.startsWith("en/tag/") ||
      entry.path.startsWith("en/categoria/") ||
      entry.path.startsWith("en/autore/") ||
      entry.path.startsWith("en/author/") ||
      entry.path.startsWith("partials/") ||
      entry.path.startsWith("en/") ||
      entry.path.includes("/partials/") ||
      entry.path.startsWith("go/") ||
      entry.path === "partner-selezionati"
    ) {
      continue;
    }

    // Costruisci URL (post blog: slug evergreen da content collection se presente)
    if (
      SITEMAP_DEBUG_LEGACY_SLUGS.some(
        (k) => entry.path === k || entry.path === `blog/${k}`,
      )
    ) {
      console.log(
        "[sitemap debug] path",
        entry.path,
        "->",
        blogPathForSitemap(entry.path),
      );
    }
    const url = normalizeUrl(blogPathForSitemap(entry.path));
    
    // Aggiungi lastmod se disponibile (preferisci modified, fallback a date)
    const lastmod = formatLastmod(entry.modified || entry.date);
    
    urls.push({
      loc: url,
      lastmod,
    });
  }

  for (const t of await indexableTagEntries()) {
    urls.push(t);
  }

  // Genera XML sitemap
  const now = new Date().toISOString().split("T")[0];
  
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((item) => {
        const lastmodTag = item.lastmod
          ? `    <lastmod>${escapeXml(item.lastmod)}</lastmod>\n`
          : "";
        return (
          `  <url>\n` +
          `    <loc>${escapeXml(item.loc)}</loc>\n` +
          lastmodTag +
          `  </url>\n`
        );
      })
      .join("") +
    `</urlset>\n`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600", // Cache 1h su CDN
    },
  });
};
