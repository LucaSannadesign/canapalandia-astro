import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { CATEGORY_INDEX_ALLOWLIST } from "../lib/categoryIndexAllowlist";

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
  // evergreenRedirects: categorie WP thin → hub
  "categoria/cbd-sport-recupero",
  "categoria/cbd-animali",
  "categoria/stili-di-vita-testimonianze",
  "categoria/partner-e-affiliazioni",
]);

function isRedirectSourcePath(pathRel: string): boolean {
  const p = normalizePathKey(pathRel);
  return REDIRECT_SOURCE_PATHS.has(p);
}

function postLastmodIso(post: CollectionEntry<"blog">): string | undefined {
  const dateRaw = post.data.updatedDate ?? post.data.publishDate;
  if (!dateRaw) return undefined;
  const d = dateRaw instanceof Date ? dateRaw : new Date(String(dateRaw));
  if (Number.isNaN(d.getTime())) return undefined;
  return formatLastmod(d.toISOString());
}

function maxLastmodFromPosts(posts: CollectionEntry<"blog">[]): string | undefined {
  let best: number | undefined;
  for (const p of posts) {
    const d = p.data.updatedDate ?? p.data.publishDate;
    if (!d) continue;
    const t = new Date(d instanceof Date ? d : String(d)).getTime();
    if (Number.isNaN(t)) continue;
    if (best === undefined || t > best) best = t;
  }
  return best !== undefined ? formatLastmod(new Date(best).toISOString()) : undefined;
}

export const GET: APIRoute = async () => {
  let blogPosts: CollectionEntry<"blog">[] = [];
  try {
    blogPosts = await getCollection(
      "blog",
      ({ data }) => data.draft !== true && data.status !== "draft",
    );
  } catch {
    blogPosts = [];
  }

  const urls: Array<{ loc: string; lastmod?: string }> = [];

  // Articoli: solo URL pubblici /blog/[slug]/ (slug canonico evergreen)
  for (const post of blogPosts) {
    const publicSlug = (post.data?.slug || post.id || "").trim();
    if (!publicSlug) continue;
    const relPath = normalizePathKey(`blog/${publicSlug}`);
    if (isRedirectSourcePath(relPath)) continue;
    urls.push({
      loc: normalizeUrl(`blog/${publicSlug}`),
      lastmod: postLastmodIso(post),
    });
  }

  // Categorie IT: solo hub in allowlist con almeno un post (URL slug in minuscolo per canone).
  for (const slug of CATEGORY_INDEX_ALLOWLIST) {
    const inCat = blogPosts.filter((p) => (p.data.category || "") === slug);
    if (inCat.length === 0) continue;

    const relCat = normalizePathKey(`categoria/${slug.toLowerCase()}`);
    if (isRedirectSourcePath(relCat)) continue;
    const lastmodCat = maxLastmodFromPosts(inCat);
    urls.push({
      loc: normalizeUrl(`categoria/${slug.toLowerCase()}`),
      lastmod: lastmodCat,
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
