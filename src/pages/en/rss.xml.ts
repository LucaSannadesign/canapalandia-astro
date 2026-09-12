export const prerender = true;

import { getCollection } from "astro:content";
import { isPublishedBlogEntry } from "../../lib/blogVisibility";
import { languageFromCategory } from "../../lib/localization";

const SITE_URL = (import.meta.env.SITE || "https://canapalandia.com").replace(/\/+$/, "");

function escapeXml(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(input: unknown): string {
  return String(input ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET() {
  const entries = (await getCollection("blog"))
    .filter(
      (entry) =>
        isPublishedBlogEntry(entry) &&
        entry.data.editorialStatus !== "legacy-review" &&
        languageFromCategory(entry.data.category) === "en",
    )
    .sort((a, b) => {
      const da = new Date(a.data.publishDate ?? a.data.updatedDate ?? 0).getTime();
      const db = new Date(b.data.publishDate ?? b.data.updatedDate ?? 0).getTime();
      return db - da;
    })
    .slice(0, 50);

  const now = new Date().toUTCString();
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml("Canapalandia in English")}</title>\n` +
    `    <link>${escapeXml(`${SITE_URL}/en/`)}</link>\n` +
    `    <description>${escapeXml("English-language Canapalandia reporting on cannabis, hemp, CBD, regulation and culture.")}</description>\n` +
    `    <language>en</language>\n` +
    `    <lastBuildDate>${escapeXml(now)}</lastBuildDate>\n` +
    `    <atom:link href="${escapeXml(`${SITE_URL}/en/rss.xml`)}" rel="self" type="application/rss+xml" />\n` +
    entries.map((entry) => {
      const slug = String(entry.data.slug || entry.id || "").trim();
      const link = `${SITE_URL}/blog/${slug}/`;
      const rawDate = entry.data.publishDate ?? entry.data.updatedDate ?? new Date();
      const pubDate = new Date(rawDate instanceof Date ? rawDate : String(rawDate)).toUTCString();
      return (
        `    <item>\n` +
        `      <title>${escapeXml(stripHtml(entry.data.title || "Article"))}</title>\n` +
        `      <link>${escapeXml(link)}</link>\n` +
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>\n` +
        `      <pubDate>${escapeXml(pubDate)}</pubDate>\n` +
        `      <description>${escapeXml(stripHtml(entry.data.description || ""))}</description>\n` +
        `    </item>\n`
      );
    }).join("") +
    `  </channel>\n` +
    `</rss>\n`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
