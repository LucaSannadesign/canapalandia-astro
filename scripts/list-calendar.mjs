import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const ROOT = process.cwd();
dotenv.config({ path: path.join(ROOT, ".env") });
dotenv.config({ path: path.join(ROOT, ".env.local"), override: true });

const CAL_PATH = path.join(ROOT, "calendar", "posts.json");
const OUT_DIR = path.join(ROOT, "src", "content", "blog");

function normalizeSlugBase(title, maxLen = 80) {
  const raw = String(title ?? "post").trim().toLowerCase();
  let base = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!base) base = "post";
  if (base.length > maxLen) base = base.slice(0, maxLen).replace(/-+$/g, "");
  return base || "post";
}

function isProvisionalTitle(title) {
  return /titolo\s+provvisorio|provvisorio|bozza|draft/i.test(String(title ?? ""));
}

function appendSlugSuffix(base, suffix, maxLen = 80) {
  const allowed = Math.max(1, maxLen - suffix.length);
  const trimmed = base.length > allowed ? base.slice(0, allowed).replace(/-+$/g, "") : base;
  return `${trimmed}${suffix}`;
}

function buildSlugFromTitle(title, publishDate) {
  const base = normalizeSlugBase(title, 80);
  const date = String(publishDate ?? "").trim();
  if (isProvisionalTitle(title) && date) {
    return appendSlugSuffix(base, `-${date}`);
  }
  return base;
}

function checkSlugExists(slug) {
  const outFileMdx = path.join(OUT_DIR, `${slug}.mdx`);
  const outFileMd = path.join(OUT_DIR, `${slug}.md`);
  return fs.existsSync(outFileMdx) || fs.existsSync(outFileMd);
}

function resolveUniqueSlug(slug, publishDate) {
  const date = String(publishDate ?? "").trim();
  if (!checkSlugExists(slug)) return slug;
  if (date) {
    const withDate = appendSlugSuffix(slug, `-${date}`);
    if (!checkSlugExists(withDate)) return withDate;
    let counter = 2;
    while (counter < 100) {
      const numbered = appendSlugSuffix(withDate, `-${counter}`);
      if (!checkSlugExists(numbered)) return numbered;
      counter += 1;
    }
  }
  return slug;
}

if (!fs.existsSync(CAL_PATH)) {
  console.error(`[list-calendar] Missing ${CAL_PATH}`);
  process.exit(1);
}

const posts = JSON.parse(fs.readFileSync(CAL_PATH, "utf8"));
if (!Array.isArray(posts)) {
  console.error("[list-calendar] calendar/posts.json must be an array");
  process.exit(1);
}

const sorted = posts
  .filter(p => p && p.publishDate)
  .slice()
  .sort((a, b) => String(a.publishDate).localeCompare(String(b.publishDate)));

console.log("date\ttitle\tslug\tstatus");
for (const post of sorted) {
  const baseSlug = buildSlugFromTitle(post.title, post.publishDate);
  const slug = resolveUniqueSlug(baseSlug, post.publishDate);
  const status = post.status || "";
  console.log(`${post.publishDate}\t${post.title}\t${slug}\t${status}`);
}