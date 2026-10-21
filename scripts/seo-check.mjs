#!/usr/bin/env node
// scripts/seo-check.mjs
// Audit tecnico SEO in sola lettura, senza dipendenze.
//
// Uso:
//   node scripts/seo-check.mjs                          # produzione, URL dalla sitemap
//   node scripts/seo-check.mjs --base http://localhost:4321
//   node scripts/seo-check.mjs --urls export-gsc.csv    # verifica una lista (es. export GSC)
//   node scripts/seo-check.mjs --no-links --json out.json
//
// Controlli sugli URL della sitemap: status 200 senza redirect, canonical
// auto-referenziale, nessun noindex (meta o X-Robots-Tag), hreflang reciproci
// e coerenti con la sitemap, JSON-LD parsabile, <title> e <h1> presenti.
// Con i link interni attivi (default) segnala anche link verso 4xx/5xx o redirect.
// Con --urls verifica solo status e destinazione finale degli URL indicati.
//
// Exit code: 0 nessun errore, 1 errori trovati, 2 errore di esecuzione.

import { readFileSync, writeFileSync } from "node:fs";

const SITE = "https://canapalandia.com";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(name);

const BASE = opt("--base", SITE).replace(/\/+$/, "");
const URLS_FILE = opt("--urls", "");
const JSON_OUT = opt("--json", "");
const CONCURRENCY = Number(opt("--concurrency", "6"));
const CHECK_LINKS = !flag("--no-links");
const MAX_REDIRECTS = 5;

// Gli URL nel sitemap/canonical usano sempre il dominio di produzione: con --base
// li riscriviamo per interrogare un'istanza locale o di preview.
const toFetchUrl = (u) => (BASE === SITE ? u : u.replace(SITE, BASE));
const toSiteUrl = (u) => (BASE === SITE ? u : u.replace(BASE, SITE));

const errors = [];
const warnings = [];
const report = (list, url, code, detail = "") => list.push({ url, code, detail });

async function fetchManual(url) {
  const res = await fetch(toFetchUrl(url), {
    redirect: "manual",
    headers: { "user-agent": "canapalandia-seo-check/1.0", accept: "text/html,application/xml" },
  });
  const location = res.headers.get("location");
  return {
    status: res.status,
    location: location ? toSiteUrl(new URL(location, toFetchUrl(url)).href) : null,
    headers: res.headers,
    text: res.status === 200 ? await res.text() : (await res.body?.cancel(), ""),
  };
}

/** Segue i redirect e restituisce la catena completa. */
async function resolve(url) {
  const chain = [];
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const r = await fetchManual(current);
    chain.push({ url: current, status: r.status });
    if (r.status >= 300 && r.status < 400 && r.location) {
      if (chain.some((c) => c.url === r.location)) {
        chain.push({ url: r.location, status: "loop" });
        return { chain, final: null };
      }
      current = r.location;
      continue;
    }
    return { chain, final: r };
  }
  return { chain, final: null };
}

async function pool(items, worker) {
  const queue = [...items];
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3] ?? "").trim() : null;
};
const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];
const decode = (s) => s.replace(/&amp;/g, "&");

