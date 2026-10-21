#!/usr/bin/env node
// scripts/vercel-output-server.mjs
// Server locale minimale per l'output di `pnpm build` (.vercel/output), così da
// testare status, redirect e header senza Vercel CLI (`astro preview` non è
// supportato dall'adapter Vercel).
//
// Uso:  pnpm build && node scripts/vercel-output-server.mjs [porta]
//       node scripts/seo-check.mjs --base http://localhost:4321
//
// Emula, in quest'ordine: redirect/rewrite di vercel.json, poi le route di
// .vercel/output/config.json (redirect, filesystem, funzione _render).
// È un'approssimazione per i test: non replica cache, header di piattaforma
// né le regole Cloudflare (es. offuscamento email) applicate in produzione.

import { createServer } from "node:http";
import { readFileSync, statSync, createReadStream } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../", import.meta.url).pathname;
const OUT = join(ROOT, ".vercel/output");
const PORT = Number(process.argv[2] || 4321);
const SITE = "https://canapalandia.com";

const config = JSON.parse(readFileSync(join(OUT, "config.json"), "utf8"));
const vercelJson = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
const handler = (await import(pathToFileURL(join(OUT, "functions/_render.func/dist/server/entry.mjs")).href)).default;

const MIME = {
  ".html": "text/html; charset=utf-8", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8",
  ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
};

/** Converte una source di vercel.json (path-to-regexp semplificato) in RegExp. */
function sourceToRegex(source) {
  const keys = [];
  const pattern = source
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:(\w+)\\\*/g, (_, k) => (keys.push(k), "(.*)"))
    .replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)"));
  return { re: new RegExp(`^${pattern}$`), keys };
}
const fill = (dest, keys, m) => keys.reduce((d, k, i) => d.replaceAll(`:${k}`, m[i + 1] ?? "").replace(`:${k}*`, m[i + 1] ?? ""), dest);

function staticFile(pathname) {
  const candidates = [pathname, join(pathname, "index.html")];
  for (const c of candidates) {
    try {
      const file = join(OUT, "static", decodeURIComponent(c));
      if (statSync(file).isFile()) return file;
    } catch {}
  }
  return null;
}

async function render(req, res, pathname, search, status) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await new Response(req).arrayBuffer();
  const response = await handler.fetch(new Request(`${SITE}${pathname}${search}`, { method: req.method, headers, body }));
  const out = {};
  response.headers.forEach((v, k) => (out[k] = v));
  res.writeHead(status && response.status === 200 ? status : response.status, out);
  res.end(req.method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, SITE);
    let pathname = url.pathname;
    const search = url.search;

    for (const r of vercelJson.redirects || []) {
      const { re, keys } = sourceToRegex(r.source);
      const m = pathname.match(re);
      if (m) {
        res.writeHead(r.permanent ? 308 : 307, { location: fill(r.destination, keys, m) + (r.destination.includes("?") ? "" : search) });
        return res.end();
      }
    }
    for (const r of vercelJson.rewrites || []) {
      const { re, keys } = sourceToRegex(r.source);
      const m = pathname.match(re);
      if (m && !/^https?:/.test(r.destination)) pathname = fill(r.destination, keys, m);
    }

    let afterFilesystem = false;
    for (const route of config.routes) {
      if (route.handle === "filesystem") {
        afterFilesystem = true;
        const file = staticFile(pathname);
        if (file) {
          res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
          return createReadStream(file).pipe(res);
        }
        continue;
      }
      if (!route.src) continue;
      const m = pathname.match(new RegExp(route.src));
      if (!m) continue;
      const location = route.headers?.Location;
      if (location && route.status >= 300 && route.status < 400) {
        res.writeHead(route.status, { location: location.replace(/\$(\d+)/g, (_, i) => m[i] ?? "") + search });
        return res.end();
      }
      if (route.continue) continue;
      if (route.dest === "_render") return await render(req, res, pathname, search, route.status);
      if (!route.dest && !afterFilesystem) continue;
    }
    res.writeHead(404).end();
  } catch (e) {
    console.error(e);
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, () => console.log(`vercel-output-server su http://localhost:${PORT}`));
