import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { loadWp } from "../lib/wp";

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

/** Path relativo senza slash iniziale/finale (come `entry.path` / segmenti statici). */
function normalizePathKey(path: string): string {
  return path.replace(/^\/+|\/+$/g, "").trim();
}

/**
 * Sorgenti redirect 301/302 (allineate a `astro.config.mjs` + `vercel.json`).
 * La sitemap deve elencare solo URL finali indicizzabili, non le URL sorgente.
 */
const REDIRECT_SOURCE_PATHS = new Set<string>([
  // astro.config.mjs → evergreenRedirects (chiavi)
  "blog/cannabis-laws-italy-2025",
  "blog/top-hemp-strains-2025",
  "blog/medical-cannabis-slovenia-albania-italy-2025",
  "blog/italy-light-cannabis-ban-security-decree-2025",
  "blog/cannabis-light-italia-europa-luglio-novembre-2025",
  "blog/cbd-legale-2025-decreto-sicurezza",
  "blog/best-cbd-strains-2025",
  "blog/cbd-per-la-cura-della-pelle-guida-2025-prodotti-nordic-oil",
  "blog/decreto-sicurezza-cannabis-light-2025",
  "blog/legalizzazione-cannabis-europa-2025-aggiornamenti",
  "tag",
  "blog/page/1",
  // vercel.json → redirects[].source (path unici)
  "categoria",
  "autore",
  "cannabis-light-corte-giustizia-ue",
  "italia-stretta-cannabis-light",
  "decreto-sicurezza-2025",
  "blog-cannabis-Italia",
]);

function isRedirectSourcePath(pathRel: string): boolean {
  const p = normalizePathKey(pathRel);
  return REDIRECT_SOURCE_PATHS.has(p);
}

/** Yoast: pagina esplicitamente noindex → non in sitemap. */
function isYoastNoindex(entry: { yoastHeadJson?: { robots?: { index?: string } } }): boolean {
  const idx = entry.yoastHeadJson?.robots?.index;
  return typeof idx === "string" && idx.toLowerCase() === "noindex";
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
    if (isRedirectSourcePath(page)) continue;
    urls.push({
      loc: normalizeUrl(page),
    });
  }

  // Post blog: solo URL dalla content collection (slug pubblico evergreen)
  for (const post of blogPosts) {
    const publicSlug = (post.data?.slug || post.id || "").trim();
    if (!publicSlug) continue;
    const relPath = normalizePathKey(`blog/${publicSlug}`);
    if (isRedirectSourcePath(relPath)) continue;
    const dateRaw = post.data.updatedDate ?? post.data.publishDate;
    let lastmod: string | undefined;
    if (dateRaw) {
      const d = dateRaw instanceof Date ? dateRaw : new Date(String(dateRaw));
      if (!Number.isNaN(d.getTime())) lastmod = formatLastmod(d.toISOString());
    }
    urls.push({
      loc: normalizeUrl(`blog/${publicSlug}`),
      lastmod,
    });
  }

  // Aggiungi entries (post e page) con path valido
  for (const entry of entries) {
    // Escludi entry senza path valido
    if (!entry.path || entry.path.trim() === "") continue;

    // Post WordPress: già coperti dalla content collection sopra
    if (entry.kind === "post") continue;

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

    if (isYoastNoindex(entry)) continue;
    if (isRedirectSourcePath(entry.path)) continue;

    const url = normalizeUrl(entry.path);

    // Aggiungi lastmod se disponibile (preferisci modified, fallback a date)
    const lastmod = formatLastmod(entry.modified || entry.date);

    urls.push({
      loc: url,
      lastmod,
    });
  }

  // Una sola entry per URL (prima occorrenza vince).
  const seenLoc = new Set<string>();
  const deduped: typeof urls = [];
  for (const item of urls) {
    if (seenLoc.has(item.loc)) continue;
    seenLoc.add(item.loc);
    deduped.push(item);
  }

  // Genera XML sitemap
  
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    deduped
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
