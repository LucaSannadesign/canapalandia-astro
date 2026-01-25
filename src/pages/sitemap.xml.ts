import type { APIRoute } from "astro";
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

export const GET: APIRoute = async () => {
  const { entries } = await loadWp();
  
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

    // Costruisci URL
    const url = normalizeUrl(entry.path);
    
    // Aggiungi lastmod se disponibile (preferisci modified, fallback a date)
    const lastmod = formatLastmod(entry.modified || entry.date);
    
    urls.push({
      loc: url,
      lastmod,
    });
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
