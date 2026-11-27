import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { completenessErrors, ready } from "./i18n-completeness.mjs";

const ROOT = process.cwd();
const BLOG_DIR = path.join(ROOT, "src", "content", "blog");
const LOCALIZATION_FILE = path.join(ROOT, "src", "lib", "localization.ts");

const errors = [];
const warnings = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.mdx?$/.test(entry.name) ? [full] : [];
  });
}

function frontmatter(source) {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---/);
  return match?.[1] || "";
}

function field(fm, key) {
  const match = fm.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  if (!match) return "";

  const raw = match[1].trim().replace(/\s+#.*$/, "").trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1).trim();
  }

  return raw;
}

function containsItalianSignals(text) {
  const body = text.replace(/^---[\s\S]*?---/, "").toLowerCase();
  const signals = [" questo ", " della ", " degli ", " perché ", " quindi ", " articolo ", " normativa "];
  return signals.filter((token) => body.includes(token)).length >= 3;
}

if (!fs.existsSync(LOCALIZATION_FILE)) {
  errors.push("Missing src/lib/localization.ts");
} else if (!fs.existsSync(BLOG_DIR)) {
  errors.push("Missing src/content/blog");
} else {
  const localizationSource = fs.readFileSync(LOCALIZATION_FILE, "utf8");
  const pairMatches = [...localizationSource.matchAll(/\{\s*it:\s*["']([^"']+)["']\s*,\s*en:\s*["']([^"']+)["']\s*,?\s*\}/g)];
  const pairs = pairMatches.map((match) => ({ it: match[1], en: match[2] }));

  if (pairs.length === 0) {
    errors.push("No explicit BLOG_TRANSLATION_PAIRS found");
  }

  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "i18n-publication-policy.json"), "utf8"));
  const enBlock = localizationSource.match(/EN_BLOG_CATEGORIES\s*=\s*new Set<string>\(\[([\s\S]*?)\]\)/);
  if (!enBlock) throw new Error("Cannot read authoritative EN category registry");
  const enCategories = new Set([...enBlock[1].matchAll(/["']([^"']+)["']/g)].map(m => m[1]));
  function publicationData(fm, relativePath) {
    const category = field(fm, "category");
    return {
      path: relativePath,
      language: enCategories.has(category) ? "en" : "it",
      status: field(fm, "status") || "ready",
      draft: field(fm, "draft") === "true",
      editorialStatus: field(fm, "editorialStatus") || "current",
      publishDate: field(fm, "publishDate"),
    };
  }
  const promotedPaths = new Set();
  // In PRs, also detect old drafts promoted to ready, including backdated ones.
  const base = process.env.I18N_BASE_SHA;
  if (base) {
    if (!/^[a-f0-9]{40}$/.test(base)) throw new Error("Invalid I18N_BASE_SHA");
    const changed = execFileSync("git", ["diff", "--name-only", "-z", "--diff-filter=AM", base, "HEAD", "--", "src/content/blog"], { encoding: "utf8" }).split("\0").filter(Boolean);
    for (const relativePath of changed) {
      if (!/\.mdx?$/.test(relativePath)) continue;
      let previous = "";
      try {
        previous = execFileSync("git", ["show", base + ":" + relativePath], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        // New paths are protected independently by the policy baseline.
        promotedPaths.add(relativePath);
        continue;
      }
      if (!ready(publicationData(frontmatter(previous), relativePath))) promotedPaths.add(relativePath);
    }
  }

  const files = walk(BLOG_DIR);
  const entries = new Map();

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const fm = frontmatter(source);
    const slug = field(fm, "slug") || path.basename(file).replace(/\.mdx?$/, "");
    if (entries.has(slug)) errors.push(`Duplicate public slug: ${slug}`);
    entries.set(slug, {
      file,
      ...publicationData(fm, path.relative(ROOT, file).split(path.sep).join("/")),
      source,
      title: field(fm, "title"),
      description: field(fm, "description"),
      category: field(fm, "category"),
      canonical: field(fm, "canonical"),
    });
  }

  errors.push(...completenessErrors(entries, pairs, policy, promotedPaths));

  const used = new Set();
  for (const pair of pairs) {
    for (const slug of [pair.it, pair.en]) {
      if (used.has(slug)) errors.push(`Translation slug registered more than once: ${slug}`);
      used.add(slug);
      if (!entries.has(slug)) errors.push(`Registered translation missing content file: ${slug}`);
    }

    const it = entries.get(pair.it);
    const en = entries.get(pair.en);
    if (!it || !en) continue;

    if (!it.title || !en.title) errors.push(`Missing title in pair ${pair.it} ↔ ${pair.en}`);
    if (!it.description || !en.description) warnings.push(`Missing description in pair ${pair.it} ↔ ${pair.en}`);
    if (it.title === en.title) warnings.push(`IT/EN titles are identical: ${pair.it} ↔ ${pair.en}`);
    if (containsItalianSignals(en.source)) warnings.push(`English target may still contain Italian prose: ${pair.en}`);

    const expectedEnCanonical = `https://canapalandia.com/blog/${pair.en}/`;
    if (en.canonical && en.canonical !== expectedEnCanonical) {
      warnings.push(
        `Legacy/stale EN frontmatter canonical for ${pair.en}: ${en.canonical} (runtime route uses ${expectedEnCanonical})`
      );
    }
  }

  const routeFile = path.join(ROOT, "src", "pages", "blog", "[slug].astro");
  const routeSource = fs.existsSync(routeFile) ? fs.readFileSync(routeFile, "utf8") : "";
  for (const required of [
    "translationAlternates",
    "LanguageSwitcher",
    'hreflang="it"',
    'hreflang="en"',
    'hreflang="x-default"',
  ]) {
    if (!routeSource.includes(required)) {
      errors.push(`Blog route missing localization guard: ${required}`);
    }
  }

  const shareSource = fs.readFileSync(path.join(ROOT, "src", "components", "PostShare.astro"), "utf8");
  if (!shareSource.includes('lang?: "it" | "en"')) errors.push("PostShare is not language-aware");

  const attachmentsSource = fs.readFileSync(path.join(ROOT, "src", "components", "PostAttachments.astro"), "utf8");
  if (!attachmentsSource.includes('lang?: "it" | "en"')) errors.push("PostAttachments is not language-aware");

  const englishSidebar = path.join(ROOT, "src", "components", "blog", "EnglishBlogSidebar.astro");
  if (!fs.existsSync(englishSidebar)) errors.push("Missing EnglishBlogSidebar.astro");
}

if (warnings.length) {
  console.warn("\n[i18n:audit] warnings");
  warnings.forEach((message) => console.warn(`- ${message}`));
}

if (errors.length) {
  console.error("\n[i18n:audit] FAILED");
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("[i18n:audit] OK — explicit translation pairs and article localization guards are consistent.");
