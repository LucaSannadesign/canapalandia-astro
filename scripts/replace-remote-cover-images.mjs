#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const BLOG_DIR = path.resolve(process.cwd(), "src/content/blog");
const PUBLIC_IMAGES_DIR = path.resolve(process.cwd(), "public/images");
const REPORT_PATH = path.resolve(
  process.cwd(),
  "reports/replace-remote-cover-images-report.json",
);

const isApply = process.argv.includes("--apply");
const isDryRun = !isApply;

const LOCAL_IMAGES = {
  cbd: "/images/cbd-2026-leggere-coa-etichette-claim.webp",
  light: "/images/cannabis-light-cbd-legale-italia-2026.webp",
  filiera: "/images/filiera-canapa-italia-stretta-cannabis-light.webp",
  salute: "/images/cbd-novel-food-ue-2026.webp",
  legalizzazione: "/images/cannabis-light-italia-cosa-conta-davvero-in-caso-di-controlli.webp",
  politica: "/images/pasqua-proibizionismo-canapa-italia.webp",
  fallback: "/images/cannabis-light-cbd-legale-italia-2026.webp",
};

const RULES = [
  {
    image: LOCAL_IMAGES.legalizzazione,
    keywords: [
      "legalizzazione",
      "europa",
      "germania",
      "canada",
      "uruguay",
      "argentina",
      "repubblica ceca",
      "referendum",
    ],
  },
  {
    image: LOCAL_IMAGES.salute,
    keywords: [
      "salute",
      "medica",
      "terapeutica",
      "pazient",
      "benessere",
    ],
  },
  {
    image: LOCAL_IMAGES.filiera,
    keywords: [
      "filiera",
      "economia verde",
      "lavoro",
      "industria",
      "canapa industriale",
    ],
  },
  {
    image: LOCAL_IMAGES.filiera,
    keywords: [
      "ambiente",
      "sostenibil",
      "bioedilizia",
      "suolo",
      "moda sostenibile",
    ],
  },
  {
    image: LOCAL_IMAGES.politica,
    keywords: [
      "proibizion",
      "25 aprile",
      "politica",
      "satira",
      "libert",
    ],
  },
  {
    image: LOCAL_IMAGES.light,
    keywords: [
      "cannabis light",
      "decreto sicurezza",
      "normativa",
      "controll",
      "proibizion",
    ],
  },
  {
    image: LOCAL_IMAGES.cbd,
    keywords: [
      "cbd",
      "coa",
      "etichett",
      "novel food",
      "claim",
      "controll",
    ],
  },
];

function walkFiles(dirPath, out = []) {
  if (!fs.existsSync(dirPath)) return out;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".mdx")) out.push(fullPath);
  }
  return out;
}

function hasRequiredLocalImages() {
  const required = new Set(Object.values(LOCAL_IMAGES));
  const missing = [];
  for (const imagePath of required) {
    const rel = imagePath.replace(/^\/+/, "");
    const abs = path.join(process.cwd(), "public", rel.replace(/^images\//, "images/"));
    if (!fs.existsSync(abs)) missing.push(imagePath);
  }
  return missing;
}

function splitFrontmatter(content) {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return null;
  const fm = content.slice(4, end + 1);
  const body = content.slice(end + 5);
  return { frontmatter: fm, body };
}

function getFieldValue(frontmatter, field) {
  const re = new RegExp(`^${field}:\\s*(.+)$`, "m");
  const m = frontmatter.match(re);
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}

function setOrAddField(frontmatter, field, value) {
  const escaped = value.replace(/"/g, '\\"');
  const line = `${field}: "${escaped}"`;
  const re = new RegExp(`^${field}:\\s*.*$`, "m");
  if (re.test(frontmatter)) return frontmatter.replace(re, line);
  return `${frontmatter}${frontmatter.endsWith("\n") ? "" : "\n"}${line}\n`;
}

function isRemoteWpImage(value) {
  return typeof value === "string" && value.includes("/wp-content/uploads/");
}

function pickLocalImage({ title, category, tags }) {
  const haystack = `${title} ${category} ${tags}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw))) return rule.image;
  }
  return LOCAL_IMAGES.fallback;
}

function main() {
  const missingLocalImages = hasRequiredLocalImages();
  if (missingLocalImages.length > 0) {
    console.error("[replace-remote-cover-images] Missing required local images:");
    for (const img of missingLocalImages) console.error(`  - ${img}`);
    process.exit(1);
  }

  const files = walkFiles(BLOG_DIR);
  const candidates = [];
  const changes = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const split = splitFrontmatter(content);
    if (!split) continue;

    const { frontmatter, body } = split;
    const title = getFieldValue(frontmatter, "title");
    const category = getFieldValue(frontmatter, "category");
    const tags = getFieldValue(frontmatter, "tags");
    const coverImage = getFieldValue(frontmatter, "coverImage");
    const image = getFieldValue(frontmatter, "image");

    const hasRemoteCover = isRemoteWpImage(coverImage);
    const hasRemoteImage = isRemoteWpImage(image);
    if (!hasRemoteCover && !hasRemoteImage) continue;

    const localImage = pickLocalImage({ title, category, tags });
    const absoluteOg = `https://canapalandia.com${localImage}`;
    candidates.push({ filePath, title, localImage });

    let nextFrontmatter = frontmatter;
    nextFrontmatter = setOrAddField(nextFrontmatter, "coverImage", localImage);
    nextFrontmatter = setOrAddField(nextFrontmatter, "image", localImage);
    nextFrontmatter = setOrAddField(nextFrontmatter, "ogImage", absoluteOg);
    nextFrontmatter = setOrAddField(nextFrontmatter, "twitterImage", absoluteOg);

    if (nextFrontmatter !== frontmatter) {
      const nextContent = `---\n${nextFrontmatter}---${body}`;
      changes.push({
        filePath,
        title,
        localImage,
        applied: false,
        changedFields: ["coverImage", "image", "ogImage", "twitterImage"],
        nextContent,
      });
    }
  }

  if (isApply) {
    for (const item of changes) {
      fs.writeFileSync(item.filePath, item.nextContent, "utf8");
      item.applied = true;
      delete item.nextContent;
    }
  } else {
    for (const item of changes) delete item.nextContent;
  }

  const mode = isDryRun ? "dry-run" : "apply";
  console.log(`[replace-remote-cover-images] mode: ${mode}`);
  console.log(`[replace-remote-cover-images] files analyzed: ${files.length}`);
  console.log(`[replace-remote-cover-images] candidate files: ${candidates.length}`);
  console.log(
    `[replace-remote-cover-images] files ${isDryRun ? "that would be modified" : "modified"}: ${changes.length}`,
  );

  if (changes.length > 0) {
    console.log("[replace-remote-cover-images] examples (max 50):");
    for (const item of changes.slice(0, 50)) {
      console.log(
        `  - ${path.relative(process.cwd(), item.filePath)} => ${item.localImage}`,
      );
    }
  }

  if (isApply) {
    const reportDir = path.dirname(REPORT_PATH);
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const report = {
      mode,
      generatedAt: new Date().toISOString(),
      filesAnalyzed: files.length,
      candidateFiles: candidates.length,
      modifiedFiles: changes.length,
      changes: changes.map((c) => ({
        filePath: path.relative(process.cwd(), c.filePath),
        title: c.title,
        localImage: c.localImage,
        changedFields: c.changedFields,
        applied: c.applied,
      })),
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.log(
      `[replace-remote-cover-images] report written: ${path.relative(process.cwd(), REPORT_PATH)}`,
    );
  }
}

main();
