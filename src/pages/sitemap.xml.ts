import type { APIRoute } from "astro";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getCollection, type CollectionEntry } from "astro:content";
import { CATEGORY_INDEX_ALLOWLIST } from "../lib/categoryIndexAllowlist";
import { normalizeCategorySlug } from "../lib/categoryUrl";
import { isPublishedBlogEntry } from "../lib/blogVisibility";
import { loadWp } from "../lib/wp";

const PAGES_DIR = fileURLToPath(new URL("../pages", import.meta.url));

/** Hub statici indicizzabili: incluse in sitemap solo se la route esiste (Astro o pagina WP). */
const STRUCTURAL_ROUTES = [
  "/",
  "/blog/",
  "/chi-siamo/",
  "/missione/",
  "/la-nostra-storia/",
  "/pubblicita/",
  "/i-nostri-partner/",
  "/sostieni-la-causa/",
  "/disclaimer/",
  "/contatti/",
] as const;

/** Route Astro fondamentali: esistono per contratto applicativo e non dipendono dal filesystem runtime. */
const ALWAYS_INCLUDE_STRUCTURAL_ROUTES = new Set<string>(["/", "/blog/"]);

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
  "cbd-legale-2025-decreto-sicurezza",
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Route Astro in `src/pages` (stesso criterio di `scripts/generate-sitemap-pages.mjs`). */
async function astroRouteExists(route: string): Promise<boolean> {
  const clean = normalizePathKey(route);
  if (!clean) {
    return fileExists(join(PAGES_DIR, "index.astro"));
  }

  const candidates = [
    join(PAGES_DIR, `${clean}.astro`),
    join(PAGES_DIR, `${clean}.md`),
    join(PAGES_DIR, `${clean}.mdx`),
    join(PAGES_DIR, clean, "index.astro"),
    join(PAGES_DIR, clean, "index.md"),
    join(PAGES_DIR, clean, "index.mdx"),
  ];

  for (const p of candidates) {
    if (await fileExists(p)) return true;
  }
  return false;
}

async function loadWpPagePaths(): Promise<Set<string>> {
  const paths = new Set<string>();
  try {
    const { entries } = await loadWp();
    for (const e of entries) {
      if (e.kind !== "page" || !e.path) continue;
      const p = normalizePathKey(e.path);
      if (!p || p.startsWith("en/")) continue;
      paths.add(p);
    }
  } catch {
    // WP export assente o illeggibile: solo route Astro
  }
  return paths;
}

async function structuralRouteExists(
  route: string,
  wpPagePaths: Set<string>,
): Promise<boolean> {
  if (ALWAYS_INCLUDE_STRUCTURAL_ROUTES.has(route)) return true;
  if (await astroRouteExists(route)) return true;
  const rel = normalizePathKey(route);
  return rel !== "" && wpPagePaths.has(rel);
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
    const allPosts = await getCollection("blog");
    const now = new Date();
    blogPosts = allPosts.filter((post) => isPublishedBlogEntry(post, now));
  } catch {
    blogPosts = [];
  }

  const urls: Array<{ loc: string; lastmod?: string }> = [];

  const wpPagePaths = await loadWpPagePaths();
  for (const route of STRUCTURAL_ROUTES) {
    const rel = normalizePathKey(route);
    if (rel && isRedirectSourcePath(rel)) continue;
    if (!(await structuralRouteExists(route, wpPagePaths))) continue;
    urls.push({ loc: normalizeUrl(route) });
  }

  // Articoli: solo URL pubblici /blog/[slug]/ (slug canonico evergreen)
  const NOINDEX_SLUG_RE = /bozza|\/bozza|^test-/i;
  for (const post of blogPosts) {
    const publicSlug = (post.data?.slug || post.id || "").trim();
    if (!publicSlug) continue;
    if (NOINDEX_SLUG_RE.test(publicSlug)) continue;
    const relPath = normalizePathKey(`blog/${publicSlug}`);
    if (isRedirectSourcePath(relPath)) continue;
    urls.push({
      loc: normalizeUrl(`blog/${publicSlug}`),
      lastmod: postLastmodIso(post),
    });
  }

  // Categorie IT: solo hub in allowlist con almeno un post pubblico.
  for (const slug of CATEGORY_INDEX_ALLOWLIST) {
    const canonicalCategorySlug = normalizeCategorySlug(slug);
    const inCat = blogPosts.filter(
      (p) => normalizeCategorySlug(p.data.category || "") === canonicalCategorySlug,
    );
    if (inCat.length === 0) continue;

    const relCat = normalizePathKey(`categoria/${canonicalCategorySlug}`);
    if (isRedirectSourcePath(relCat)) continue;
    const lastmodCat = maxLastmodFromPosts(inCat);
    urls.push({
      loc: normalizeUrl(`categoria/${canonicalCategorySlug}`),
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