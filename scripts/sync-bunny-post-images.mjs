#!/usr/bin/env node
// Recupera da un archivio locale (Bunny/backup) le immagini WordPress ancora
// referenziate negli MDX sotto src/content/blog/, le copia in
// public/images/wp-content/uploads/ e riscrivi i riferimenti a /images/wp-content/uploads/…
// Richiede: BUNNY_ARCHIVE_DIR
//   BUNNY_ARCHIVE_DIR="/path" node scripts/sync-bunny-post-images.mjs
//   BUNNY_ARCHIVE_DIR="/path" node scripts/sync-bunny-post-images.mjs --apply

import fs from "node:fs";
import path from "node:path";

const BLOG_DIR = path.resolve(process.cwd(), "src/content/blog");
const TARGET_UPLOADS_DIR = path.resolve(
  process.cwd(),
  "public/images/wp-content/uploads",
);
const BACKUP_DIR_FORBIDDEN = path.resolve(
  process.cwd(),
  "public/images/wp-content/uploads-full-backup",
);
const REPORT_PATH = path.resolve(
  process.cwd(),
  "reports/sync-bunny-post-images-report.json",
);

const isApply = process.argv.includes("--apply");
const isDryRun = !isApply;

const URL_LIKE_REGEX = /https?:\/\/[^\s"'`)<>\]]+|\/[^\s"'`)<>\]]+/g;
const WP_UPLOADS_MARKER = "/wp-content/uploads/";
const NORMALIZED_PREFIX = "/images/wp-content/uploads/";

const bunnyArchiveDirRaw = process.env.BUNNY_ARCHIVE_DIR?.trim() || "";
const BUNNY_ARCHIVE_DIR = path.resolve(
  process.cwd(),
  path.normalize(bunnyArchiveDirRaw),
);

function listFilesRecursively(dirPath, predicate) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursively(fullPath, predicate));
      continue;
    }
    if (entry.isFile() && predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function listMdxFilesRecursively(dirPath) {
  return listFilesRecursively(dirPath, (fullPath) => fullPath.endsWith(".mdx"));
}

function splitQueryAndHash(input) {
  const queryIndex = input.indexOf("?");
  const hashIndex = input.indexOf("#");
  const cutIndex =
    queryIndex === -1
      ? hashIndex
      : hashIndex === -1
        ? queryIndex
        : Math.min(queryIndex, hashIndex);

  if (cutIndex === -1) return { base: input, suffix: "" };
  return {
    base: input.slice(0, cutIndex),
    suffix: input.slice(cutIndex),
  };
}

function extractRelativeFromUploads(reference) {
  const markerIndex = reference.indexOf(WP_UPLOADS_MARKER);
  if (markerIndex === -1) return null;

  const afterMarker = reference.slice(markerIndex + WP_UPLOADS_MARKER.length);
  const { base } = splitQueryAndHash(afterMarker);
  const normalized = base.replace(/^\/+/, "");
  return normalized || null;
}

function isSafeUploadRelative(relativePath) {
  if (!relativePath) return false;
  const segs = relativePath.split("/").filter(Boolean);
  if (segs.length === 0) return false;
  return !segs.some((s) => s === ".." || s === ".");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function buildBasenameIndex(archiveRoot) {
  const index = new Map();
  const seenAbs = new Set();
  if (!fs.existsSync(archiveRoot) || !fs.statSync(archiveRoot).isDirectory()) {
    return index;
  }

  const files = listFilesRecursively(archiveRoot, () => true);
  for (const filePath of files) {
    const absPath = path.resolve(filePath);
    if (seenAbs.has(absPath)) continue;
    seenAbs.add(absPath);
    if (path.resolve(absPath).startsWith(BACKUP_DIR_FORBIDDEN + path.sep)) {
      continue;
    }
    const base = path.basename(filePath);
    if (!index.has(base)) index.set(base, []);
    index.get(base).push(absPath);
  }
  return index;
}

/**
 * Cerca sotto BUNNY_ARCHIVE_DIR (esclusa qualsiasi dipendenza da uploads-full-backup).
 */
function resolveImageFromArchive(relativePath, basenameIndex) {
  if (!isSafeUploadRelative(relativePath)) {
    return { status: "missing" };
  }

  const exactSource = path.join(BUNNY_ARCHIVE_DIR, relativePath);
  if (fs.existsSync(exactSource) && fs.statSync(exactSource).isFile()) {
    return { status: "exact", sourceAbs: path.resolve(exactSource) };
  }

  const base = path.basename(relativePath);
  const matches = basenameIndex.get(base) || [];
  const filtered = matches.filter(
    (p) => !path.resolve(p).startsWith(BACKUP_DIR_FORBIDDEN + path.sep),
  );
  if (filtered.length === 1) {
    return { status: "fallback", sourceAbs: filtered[0] };
  }
  if (filtered.length > 1) {
    return { status: "ambiguous", matches: filtered };
  }
  return { status: "missing" };
}

function requireArchiveOrExit() {
  if (!bunnyArchiveDirRaw) {
    console.error(
      "[sync-bunny-post-images] Errore: imposta BUNNY_ARCHIVE_DIR con il percorso assoluto o relativo all'archivio Bunny.",
    );
    process.exit(1);
  }
  if (!fs.existsSync(BUNNY_ARCHIVE_DIR) || !fs.statSync(BUNNY_ARCHIVE_DIR).isDirectory()) {
    console.error(
      `[sync-bunny-post-images] Errore: BUNNY_ARCHIVE_DIR non esiste o non è una cartella: ${BUNNY_ARCHIVE_DIR}`,
    );
    process.exit(1);
  }
}

function main() {
  requireArchiveOrExit();

  const mdxFiles = listMdxFilesRecursively(BLOG_DIR);
  const basenameIndex = buildBasenameIndex(BUNNY_ARCHIVE_DIR);

  let totalReferencesFound = 0;
  const uniqueImagesRequested = new Set();

  for (const mdxFile of mdxFiles) {
    const content = fs.readFileSync(mdxFile, "utf8");
    const found = content.match(URL_LIKE_REGEX) || [];
    for (const match of found) {
      if (!match.includes(WP_UPLOADS_MARKER)) continue;
      const relativePath = extractRelativeFromUploads(match);
      if (!relativePath) continue;
      if (!isSafeUploadRelative(relativePath)) continue;
      totalReferencesFound += 1;
      uniqueImagesRequested.add(relativePath);
    }
  }

  const resolutions = new Map();
  let exactCount = 0;
  let basenameCount = 0;
  const missingSet = new Set();
  const ambiguousSet = new Set();

  for (const relativePath of uniqueImagesRequested) {
    const res = resolveImageFromArchive(relativePath, basenameIndex);
    resolutions.set(relativePath, res);
    if (res.status === "exact") {
      exactCount += 1;
    } else if (res.status === "fallback") {
      basenameCount += 1;
    } else if (res.status === "missing") {
      missingSet.add(relativePath);
    } else if (res.status === "ambiguous") {
      ambiguousSet.add(relativePath);
    }
  }

  const recoverableImages = [...uniqueImagesRequested].filter((rel) => {
    const r = resolutions.get(rel);
    return r && (r.status === "exact" || r.status === "fallback");
  });

  const fileChanges = [];
  for (const mdxFile of mdxFiles) {
    const original = fs.readFileSync(mdxFile, "utf8");
    const updated = original.replace(URL_LIKE_REGEX, (match) => {
      if (!match.includes(WP_UPLOADS_MARKER)) return match;
      const relativePath = extractRelativeFromUploads(match);
      if (!relativePath || !isSafeUploadRelative(relativePath)) return match;
      const resolution = resolutions.get(relativePath);
      if (!resolution || (resolution.status !== "exact" && resolution.status !== "fallback")) {
        return match;
      }
      const normalizedRef = `${NORMALIZED_PREFIX}${relativePath}`;
      return match !== normalizedRef ? normalizedRef : match;
    });
    if (updated !== original) {
      fileChanges.push({ filePath: mdxFile, content: updated });
    }
  }

  let copiedCount = 0;
  if (isApply) {
    for (const relativePath of recoverableImages) {
      const resolution = resolutions.get(relativePath);
      if (!resolution || (resolution.status !== "exact" && resolution.status !== "fallback")) {
        continue;
      }
      const sourceAbs = resolution.sourceAbs;
      const targetAbs = path.join(TARGET_UPLOADS_DIR, relativePath);
      const targetResolved = path.resolve(targetAbs);
      if (targetResolved.startsWith(BACKUP_DIR_FORBIDDEN + path.sep)) {
        continue;
      }
      ensureDir(path.dirname(targetAbs));
      if (path.resolve(sourceAbs) !== path.resolve(targetAbs)) {
        fs.copyFileSync(sourceAbs, targetAbs);
        copiedCount += 1;
      } else {
        copiedCount += 1;
      }
    }

    for (const f of fileChanges) {
      fs.writeFileSync(f.filePath, f.content, "utf8");
    }

    const reportsDir = path.dirname(REPORT_PATH);
    ensureDir(reportsDir);
    const reportPayload = {
      generatedAt: new Date().toISOString(),
      mode: "apply",
      bunnyArchiveDir: BUNNY_ARCHIVE_DIR,
      mdxAnalyzed: mdxFiles.length,
      imageReferencesFound: totalReferencesFound,
      uniqueImagesRequested: uniqueImagesRequested.size,
      exactMatches: exactCount,
      basenameMatches: basenameCount,
      ambiguous: ambiguousSet.size,
      missing: missingSet.size,
      mdxFilesModified: fileChanges.length,
      imagesCopied: copiedCount,
      missingSample: [...missingSet].slice(0, 50),
      ambiguousSample: [...ambiguousSet].slice(0, 30).map((rel) => {
        const r = resolutions.get(rel);
        return {
          relativePath: rel,
          candidates: (r?.matches || []).map((p) => path.relative(process.cwd(), p)),
        };
      }),
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(reportPayload, null, 2), "utf8");
  }

  const tag = "[sync-bunny-post-images]";
  console.log(`${tag} mode: ${isDryRun ? "dry-run" : "apply"}`);
  console.log(`${tag} BUNNY_ARCHIVE_DIR: ${BUNNY_ARCHIVE_DIR}`);
  console.log(`${tag} MDX analizzati: ${mdxFiles.length}`);
  console.log(`${tag} riferimenti immagine trovati: ${totalReferencesFound}`);
  console.log(`${tag} immagini uniche richieste: ${uniqueImagesRequested.size}`);
  console.log(`${tag} match esatti: ${exactCount}`);
  console.log(`${tag} match per basename: ${basenameCount}`);
  console.log(`${tag} ambigui: ${ambiguousSet.size}`);
  console.log(`${tag} mancanti: ${missingSet.size}`);
  console.log(
    `${tag} file ${
      isDryRun ? "che verrebbero modificati" : "modificati"
    }: ${fileChanges.length}`,
  );
  console.log(
    `${tag} immagini ${
      isDryRun ? "che verrebbero copiate" : "copiate"
    }: ${isDryRun ? recoverableImages.length : copiedCount}`,
  );

  if (isDryRun) {
    console.log(`${tag} (dry-run) file che verrebbero modificati:`);
    for (const f of fileChanges.slice(0, 200)) {
      console.log(`  - ${path.relative(process.cwd(), f.filePath)}`);
    }
  }

  const missingList = [...missingSet];
  if (missingList.length > 0) {
    console.log(`${tag} primi 50 mancanti (path relativo dopo uploads):`);
    for (const rel of missingList.slice(0, 50)) {
      console.log(`  - ${rel}`);
    }
  }

  const ambiguousList = [...ambiguousSet];
  if (ambiguousList.length > 0) {
    console.log(`${tag} primi 30 ambigui:`);
    for (const rel of ambiguousList.slice(0, 30)) {
      const r = resolutions.get(rel);
      const candidates = (r?.matches || [])
        .slice(0, 5)
        .map((p) => path.relative(process.cwd(), p))
        .join(" | ");
      console.log(`  - ${rel}${candidates ? ` => ${candidates}` : ""}`);
    }
  }

  if (isApply) {
    console.log(`${tag} report scritto: ${path.relative(process.cwd(), REPORT_PATH)}`);
  } else {
    console.log(
      `${tag} in dry-run: nessun file copiato o MDX modificato. Usa --apply per applicare.`,
    );
  }
}

main();
