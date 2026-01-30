import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import dotenv from "dotenv";

const ROOT = process.cwd();
dotenv.config({ path: path.join(ROOT, ".env") });
dotenv.config({ path: path.join(ROOT, ".env.local"), override: true });

const CAL_PATH = path.join(ROOT, "calendar", "posts.json");
const OUT_DIR = path.join(ROOT, "src", "content", "blog");
const PUBLIC_IMAGES_DIR = path.join(ROOT, "public", "images");

const MAX_SLUG_LENGTH = 80;
const IT_STOPWORDS = new Set([
  "a", "ad", "al", "allo", "ai", "agli", "all", "alla", "alle",
  "da", "dal", "dallo", "dai", "dagli", "dall", "dalla", "dalle",
  "di", "del", "dello", "dei", "degli", "dell", "della", "delle",
  "in", "nel", "nello", "nei", "negli", "nell", "nella", "nelle",
  "su", "sul", "sullo", "sui", "sugli", "sull", "sulla", "sulle",
  "per", "tra", "fra", "con", "e", "ed", "o", "od", "ma", "che",
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una",
]);

function logStep(title) {
  console.log(`\n[agent] ===== ${title} =====`);
}

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

function romeDateISO() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function ensureEnv() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing. Set it in .env/.env.local or GitHub Actions secrets.");
  }
  if (!process.env.SITE_URL) {
    throw new Error("SITE_URL missing. Set it in .env/.env.local or GitHub Actions env vars.");
  }
}

function loadCalendar() {
  if (!fs.existsSync(CAL_PATH)) throw new Error(`Missing ${CAL_PATH}`);
  const raw = fs.readFileSync(CAL_PATH, "utf8");
  const posts = JSON.parse(raw);
  if (!Array.isArray(posts)) throw new Error("calendar/posts.json must be an array");
  return posts;
}

