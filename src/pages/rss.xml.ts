export const prerender = true;

import postsJson from "../../data/wp/out/posts.json";
import { toParams } from "../lib/wp";

const SITE_URL = "https://canapalandia.com"; // TODO: cambia quando vai live su Vercel

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
  const da = Date.parse(a?.date || a?.modified || "") || 0;
  const db = Date.parse(b?.date || b?.modified || "") || 0;
  return db - da;
}

export async function GET() {
  const posts = Array.isArray(postsJson) ? postsJson : [];
  const items = posts.slice().sort(sortPostsDesc).slice(0, 50);

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
    items
      .map((p: any) => {
        const title = stripHtml(p?.title?.rendered || p?.title || "Articolo") || "Articolo";
        const link = absUrl(postHref(p));
        const pubDate = new Date(p?.date || p?.modified || Date.now()).toUTCString();
        const desc = stripHtml(p?.excerpt?.rendered || p?.excerpt || p?.content?.rendered || "").slice(0, 300);

        return (
          `    <item>\n` +
          `      <title>${escapeXml(title)}</title>\n` +
          `      <link>${escapeXml(link)}</link>\n` +
          `      <guid isPermaLink="true">${escapeXml(link)}</guid>\n` +
          `      <pubDate>${escapeXml(pubDate)}</pubDate>\n` +
          `      <description>${escapeXml(desc)}</description>\n` +
          `    </item>\n`
        );
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
