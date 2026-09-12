import type { APIRoute } from "astro";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getCollection, type CollectionEntry } from "astro:content";
import { CATEGORY_INDEX_ALLOWLIST } from "../lib/categoryIndexAllowlist";
import { normalizeCategorySlug } from "../lib/categoryUrl";
import { isPublishedBlogEntry } from "../lib/blogVisibility";
import {
  BLOG_TRANSLATION_PAIRS,
  EN_BLOG_CATEGORIES,
  languageFromCategory,
  translationAlternates,
} from "../lib/localization";
import { findPageTranslationPair, PAGE_TRANSLATION_PAIRS } from "../lib/siteLocalization";
import { loadWp } from "../lib/wp";

const PAGES_DIR = fileURLToPath(new URL("../pages", import.meta.url));

const IT_STRUCTURAL_ROUTES = [
  "/",
  "/blog/",
  "/lab/",
  "/chi-siamo/",
  "/chi-siamo/missione/",
  "/la-nostra-storia/",
  "/pubblicita/",
  "/collabora-con-canapalandia/",
  "/i-nostri-partner/",
  "/sostieni-la-nostra-causa/",
  "/disclaimer-legale-canapalandia/",
  "/privacy-policy/",
  "/cookie-policy/",
  "/termini-e-condizioni/",
  "/mappa-del-sito/",
  "/contatti/",
  "/ribaltatore/",
  "/frasi-ribaltate/",
] as const;

const EN_STRUCTURAL_ROUTES = [
  "/en/",
  "/en/blog/",
  "/en/news/",
  "/en/policy/",
  "/en/cbd/",
  "/en/hemp/",
  "/en/lab/",
  "/en/about/",
  "/en/mission/",
  "/en/our-story/",
  "/en/partners/",
  "/en/advertising/",
  "/en/collaborate/",
  "/en/support/",
  "/en/disclaimer/",
  "/en/privacy/",
  "/en/cookies/",
  "/en/terms/",
  "/en/sitemap/",
  "/en/contact/",
  "/en/ribaltatore/",
  "/en/frasi-ribaltate/",
] as const;

const ALWAYS_INCLUDE_STRUCTURAL_ROUTES = new Set<string>([
  "/",
  "/blog/",
  "/lab/",
  ...EN_STRUCTURAL_ROUTES,
]);

export const prerender = false;
const SITE_URL = (import.meta.env.SITE || "https://canapalandia.com").replace(/\/+$/, "");

function escapeXml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatLastmod(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().split("T")[0];
}

