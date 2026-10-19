#!/usr/bin/env node
/**
 * Smoke HTTP della ricerca interna IT (/cerca/) ed EN (/en/search/).
 *
 * Uso:
 *   node scripts/search-smoke.mjs [baseUrl]
 *   SMOKE_BASE_URL=https://<preview>.vercel.app node scripts/search-smoke.mjs
 *
 * Default: http://localhost:4321 (astro dev). Solo richieste GET, nessun dato persistito.
 */

const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:4321").replace(/\/+$/, "");
const SITE = "https://canapalandia.com";
const MISSING_QUERY = "zzqxjkvw";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

async function get(path, { redirect = "follow" } = {}) {
  const res = await fetch(`${BASE}${path}`, { redirect });
  return { res, html: redirect === "manual" ? "" : await res.text() };
}

const text = (html, re) => (html.match(re)?.[1] ?? "").replace(/\s+/g, " ").trim();
const resultsTitle = (html) => text(html, /<h2[^>]*id="results-title"[^>]*>([^<]*)/);
const firstH2 = (html) => text(html, /<div class="results-head"[^>]*>\s*<h2[^>]*>([^<]*)/);
const htmlLang = (html) => text(html, /<html[^>]*\blang="([^"]+)"/);
/** Il payload è innocuo dentro un attributo con `"` escapato: conta solo come markup fuori dagli attributi. */
const injectsMarkup = (html, markup) => html.replace(/="[^"]*"/g, '=""').includes(markup);

