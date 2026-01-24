// scripts/sitemap-guard.mjs
import fs from "node:fs";
import path from "node:path";

const SITE_URL = process.env.SITE_URL;            // es: https://canapalandia.com
const SITEMAP_URL = process.env.SITEMAP_URL;      // es: https://canapalandia.com/sitemap-index.xml
const POST_META_PATH = process.env.POST_META_PATH; // es: ./tmp/post-meta.json oppure path file MDX

if (!SITE_URL || !SITEMAP_URL || !POST_META_PATH) {
  console.error("Missing env: SITE_URL, SITEMAP_URL, POST_META_PATH");
  process.exit(2);
}

function normalizeSlugFromUrl(u) {
  try {
    const url = new URL(u);
    return url.pathname.replace(/\/+$/, ""); // no trailing slash
  } catch {
    return "";
  }
}

function tokenize(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9àèéìòù\-\/\s]/gi, " ")
    .replace(/[-/]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  const inter = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size ? inter.size / union.size : 0;
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

function extractLocsFromSitemapXml(xml) {
  // Regex semplice e robusta per <loc>...</loc>
  const locs = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gim;
  let m;
  while ((m = re.exec(xml))) locs.push(m[1]);
  return locs;
}

async function getAllUrlsFromSitemap(startUrl) {
  const xml = await fetchText(startUrl);
  const locs = extractLocsFromSitemapXml(xml);

  // Heuristica: se i loc puntano a altre sitemap, è un index.
  const looksLikeIndex = locs.some(u => u.endsWith(".xml"));

  if (!looksLikeIndex) return locs;

  // Index: scarica ogni sitemap figlia (con limite prudente)
  const childUrls = [];
  const maxChildren = 50;
  for (const u of locs.slice(0, maxChildren)) {
    try {
      const childXml = await fetchText(u);
      childUrls.push(...extractLocsFromSitemapXml(childXml));
    } catch (e) {
      console.warn(`WARN: child sitemap fetch failed: ${u} (${e.message})`);
    }
  }
  return childUrls;
}

function fail(msg, details = {}) {
  console.error(msg);
  if (Object.keys(details).length) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

const metaRaw = fs.readFileSync(POST_META_PATH, "utf8");
const meta = JSON.parse(metaRaw);

// Supporta sia slug che slugForGuard (per compatibilità)
const slug = meta.slugForGuard || meta.slug || "";
const focusKeyword = meta.focusKeyword || meta.title || "";
const title = meta.title || "";

if (!slug || !focusKeyword || !title) {
  fail("post-meta missing required fields: slug (or slugForGuard), focusKeyword, title");
}

// Stop test/draft
const bad = /(test|draft|tmp|wip)/i;
if (bad.test(slug) || bad.test(title) || bad.test(focusKeyword)) {
  fail("Blocked: test/draft/tmp/wip detected in slug/title/focusKeyword", { slug, title, focusKeyword });
}

const urls = await getAllUrlsFromSitemap(SITEMAP_URL);
const slugs = urls.map(normalizeSlugFromUrl).filter(Boolean);

// HARD: slug uguale
if (slugs.includes(slug)) {
  fail("Cannibalization HARD match: slug already exists in online sitemap", { slug });
}

// SOFT: similarità slug
const slugTokens = tokenize(slug);
const slugHits = slugs
  .map(s => ({ s, score: jaccard(slugTokens, tokenize(s)) }))
  .filter(x => x.score >= 0.55)
  .sort((a, b) => b.score - a.score)
  .slice(0, 10);

// TOPIC: keyword simile (approssimazione: confronta keyword con slug esistenti)
const kwTokens = tokenize(focusKeyword);
const kwHits = slugs
  .map(s => ({ s, score: jaccard(kwTokens, tokenize(s)) }))
  .filter(x => x.score >= 0.50)
  .sort((a, b) => b.score - a.score)
  .slice(0, 10);

// Se troviamo match “forti”, falliamo (o puoi rendere “warning”)
if (slugHits.length || kwHits.length) {
  fail("Cannibalization risk detected (SOFT/TOPIC). Choose A/B/C before generating a new post.", {
    candidate: { title, slug, focusKeyword },
    slugHits,
    kwHits
  });
}

console.log("Sitemap guard passed ✅", { slug, focusKeyword });