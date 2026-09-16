import { mkdir, readdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "https://canapalandia.com";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BLOG_DIR = join(ROOT, "src", "content", "blog");
const PAGES_DIR = join(ROOT, "src", "pages");
const CONTENT_CONFIG_PATH = join(ROOT, "src", "content.config.ts");
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

const stripScalarQuotes = (value) =>
  (value || "").trim().replace(/^["']|["']$/g, "");

const parseFrontmatter = (raw) => {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/m);
  const fm = m?.[1] || "";
  const get = (key) => {
    const mm = fm.match(new RegExp(`^${key}:\\s*(.+)\\s*$`, "m"));
    return stripScalarQuotes(mm?.[1]);
  };
  return {
    slug: get("slug"),
    draft: get("draft"),
    status: get("status"),
    editorialStatus: get("editorialStatus"),
    publishDate: get("publishDate"),
  };
};

const normalizeSlug = (s) =>
  stripScalarQuotes(s)
    .replace(/^\/+|\/+$/g, "");

/**
 * `content.config.ts` è la fonte unica per la quarantena editoriale.
 * Il generatore sitemap legge lo stesso Set invece di duplicarne gli slug.
 * Se in futuro la dichiarazione cambia forma, il prebuild fallisce esplicitamente
 * invece di pubblicare per errore URL `legacy-review` nella sitemap.
 */
const loadForcedLegacyReviewSlugs = async () => {
  const raw = await readFile(CONTENT_CONFIG_PATH, "utf8");
  const match = raw.match(
    /const\s+BLOG_FORCED_LEGACY_REVIEW_SLUGS\s*=\s*new\s+Set(?:<[^>]+>)?\s*\(\s*\[([\s\S]*?)\]\s*\);/,
  );

  if (!match) {
    throw new Error(
      "Impossibile leggere BLOG_FORCED_LEGACY_REVIEW_SLUGS da src/content.config.ts",
    );
  }

  const slugs = Array.from(match[1].matchAll(/["']([^"']+)["']/g), (m) => m[1].trim())
    .filter(Boolean);

  if (!slugs.length) {
    throw new Error("BLOG_FORCED_LEGACY_REVIEW_SLUGS è vuoto o non leggibile");
  }

  return new Set(slugs);
};

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
  const forcedLegacyReviewSlugs = await loadForcedLegacyReviewSlugs();
  const skipped = {
    draft: 0,
    nonReady: 0,
    legacyReview: 0,
    invalidDate: 0,
    future: 0,
  };

  // Pagine “fisse” (aggiunte solo se esistono davvero).
  // Gli hub EN sono pagine editoriali canoniche e devono ricevere lo stesso
  // segnale sitemap degli hub italiani.
  const fixedRoutes = [
    "/",
    "/blog/",
    "/en/",
    "/en/blog/",
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

  // Post blog da filesystem (content collections).
  // Le condizioni qui devono restare coerenti con blogVisibility.ts e con
  // la quarantena applicata in content.config.ts.
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
      const slug = normalizeSlug(fm.slug) || normalizeSlug(fileSlug);
      if (!slug || slug === "undefined") continue;

      if ((fm.draft || "").toLowerCase() === "true") {
        skipped.draft += 1;
        continue;
      }

      // Lo schema Astro usa `ready` come default; draft/test non sono pubblicabili.
      const status = (fm.status || "ready").toLowerCase();
      if (status !== "ready") {
        skipped.nonReady += 1;
        continue;
      }

      const editorialStatus = (fm.editorialStatus || "current").toLowerCase();
      if (
        editorialStatus === "legacy-review" ||
        forcedLegacyReviewSlugs.has(slug)
      ) {
        skipped.legacyReview += 1;
        continue;
      }

      // isReachableBlogEntry richiede una publishDate valida e non futura.
      if (!fm.publishDate) {
        skipped.invalidDate += 1;
        continue;
      }

      const d = new Date(fm.publishDate);
      if (Number.isNaN(d.getTime())) {
        skipped.invalidDate += 1;
        continue;
      }
      if (d.getTime() > now.getTime()) {
        skipped.future += 1;
        continue;
      }

      urls.add(routeToUrl(`/blog/${slug}/`));
    }
  }

  const sorted = Array.from(urls).sort();

  await mkdir(join(ROOT, "src", "data"), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  console.log(`[sitemap] Wrote ${sorted.length} pages to ${OUT_PATH}`);
  console.log(
    `[sitemap] Skipped: draft=${skipped.draft}, nonReady=${skipped.nonReady}, legacyReview=${skipped.legacyReview}, invalidDate=${skipped.invalidDate}, future=${skipped.future}`,
  );
};

main().catch((err) => {
  console.error("[sitemap] Failed to generate sitemap pages:", err);
  process.exit(1);
});