function parsePage(html) {
  const head = html.split(/<\/head>/i)[0] || html;
  const links = tags(head, "link");
  const metas = tags(head, "meta");
  const canonicals = links.filter((t) => /rel\s*=\s*["']canonical["']/i.test(t)).map((t) => decode(attr(t, "href") || ""));
  const hreflang = {};
  for (const t of links) {
    if (!/rel\s*=\s*["']alternate["']/i.test(t)) continue;
    const lang = attr(t, "hreflang");
    if (lang) hreflang[lang.toLowerCase()] = decode(attr(t, "href") || "");
  }
  const robots = metas
    .filter((t) => /name\s*=\s*["'](robots|googlebot)["']/i.test(t))
    .map((t) => (attr(t, "content") || "").toLowerCase());
  const jsonLd = [...html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const title = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || "";
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const hrefs = tags(html, "a").map((t) => attr(t, "href")).filter(Boolean).map(decode);
  return { canonicals, hreflang, robots, jsonLd, title, h1Count, hrefs };
}

function parseSitemap(xml) {
  const entries = [];
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/gi) || []) {
    const loc = (block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i) || [])[1];
    if (!loc) continue;
    const alternates = {};
    for (const t of block.match(/<xhtml:link\b[^>]*>/gi) || []) {
      const lang = attr(t, "hreflang");
      if (lang) alternates[lang.toLowerCase()] = decode(attr(t, "href") || "");
    }
    entries.push({ loc: decode(loc), alternates });
  }
  const children = (xml.match(/<sitemap>[\s\S]*?<\/sitemap>/gi) || [])
    .map((b) => (b.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i) || [])[1])
    .filter(Boolean);
  return { entries, children };
}

async function loadSitemap(url) {
  const { final } = await resolve(url);
  if (!final || final.status !== 200) throw new Error(`Sitemap non raggiungibile: ${url}`);
  const { entries, children } = parseSitemap(final.text);
  for (const child of children) entries.push(...(await loadSitemap(child)));
  return entries;
}

function readUrlList(file) {
  // Accetta un URL per riga o un CSV (export GSC): prende il primo campo che inizia con http.
  return [
    ...new Set(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((line) => line.split(/[,;\t]/).map((c) => c.replace(/^"|"$/g, "").trim()).find((c) => /^https?:\/\//.test(c)))
        .filter(Boolean),
    ),
  ];
}

function internalUrl(href, pageUrl) {
  if (/^(mailto:|tel:|javascript:|#|data:)/i.test(href)) return null;
  let u;
  try {
    u = new URL(href, pageUrl);
  } catch {
    return null;
  }
  if (u.hostname !== "canapalandia.com" && u.hostname !== "www.canapalandia.com") return null;
  u.hash = "";
  return u.href;
}

async function checkUrlList(urls) {
  const rows = [];
  await pool(urls, async (url) => {
    try {
      const { chain, final } = await resolve(url);
      rows.push({
        url,
        first: chain[0].status,
        final: final?.status ?? "loop/too-many",
        target: chain.at(-1).url,
        hops: chain.length - 1,
      });
    } catch (e) {
      rows.push({ url, first: "error", final: "error", target: "", hops: 0, detail: e.message });
    }
  });
  rows.sort((a, b) => a.url.localeCompare(b.url));
  for (const r of rows) {
    console.log(`${String(r.first).padEnd(5)} → ${String(r.final).padEnd(5)} ${r.url}${r.hops ? `  ⇒ ${r.target} (${r.hops} hop)` : ""}`);
    if (r.hops > 1) report(warnings, r.url, "redirect-chain", `${r.hops} hop`);
    if (typeof r.final !== "number") report(errors, r.url, "redirect-loop");
  }
  return rows;
}

async function auditSitemap() {
  const entries = await loadSitemap(`${SITE}/sitemap.xml`);
  const sitemapSet = new Set(entries.map((e) => e.loc));
  const pages = new Map();
  console.log(`Sitemap: ${entries.length} URL (${new Set(entries.map((e) => e.loc)).size} unici)`);
  if (sitemapSet.size !== entries.length) report(warnings, `${SITE}/sitemap.xml`, "sitemap-duplicates", `${entries.length - sitemapSet.size}`);

  await pool(entries, async (entry) => {
    const url = entry.loc;
    let r;
    try {
      r = await fetchManual(url);
    } catch (e) {
      return report(errors, url, "fetch-error", e.message);
    }
    if (r.status !== 200) {
      return report(errors, url, "sitemap-non-200", `${r.status}${r.location ? ` → ${r.location}` : ""}`);
    }
    const p = parsePage(r.text);
    pages.set(url, p);
    const xRobots = (r.headers.get("x-robots-tag") || "").toLowerCase();
    if (xRobots.includes("noindex")) report(errors, url, "sitemap-noindex-header", xRobots);
    if (p.robots.some((c) => c.includes("noindex"))) report(errors, url, "sitemap-noindex-meta", p.robots.join(" | "));
    if (p.canonicals.length === 0) report(errors, url, "canonical-missing");
    else if (p.canonicals.length > 1) report(errors, url, "canonical-multiple", p.canonicals.join(" | "));
    else if (p.canonicals[0] !== url) report(errors, url, "canonical-mismatch", p.canonicals[0]);
    if (!p.title) report(errors, url, "title-missing");
    if (p.h1Count === 0) report(warnings, url, "h1-missing");
    if (p.h1Count > 1) report(warnings, url, "h1-multiple", String(p.h1Count));
    for (const [i, block] of p.jsonLd.entries()) {
      try {
        JSON.parse(block);
      } catch (e) {
        report(errors, url, "jsonld-invalid", `blocco ${i + 1}: ${e.message}`);
      }
    }
    // hreflang: la sitemap e la pagina devono dichiarare le stesse alternative.
    for (const lang of new Set([...Object.keys(entry.alternates), ...Object.keys(p.hreflang)])) {
      if (entry.alternates[lang] !== p.hreflang[lang]) {
        report(errors, url, "hreflang-sitemap-vs-page", `${lang}: sitemap=${entry.alternates[lang] ?? "-"} pagina=${p.hreflang[lang] ?? "-"}`);
      }
    }
    const langs = Object.keys(p.hreflang);
    if (langs.length && !Object.values(p.hreflang).includes(url)) report(errors, url, "hreflang-no-self");
  });

  // Reciprocità hreflang e alternative che puntano fuori dalla sitemap.
  for (const [url, p] of pages) {
    for (const [lang, alt] of Object.entries(p.hreflang)) {
      if (alt === url || lang === "x-default") continue;
      if (!sitemapSet.has(alt)) {
        report(errors, url, "hreflang-target-not-in-sitemap", `${lang} → ${alt}`);
        continue;
      }
      const back = pages.get(alt);
      if (back && !Object.values(back.hreflang).includes(url)) report(errors, url, "hreflang-not-reciprocal", `${lang} → ${alt}`);
    }
  }

  // Link interni.
  let linkRows = [];
  if (CHECK_LINKS) {
    const sources = new Map();
    for (const [url, p] of pages) {
      for (const href of p.hrefs) {
        const target = internalUrl(href, url);
        if (!target) continue;
        if (!sources.has(target)) sources.set(target, new Set());
        sources.get(target).add(url);
      }
    }
    const targets = [...sources.keys()].filter((t) => !sitemapSet.has(t) || !pages.has(t));
    console.log(`Link interni unici: ${sources.size}; da verificare (fuori sitemap): ${targets.length}`);
    await pool(targets, async (target) => {
      try {
        const r = await fetchManual(target);
        const from = [...sources.get(target)];
        linkRows.push({ target, status: r.status, location: r.location, from });
        const sample = `${from.length} pagine, es. ${from[0]}`;
        if (r.status >= 400) report(errors, target, `internal-link-${r.status}`, sample);
        else if (r.status >= 300) report(warnings, target, "internal-link-redirect", `${r.status} → ${r.location}; ${sample}`);
      } catch (e) {
        report(errors, target, "internal-link-fetch-error", e.message);
      }
    });
  }
  return { entries: entries.length, pages: pages.size, links: linkRows };
}

function summarize(list, label) {
  const byCode = {};
  for (const item of list) (byCode[item.code] ||= []).push(item);
  console.log(`\n${label}: ${list.length}`);
  for (const [code, items] of Object.entries(byCode).sort()) {
    console.log(`  ${code} (${items.length})`);
    for (const it of items.slice(0, 15)) console.log(`    - ${it.url}${it.detail ? `  [${it.detail}]` : ""}`);
    if (items.length > 15) console.log(`    … altri ${items.length - 15}`);
  }
}

try {
  console.log(`Base: ${BASE}`);
  const result = URLS_FILE ? { urls: await checkUrlList(readUrlList(URLS_FILE)) } : await auditSitemap();
  summarize(errors, "ERRORI");
  summarize(warnings, "AVVISI");
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, date: new Date().toISOString(), result, errors, warnings }, null, 2));
  process.exit(errors.length ? 1 : 0);
} catch (e) {
  console.error(e);
  process.exit(2);
}