function saveCalendar(posts) {
  const sorted = posts.slice().sort((a, b) => String(a.publishDate).localeCompare(String(b.publishDate)));
  fs.writeFileSync(CAL_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  return sorted;
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
  if (slug.length > MAX_SLUG_LENGTH) slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
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

function checkSlugExists(slug) {
  const outFileMdx = path.join(OUT_DIR, `${slug}.mdx`);
  const outFileMd = path.join(OUT_DIR, `${slug}.md`);
  if (fs.existsSync(outFileMdx) || fs.existsSync(outFileMd)) return true;

  const wpPagesPath = path.join(ROOT, "data", "wp", "out", "pages.json");
  if (fs.existsSync(wpPagesPath)) {
    try {
      const wpPages = JSON.parse(fs.readFileSync(wpPagesPath, "utf8"));
      if (Array.isArray(wpPages)) {
        const found = wpPages.find(p => {
          const pSlug = p?.slug || p?.post_name || "";
          return pSlug === slug || pSlug === slug.replace(/^\/+|\/+$/g, "");
        });
        if (found) return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

function readFrontmatterField(raw, key) {
  const fm = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!fm) return null;
  const re = new RegExp(`^${key}:\\s*(.+)\\s*$`, "m");
  const match = fm[1].match(re);
  return match ? match[1].trim().replace(/^"|"$/g, "") : null;
}

function extractJsonLd(raw) {
  const match = raw.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (!match) return null;
  const jsonText = match[1].trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function run(cmd, options = {}) {
  return execSync(cmd, { stdio: "inherit", ...options });
}

function runCapture(cmd, options = {}) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...options }).trim();
}

async function generateSlotProposal(targetDate) {
  const model = process.env.OPENAI_MODEL_DEFAULT || "gpt-5-mini";
  const maxOut = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || "700");
  const prompt = `Sei un content editor per un blog italiano sulla cannabis legale.\n\nGenera UNA proposta di slot editoriale per la data ${targetDate}.\nRestituisci SOLO JSON valido senza spiegazioni, con queste chiavi:\n- title\n- category (es. Attualità, Normativa, Salute, Business, Cultura)\n- tags (array 1-3 voci, lowercase)\n- focusKeyword\n- intent ("informazionale" o "commerciale")\n\nVincoli: titolo in italiano, SEO-friendly, tono divulgativo. focusKeyword breve (2-5 parole).`;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: maxOut,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const chunks = [];
  for (const item of data.output || []) {
    if (item?.type === "message" && item?.role === "assistant") {
      for (const c of item.content || []) {
        if (c?.type === "output_text" && typeof c.text === "string") chunks.push(c.text);
      }
    }
  }
  const raw = chunks.join("\n").trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`OpenAI output not JSON: ${raw.slice(0, 200)}`);
  const proposal = JSON.parse(jsonMatch[0]);

  return proposal;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map(t => String(t).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 3);
}

function ensureUniqueSlug(baseSlug) {
  let slug = baseSlug;
  let i = 2;
  while (checkSlugExists(slug)) {
    slug = `${baseSlug}-${i}`;
    i += 1;
  }
  return slug;
}

function ensureBranch(branch) {
  run(`git checkout -B ${branch}`);
  run(`git config user.email "agent@canapalandia.com"`);
  run(`git config user.name "Canapalandia Agent"`);
}

function commitPushAndPr({ branch, slug, title }) {
  run("git add -A");
  const status = runCapture("git status --porcelain");
  if (!status) {
    console.log("[agent] No changes detected, skipping commit/PR.");
    return;
  }
  run(`git commit -m "feat(agent): publish ${slug}"`);
  run(`git push -u origin ${branch}`);

  const prTitle = `Publish ${slug}`;
  const prBody = `Automated publish via agent.\n\nTitle: ${title}\nSlug: ${slug}\nBranch: ${branch}`;

  try {
    run(`gh pr create --title "${prTitle}" --body "${prBody}" --base main --head ${branch}`);
    console.log(`[agent] PR created: ${prTitle}`);
  } catch (err) {
    console.warn("[agent] gh pr create failed (maybe already exists).", err?.message || err);
  }
}

async function verifySeo({ slug }) {
  const siteUrl = process.env.SITE_URL.replace(/\/+$/, "");
  const canonical = `${siteUrl}/blog/${slug}/`;
  const expectedImage = `/images/${slug}.webp`;
  const imagePath = path.join(PUBLIC_IMAGES_DIR, `${slug}.webp`);

  const mdxPath = path.join(OUT_DIR, `${slug}.mdx`);
  if (!fs.existsSync(mdxPath)) throw new Error(`Missing generated MDX: ${mdxPath}`);

  const raw = fs.readFileSync(mdxPath, "utf8");
  const fmCanonical = readFrontmatterField(raw, "canonical");
  const robots = readFrontmatterField(raw, "robots");
  const fmImage = readFrontmatterField(raw, "image");
  const fmOgImage = readFrontmatterField(raw, "ogImage");
  const jsonLd = extractJsonLd(raw);

  if (fmCanonical !== canonical) {
    throw new Error(`canonical mismatch. expected=${canonical} found=${fmCanonical}`);
  }
  if (robots !== "index,follow") {
    throw new Error(`robots mismatch. expected="index,follow" found=${robots}`);
  }
  if (fmImage !== expectedImage || fmOgImage !== expectedImage) {
    throw new Error(`og image mismatch. expected=${expectedImage} found image=${fmImage} ogImage=${fmOgImage}`);
  }
  if (!fs.existsSync(imagePath)) {
    throw new Error(`OG image file missing: ${imagePath}`);
  }
  if (!jsonLd || jsonLd["@type"] !== "Article") {
    throw new Error("JSON-LD Article missing or invalid in MDX");
  }
  if (!jsonLd.breadcrumb || jsonLd.breadcrumb["@type"] !== "BreadcrumbList") {
    throw new Error("JSON-LD BreadcrumbList missing or invalid in MDX");
  }

  const sitemapUrl = `${siteUrl}/sitemap.xml`;
  const rssUrl = `${siteUrl}/rss.xml`;

  const sitemapRes = await fetch(sitemapUrl);
  if (!sitemapRes.ok) throw new Error(`Failed to fetch sitemap.xml (${sitemapRes.status})`);
  const sitemapXml = await sitemapRes.text();
  if (!sitemapXml.includes(`/blog/${slug}/`)) {
    throw new Error(`sitemap.xml missing /blog/${slug}/`);
  }

  const rssRes = await fetch(rssUrl);
  if (!rssRes.ok) throw new Error(`Failed to fetch rss.xml (${rssRes.status})`);
  const rssXml = await rssRes.text();
  if (!rssXml.includes(`${siteUrl}/blog/${slug}/`)) {
    throw new Error(`rss.xml missing ${siteUrl}/blog/${slug}/`);
  }

  console.log("[agent] SEO checks passed (canonical, robots, sitemap, rss)");
}

async function main() {
  ensureEnv();

  const forcedDate = arg("--date");
  const targetDate = forcedDate || romeDateISO();
  const branch = `agent/${targetDate.replaceAll("-", "")}`;

  logStep("Calendar check");
  const posts = loadCalendar();
  const slot = posts.find(p => String(p.publishDate) === targetDate);

  if (!slot) {
    logStep("Generate slot proposal");
    const proposal = await generateSlotProposal(targetDate);
    const title = String(proposal.title || "Titolo provvisorio").trim();
    const category = String(proposal.category || "Attualità").trim();
    const tags = normalizeTags(proposal.tags);
    const focusKeyword = String(proposal.focusKeyword || title).trim();
    const intent = String(proposal.intent || "informazionale").trim().toLowerCase();

    let slug = buildSlugFromTitle(title, targetDate);
    slug = ensureUniqueSlug(slug);

    const newSlot = {
      publishDate: targetDate,
      title,
      slug,
      category,
      tags,
      focusKeyword,
      intent,
      status: "ready",
    };

    const updated = saveCalendar([...posts, newSlot]);
    console.log(`[agent] Added slot for ${targetDate}: ${title} (${slug})`);
    console.log(`[agent] Calendar entries: ${updated.length}`);

    logStep("Git commit + PR");
    ensureBranch(branch);
    commitPushAndPr({ branch, slug, title });
    console.log("[agent] Slot proposal completed. Stopping.");
    return;
  }

  logStep("Slot found - generate post");
  const resolvedSlug = resolvePostSlug(slot);
  slot.slug = resolvedSlug;
  console.log(`[agent] Slot: ${slot.title} → ${resolvedSlug}`);

  run(`node scripts/auto-post.mjs --date ${targetDate} --force`);

  logStep("SEO verification");
  await verifySeo({ slug: resolvedSlug });

  logStep("Git commit + PR");
  ensureBranch(branch);
  commitPushAndPr({ branch, slug: resolvedSlug, title: slot.title });
}

main().catch(err => {
  console.error("[agent] ERROR:", err.message || err);
  process.exit(1);
});