import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const ROOT = process.cwd();
dotenv.config({ path: path.join(ROOT, ".env") });
dotenv.config({ path: path.join(ROOT, ".env.local"), override: true });

const CAL_PATH = path.join(ROOT, "calendar", "posts.json");

const IT_STOPWORDS = new Set([
  "a", "ad", "al", "allo", "ai", "agli", "all", "alla", "alle",
  "da", "dal", "dallo", "dai", "dagli", "dall", "dalla", "dalle",
  "di", "del", "dello", "dei", "degli", "dell", "della", "delle",
  "in", "nel", "nello", "nei", "negli", "nell", "nella", "nelle",
  "su", "sul", "sullo", "sui", "sugli", "sull", "sulla", "sulle",
  "per", "tra", "fra", "con", "e", "ed", "o", "od", "ma", "che",
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una",
]);

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

function slugifyTitle(title) {
  const raw = String(title ?? "post").trim().toLowerCase();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const tokens = normalized
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !IT_STOPWORDS.has(token));

  let slug = tokens.join("-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) slug = "post";
  if (slug.length > 80) slug = slug.slice(0, 80).replace(/-+$/g, "");
  return slug || "post";
}

function buildSlugFromTitle(title, publishDate) {
  const base = slugifyTitle(title);
  const date = String(publishDate ?? "").trim();
  return date ? `${base}-${date}` : base;
}

function isPlaceholderSlug(slug) {
  const value = String(slug ?? "").trim();
  return !value || /^post-del-\d{4}-\d{2}-\d{2}$/.test(value);
}

function resolvePostSlug(post) {
  if (isPlaceholderSlug(post.slug)) {
    return buildSlugFromTitle(post.title, post.publishDate);
  }
  return String(post.slug).trim();
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

const filterDate = arg("--date");
const sorted = posts
  .filter(p => p && p.publishDate)
  .filter(p => !filterDate || String(p.publishDate) === filterDate)
  .slice()
  .sort((a, b) => String(a.publishDate).localeCompare(String(b.publishDate)));

console.log("date\ttitle\tslug\tstatus");
for (const post of sorted) {
  const slug = resolvePostSlug(post);
  const status = post.status || "";
  console.log(`${post.publishDate}\t${post.title}\t${slug}\t${status}`);
}