/** Link ai post nel solo blocco risultati (prima della sezione "ultimi articoli" su /cerca/). */
function resultLinks(html, startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  if (start < 0) return [];
  const end = endMarker ? html.indexOf(endMarker, start) : -1;
  const block = html.slice(start, end > start ? end : undefined);
  return [...new Set([...block.matchAll(/href="(\/blog\/[^"/?#]+\/)"/g)].map((m) => m[1]))];
}

function seoChecks(html, label, canonicalPath) {
  // In produzione "noindex,follow"; localhost e preview forzano "noindex,nofollow" dal layout.
  check(/<meta name="robots" content="noindex\b/.test(html), `${label}: meta robots noindex`);
  check(html.includes(`<link rel="canonical" href="${SITE}${canonicalPath}"`), `${label}: canonical ${canonicalPath}`);
  check(
    html.includes(`hreflang="it" href="${SITE}/cerca/"`) && html.includes(`hreflang="en" href="${SITE}/en/search/"`),
    `${label}: hreflang it/en coerenti`,
  );
}

async function linkLanguage(path) {
  const { res, html } = await get(path);
  return { status: res.status, lang: htmlLang(html) };
}

console.log(`Search smoke su ${BASE}\n`);

// --- IT /cerca/ -------------------------------------------------------------
{
  const { res, html } = await get("/cerca/");
  check(res.status === 200, "IT /cerca/ risponde 200", String(res.status));
  check(/<form[^>]*action="\/cerca\/"[^>]*role="search"/.test(html), "IT form GET etichettato verso /cerca/");
  check(/<label[^>]*for="q"/.test(html) && /<input[^>]*id="q"[^>]*name="q"/.test(html), "IT label associata all'input q");
  seoChecks(html, "IT", "/cerca/");
}
{
  const { res, html } = await get("/cerca/?q=decreto+sicurezza");
  const title = resultsTitle(html);
  const links = resultLinks(html, 'id="results-title"', 'id="latest-title"');
  check(res.status === 200 && /risultat/i.test(title) && !/nessun/i.test(title), "IT query positiva 'decreto sicurezza'", title);
  check(links.length > 0, "IT risultati con link /blog/<slug>/", `${links.length} link`);
  if (links[0]) {
    const target = await linkLanguage(links[0]);
    check(target.status === 200 && target.lang.startsWith("it"), `IT primo risultato valido e in italiano ${links[0]}`, `${target.status} lang=${target.lang}`);
  }
}
{
  const plain = resultsTitle((await get("/cerca/?q=perche")).html);
  const accented = resultsTitle((await get("/cerca/?q=perch%C3%A9")).html);
  check(/risultat/i.test(plain) && plain.replace("perche", "") === accented.replace("perché", ""), "IT accenti ignorati (perche = perché)", `${plain} | ${accented}`);
}
{
  const { html } = await get(`/cerca/?q=${MISSING_QUERY}`);
  check(/nessun risultato/i.test(resultsTitle(html)), "IT zero risultati con feedback", resultsTitle(html));
  check(resultLinks(html, 'id="latest-title"').length > 0, "IT zero risultati propone gli ultimi articoli");
}
{
  const { html } = await get("/cerca/?q=a");
  check(/query troppo corta/i.test(html), "IT query troppo corta gestita");
}
{
  const { res, html } = await get(`/cerca/?q=${"x".repeat(500)}`);
  check(res.status === 200 && !html.includes("x".repeat(101)), "IT query troppo lunga troncata a 100 caratteri");
}
{
  const payload = encodeURIComponent('"><svg onload=alert(1)>');
  const { html } = await get(`/cerca/?q=${payload}`);
  check(!injectsMarkup(html, "<svg onload=alert(1)>"), "IT payload XSS escapato");
}

// --- EN /en/search/ ---------------------------------------------------------
{
  const { res, html } = await get("/en/search/");
  check(res.status === 200, "EN /en/search/ risponde 200", String(res.status));
  check(/<form[^>]*action="\/en\/search\/"[^>]*role="search"/.test(html), "EN form GET etichettato verso /en/search/");
  check(/<label[^>]*for="en-q"/.test(html) && /<input[^>]*id="en-q"[^>]*name="q"/.test(html), "EN label associata all'input q");
  seoChecks(html, "EN", "/en/search/");
}
{
  const { res, html } = await get("/en/search/?q=hemp");
  const title = firstH2(html);
  const links = resultLinks(html, 'class="results-grid"');
  check(res.status === 200 && /results? for/i.test(title), "EN query positiva 'hemp'", title);
  check(links.length > 0, "EN risultati con link /blog/<slug>/", `${links.length} link`);
  if (links[0]) {
    const target = await linkLanguage(links[0]);
    check(target.status === 200 && target.lang === "en", `EN primo risultato valido e in inglese ${links[0]}`, `${target.status} lang=${target.lang}`);
  }
}
{
  const { html } = await get(`/en/search/?q=${MISSING_QUERY}`);
  check(firstH2(html) === "No results", "EN zero risultati con feedback", firstH2(html));
  check(resultLinks(html, 'class="results-grid"').length > 0, "EN zero risultati propone gli ultimi articoli");
}
{
  const payload = encodeURIComponent('"><svg onload=alert(1)>');
  const { html } = await get(`/en/search/?q=${payload}`);
  check(!injectsMarkup(html, "<svg onload=alert(1)>"), "EN payload XSS escapato");
}

// --- Punti d'ingresso e SEO ---------------------------------------------------
for (const [path, expected] of [
  ["/?s=canapa+light", "/cerca/?q=canapa+light"],
  ["/en/?s=hemp", "/en/search/?q=hemp"],
]) {
  const { res } = await get(path, { redirect: "manual" });
  const location = res.headers.get("location") || "";
  check(res.status === 301 && location.endsWith(expected), `ricerca WordPress ${path} -> ${expected}`, `${res.status} ${location}`);
}
{
  const { html } = await get("/blog/");
  check(/<form[^>]*method="get"[^>]*action="\/cerca\/"/.test(html), "/blog/: il form di ricerca invia a /cerca/");
  check(!html.includes("postsIndex"), "/blog/: nessun indice di ricerca client-side duplicato");
}
{
  const { res, html } = await get("/sitemap.xml");
  check(res.status === 200 && !/<loc>[^<]*(\/cerca\/|\/en\/search\/)[^<]*<\/loc>/.test(html), "sitemap.xml senza pagine di ricerca");
}

console.log(`\n${failures ? `${failures} controlli falliti` : "Tutti i controlli superati"}`);
process.exitCode = failures ? 1 : 0;
