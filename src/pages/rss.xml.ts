export const prerender = true;

import { getCollection } from "astro:content";
import postsJson from "../../data/wp/out/posts.json";
import { toParams } from "../lib/wp";
import { getExcerpt } from "../lib/utils";

// Usa import.meta.env.SITE (configurato in astro.config.mjs) o fallback
const SITE_URL = import.meta.env.SITE || "https://canapalandia.com";

function stripHtml(input: unknown) {
  if (!input) return "";
  return String(input)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(input: unknown) {
  const s = String(input ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function postHref(post: any) {
  const url = post?.yoast_head_json?.canonical || post?.link || post?.slug || "";
  const path = toParams(url);
  return path ? `/${path}/` : "/";
}

function absUrl(p: string) {
  if (!p) return SITE_URL;
  if (p.startsWith("http")) return p;
  return `${SITE_URL}${p.startsWith("/") ? "" : "/"}${p}`;
}

function sortPostsDesc(a: any, b: any) {
  const da = Date.parse(a?.date || a?.modified || a?.publishDate || "") || 0;
  const db = Date.parse(b?.date || b?.modified || b?.publishDate || "") || 0;
  return db - da;
}

// Helper per convertire post Astro in formato compatibile RSS
function astroPostToRssItem(entry: any) {
  const slug = entry?.slug ?? entry?.data?.slug ?? "";
  if (!slug) return null;
  
  // Escludi draft
  if (entry?.data?.draft === true || entry?.data?.status === "draft") {
    return null;
  }
  
  // Escludi se status è "test" (solo "ready" va nel feed)
  if (entry?.data?.status === "test") {
    return null;
  }
  
  const title = entry?.data?.title || "Articolo";
  const description = entry?.data?.description || "";
  const publishDate = entry?.data?.publishDate || entry?.data?.updatedDate;
  
  // Converti Date in stringa per parsing
  let dateStr = "";
  if (publishDate instanceof Date) {
    dateStr = publishDate.toISOString();
  } else if (publishDate) {
    dateStr = String(publishDate);
  }
  
  return {
    title,
    description,
    date: dateStr,
    link: `${SITE_URL}/blog/${slug}/`,
    slug,
    isAstro: true, // Flag per distinguere da WP
  };
}

// Helper per href post Astro
function astroPostHref(post: any) {
  const slug = post?.slug ?? post?.data?.slug ?? "";
  if (!slug) return "/";
  return `/blog/${slug}/`;
}

export async function GET() {
  // Carica post WordPress (legacy)
  const wpPosts = Array.isArray(postsJson) ? postsJson : [];
  
  // Carica post Astro dalla collection "blog"
  let astroPosts: any[] = [];
  try {
    const blogEntries = await getCollection("blog");
    astroPosts = blogEntries
      .map(astroPostToRssItem)
      .filter((item): item is NonNullable<typeof item> => item !== null);
  } catch (err) {
    console.warn("[rss.xml] Errore nel caricamento post Astro:", err);
  }
  
  // Unisci tutti i post e ordina per data DESC
  const allPosts = [...wpPosts, ...astroPosts];
  const sortedPosts = allPosts.slice().sort(sortPostsDesc).slice(0, 50);

  const now = new Date().toUTCString();

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml("Canapalandia")}</title>\n` +
    `    <link>${escapeXml(absUrl("/"))}</link>\n` +
    `    <description>${escapeXml("Aggiornamenti e articoli su canapa legale, CBD, normativa, salute.")}</description>\n` +
    `    <lastBuildDate>${escapeXml(now)}</lastBuildDate>\n` +
    `    <atom:link href="${escapeXml(absUrl("/rss.xml"))}" rel="self" type="application/rss+xml" />\n` +
    sortedPosts
      .map((p: any) => {
        // Gestisci post Astro vs WordPress
        if (p.isAstro) {
          const title = stripHtml(p.title || "Articolo") || "Articolo";
          const link = absUrl(astroPostHref(p));
          const pubDate = new Date(p.date || Date.now()).toUTCString();
          const desc = stripHtml(p.description || "");

          return (
            `    <item>\n` +
            `      <title>${escapeXml(title)}</title>\n` +
            `      <link>${escapeXml(link)}</link>\n` +
            `      <guid isPermaLink="true">${escapeXml(link)}</guid>\n` +
            `      <pubDate>${escapeXml(pubDate)}</pubDate>\n` +
            `      <description>${escapeXml(desc)}</description>\n` +
            `    </item>\n`
          );
        } else {
          // Post WordPress (legacy)
          const title = stripHtml(p?.title?.rendered || p?.title || "Articolo") || "Articolo";
          const link = absUrl(postHref(p));
          const pubDate = new Date(p?.date || p?.modified || Date.now()).toUTCString();
          const desc = getExcerpt(p?.excerpt, p?.content?.rendered || p?.content, 300);

          return (
            `    <item>\n` +
            `      <title>${escapeXml(title)}</title>\n` +
            `      <link>${escapeXml(link)}</link>\n` +
            `      <guid isPermaLink="true">${escapeXml(link)}</guid>\n` +
            `      <pubDate>${escapeXml(pubDate)}</pubDate>\n` +
            `      <description>${escapeXml(desc)}</description>\n` +
            `    </item>\n`
          );
        }
      })
      .join("") +
    `  </channel>\n` +
    `</rss>\n`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
