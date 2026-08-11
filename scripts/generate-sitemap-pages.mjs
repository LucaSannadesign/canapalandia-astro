import { mkdir, readdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "https://canapalandia.com";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BLOG_DIR = join(ROOT, "src", "content", "blog");
const PAGES_DIR = join(ROOT, "src", "pages");
const OUT_PATH = join(ROOT, "src", "data", "sitemap-pages.json");

const now = new Date();

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const listFilesRecursive = async (dir) => {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFilesRecursive(full)));
    else out.push(full);
  }
  return out;
};

const parseFrontmatter = (raw) => {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/m);
  const fm = m?.[1] || "";
  const get = (key) => {
    const mm = fm.match(new RegExp(`^${key}:\\s*(.+)\\s*$`, "m"));
    return mm?.[1]?.trim();
  };
  return {
    slug: get("slug"),
    draft: get("draft"),
    publishDate: get("publishDate"),
  };
};

const normalizeSlug = (s) =>
  (s || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^\/+|\/+$/g, "");

function isFileLikeRoute(route) {
  const last = (route.split("/").pop() || "").trim();
  return /\.[a-z0-9]+$/i.test(last);
}

function normalizeRouteForCanonical(route) {
  if (!route) return "/";
  let p = route.startsWith("/") ? route : `/${route}`;

  // Root: non cambiare
  if (p === "/") return "/";

  // Se è un file, non aggiungere trailing slash
  if (isFileLikeRoute(p)) return p;

  p = p.replace(/\/+$/, "");
  p = p.replace(/^\/+/, "/");
  return `${p}/`;
}

const routeToUrl = (route) => new URL(normalizeRouteForCanonical(route), SITE).href;

const pageRouteExists = async (route) => {
  // route tipo "/contatti/" -> controlla src/pages/contatti.(astro|md|mdx) o index.* in sottodir
  const clean = route.replace(/^\/+|\/+$/g, "");
  if (clean === "") {
    return await exists(join(PAGES_DIR, "index.astro"));
  }

  const direct = [
    join(PAGES_DIR, `${clean}.astro`),
    join(PAGES_DIR, `${clean}.md`),
    join(PAGES_DIR, `${clean}.mdx`),
  ];

  const asDir = [
    join(PAGES_DIR, clean, "index.astro"),
    join(PAGES_DIR, clean, "index.md"),
    join(PAGES_DIR, clean, "index.mdx"),
  ];

  for (const p of [...direct, ...asDir]) {
    if (await exists(p)) return true;
  }
  return false;
};

const main = async () => {
  const urls = new Set();

  // Pagine “fisse” (aggiunte solo se esistono davvero)
  const fixedRoutes = [
    "/",
    "/blog/",
    "/lab/",
    "/contatti/",
    "/privacy/",
    "/privacy-policy/",
    "/cookie/",
    "/cookie-policy/",
  ];

  for (const r of fixedRoutes) {
    if (await pageRouteExists(r)) urls.add(routeToUrl(r));
  }

  // Post blog da filesystem (content collections)
  if (await exists(BLOG_DIR)) {
    // Stesse estensioni del loader della collection: glob "**/*.{md,mdx}"
    const files = (await listFilesRecursive(BLOG_DIR)).filter((p) =>
      /\.mdx?$/i.test(p),
    );

    for (const filePath of files) {
      const fileName = filePath.split("/").pop() || "";
      const fileSlug = fileName.replace(/\.mdx?$/i, "");
      if (!fileSlug) continue;

      const raw = await readFile(filePath, "utf8");
      const fm = parseFrontmatter(raw);

      // Escludi draft e publishDate futura (se presenti)
      if ((fm.draft || "").toLowerCase() === "true") continue;
      if (fm.publishDate) {
        const d = new Date(fm.publishDate);
        if (!Number.isNaN(d.getTime()) && d.getTime() > now.getTime()) continue;
      }

      const slug = normalizeSlug(fm.slug) || normalizeSlug(fileSlug);
      if (!slug || slug === "undefined") continue;

      urls.add(routeToUrl(`/blog/${slug}/`));
    }
  }

  const sorted = Array.from(urls).sort();

  await mkdir(join(ROOT, "src", "data"), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  console.log(`[sitemap] Wrote ${sorted.length} pages to ${OUT_PATH}`);
};

main().catch((err) => {
  console.error("[sitemap] Failed to generate sitemap pages:", err);
  process.exit(1);
});