function normalizeUrl(path: string): string {
  if (!path) return `${SITE_URL}/`;
  if (/^https?:\/\//i.test(path)) return path.endsWith("/") ? path : `${path}/`;
  const cleanPath = path.replace(/^\/+|\/+$/g, "");
  return cleanPath ? `${SITE_URL}/${cleanPath}/` : `${SITE_URL}/`;
}

function normalizePathKey(path: string): string {
  return path.replace(/^\/+|\/+$/g, "").trim();
}

const REDIRECT_SOURCE_PATHS = new Set<string>([
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
  "categoria",
  "autore",
  "cannabis-light-corte-giustizia-ue",
  "italia-stretta-cannabis-light",
  "decreto-sicurezza-2025",
  "cbd-legale-2025-decreto-sicurezza",
  "blog-cannabis-Italia",
  "categoria/cbd-sport-recupero",
  "categoria/cbd-animali",
  "categoria/stili-di-vita-testimonianze",
  "categoria/partner-e-affiliazioni",
]);

function isRedirectSourcePath(pathRel: string): boolean {
  return REDIRECT_SOURCE_PATHS.has(normalizePathKey(pathRel));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function astroRouteExists(route: string): Promise<boolean> {
  const clean = normalizePathKey(route);
  if (!clean) return fileExists(join(PAGES_DIR, "index.astro"));
  const candidates = [
    join(PAGES_DIR, `${clean}.astro`),
    join(PAGES_DIR, `${clean}.md`),
    join(PAGES_DIR, `${clean}.mdx`),
    join(PAGES_DIR, clean, "index.astro"),
    join(PAGES_DIR, clean, "index.md"),
    join(PAGES_DIR, clean, "index.mdx"),
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return true;
  }
  return false;
}

async function loadWpPagePaths(): Promise<Set<string>> {
  const paths = new Set<string>();
  try {
    const { entries } = await loadWp();
    for (const entry of entries) {
      if (entry.kind !== "page" || !entry.path) continue;
      const path = normalizePathKey(entry.path);
      if (!path || path.startsWith("en/")) continue;
      paths.add(path);
    }
  } catch {
    // Astro routes remain authoritative if the WordPress export is unavailable.
  }
  return paths;
}

async function structuralRouteExists(route: string, wpPagePaths: Set<string>): Promise<boolean> {
  if (ALWAYS_INCLUDE_STRUCTURAL_ROUTES.has(route)) return true;
  if (await astroRouteExists(route)) return true;
  const rel = normalizePathKey(route);
  return Boolean(rel && wpPagePaths.has(rel));
}

function postLastmodIso(post: CollectionEntry<"blog">): string | undefined {
  const value = post.data.updatedDate ?? post.data.publishDate;
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : formatLastmod(d.toISOString());
}

function maxLastmodFromPosts(posts: CollectionEntry<"blog">[]): string | undefined {
  let best = 0;
  for (const post of posts) {
    const value = post.data.updatedDate ?? post.data.publishDate;
    if (!value) continue;
    const time = new Date(value instanceof Date ? value : String(value)).getTime();
    if (!Number.isNaN(time)) best = Math.max(best, time);
  }
  return best ? formatLastmod(new Date(best).toISOString()) : undefined;
}

type Alternates = { it: string; en: string; xDefault: string };
type SitemapItem = { loc: string; lastmod?: string; alternates?: Alternates };

function pageAlternates(path: string): Alternates | undefined {
  const pair = findPageTranslationPair(path);
  if (!pair) return undefined;
  return {
    it: normalizeUrl(pair.it),
    en: normalizeUrl(pair.en),
    xDefault: normalizeUrl(pair.it),
  };
}

export const GET: APIRoute = async () => {
  let blogPosts: CollectionEntry<"blog">[] = [];
  try {
    const allPosts = await getCollection("blog");
    const now = new Date();
    blogPosts = allPosts.filter(
      (post) => isPublishedBlogEntry(post, now) && post.data.editorialStatus !== "legacy-review",
    );
  } catch {
    blogPosts = [];
  }

  const urls: SitemapItem[] = [];
  const wpPagePaths = await loadWpPagePaths();

  for (const route of IT_STRUCTURAL_ROUTES) {
    const rel = normalizePathKey(route);
    if (rel && isRedirectSourcePath(rel)) continue;
    if (!(await structuralRouteExists(route, wpPagePaths))) continue;
    urls.push({ loc: normalizeUrl(route), alternates: pageAlternates(route) });
  }

  for (const route of EN_STRUCTURAL_ROUTES) {
    if (!(await structuralRouteExists(route, wpPagePaths))) continue;
    urls.push({ loc: normalizeUrl(route), alternates: pageAlternates(route) });
  }

  const NOINDEX_SLUG_RE = /bozza|\/bozza|^test-/i;
  for (const post of blogPosts) {
    const publicSlug = String(post.data.slug || post.id || "").trim();
    if (!publicSlug || NOINDEX_SLUG_RE.test(publicSlug)) continue;
    const relPath = normalizePathKey(`blog/${publicSlug}`);
    if (isRedirectSourcePath(relPath)) continue;
    const translated = translationAlternates(publicSlug, SITE_URL);
    urls.push({
      loc: normalizeUrl(`blog/${publicSlug}`),
      lastmod: postLastmodIso(post),
      alternates: translated
        ? { it: translated.it, en: translated.en, xDefault: translated.xDefault }
        : undefined,
    });
  }

  for (const slug of CATEGORY_INDEX_ALLOWLIST) {
    const canonicalCategorySlug = normalizeCategorySlug(slug);
    const inCat = blogPosts.filter(
      (post) =>
        languageFromCategory(post.data.category) === "it" &&
        normalizeCategorySlug(post.data.category || "") === canonicalCategorySlug,
    );
    if (!inCat.length) continue;
    const relCat = normalizePathKey(`categoria/${canonicalCategorySlug}`);
    if (isRedirectSourcePath(relCat)) continue;
    urls.push({
      loc: normalizeUrl(`categoria/${canonicalCategorySlug}`),
      lastmod: maxLastmodFromPosts(inCat),
    });
  }

  for (const slug of EN_BLOG_CATEGORIES) {
    const inCat = blogPosts.filter(
      (post) => languageFromCategory(post.data.category) === "en" && post.data.category === slug,
    );
    if (!inCat.length) continue;
    urls.push({
      loc: normalizeUrl(`en/category/${slug}`),
      lastmod: maxLastmodFromPosts(inCat),
    });
  }

  // Keep registry imports exercised by the sitemap gate: each verified article pair
  // must resolve through translationAlternates above, while page pairs are emitted
  // reciprocally through pageAlternates.
  void BLOG_TRANSLATION_PAIRS;
  void PAGE_TRANSLATION_PAIRS;

  const seenLoc = new Set<string>();
  const deduped = urls.filter((item) => {
    if (seenLoc.has(item.loc)) return false;
    seenLoc.add(item.loc);
    return true;
  });

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    deduped.map((item) => {
      const lastmod = item.lastmod ? `    <lastmod>${escapeXml(item.lastmod)}</lastmod>\n` : "";
      const alternates = item.alternates
        ? [
            `    <xhtml:link rel="alternate" hreflang="it" href="${escapeXml(item.alternates.it)}" />`,
            `    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(item.alternates.en)}" />`,
            `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(item.alternates.xDefault)}" />`,
          ].join("\n") + "\n"
        : "";
      return `  <url>\n    <loc>${escapeXml(item.loc)}</loc>\n${alternates}${lastmod}  </url>\n`;
    }).join("") +
    `</urlset>\n`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
};