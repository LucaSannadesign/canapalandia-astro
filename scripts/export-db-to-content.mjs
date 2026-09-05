import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import he from "he";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "src", "content", "blog");
const PUBLIC_DIR = path.join(ROOT, "public");
const WP_MEDIA_DIR = path.join(PUBLIC_DIR, "wp-media");

// Env
const env = (k, fallback = "") => process.env[k] ?? fallback;

const DB_HOST = env("DB_HOST");
const DB_PORT = Number(env("DB_PORT", "3306"));
const DB_USER = env("DB_USER");
const DB_PASSWORD = env("DB_PASSWORD");
const DB_NAME = env("DB_NAME");
const WP_TABLE_PREFIX = env("WP_TABLE_PREFIX", "wp_").trim();

function assertEnv() {
  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  const missing = required.filter((k) => !env(k));
  if (missing.length) {
    throw new Error(`Mancano variabili .env: ${missing.join(", ")}`);
  }
}

function toSafeSlug(slug) {
  return String(slug || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function yamlEscape(str = "") {
  return String(str)
    .replace(/\r?\n/g, " ")
    .replace(/"/g, '\\"')
    .replace(/\\/g, "\\\\")
    .trim();
}

function stripHtml(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sanitizza HTML mantenendo struttura base ma rimuovendo script/style pericolosi
 */
function sanitizeHtml(html = "") {
  if (!html || typeof html !== "string") return "";
  
  // Rimuovi script e style
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  
  // Rimuovi attributi pericolosi (onclick, onerror, javascript:, data:)
  cleaned = cleaned.replace(
    /<(\w+)([^>]*)>/gi,
    (match, tag, attrs) => {
      const safeAttrs = attrs
        .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
        .replace(/\s*href\s*=\s*["']javascript:[^"']*["']/gi, "")
        .replace(/\s*src\s*=\s*["']data:[^"']*["']/gi, "");
      return `<${tag}${safeAttrs}>`;
    }
  );
  
  return cleaned.trim();
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeFileIfChanged(filePath, content) {
  try {
    const prev = await fs.readFile(filePath, "utf8");
    if (prev === content) return false;
  } catch {}
  await fs.writeFile(filePath, content, "utf8");
  return true;
}

/**
 * Scarica immagine da URL WordPress e salva in public/wp-media/YYYY/MM/
 * Ritorna path relativo /wp-media/... oppure null se fallisce
 */
async function downloadWpImage(url, postDate) {
  if (!url || typeof url !== "string") return null;

  try {
    // Estrai path da URL
    let urlPath = "";
    try {
      const urlObj = new URL(url);
      urlPath = urlObj.pathname;
    } catch {
      // Se non è URL assoluto, potrebbe essere relativo
      if (url.startsWith("/")) {
        urlPath = url;
      } else {
        return null;
      }
    }

    // Estrai filename
    const filename = path.basename(urlPath);
    const ext = path.extname(filename).toLowerCase();
    
    // Solo immagini
    if (![".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(ext)) {
      return null;
    }

    // Crea path basato su data post o data corrente
    const date = postDate ? new Date(postDate) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const relativePath = `wp-media/${year}/${month}/${filename}`;
    const outPath = path.join(PUBLIC_DIR, relativePath);

    // Se già esiste, ritorna path
    try {
      await fs.access(outPath);
      return `/${relativePath.replace(/\\/g, "/")}`;
    } catch {}

    // Costruisci URL completo se necessario
    let fullUrl = url;
    if (!url.startsWith("http")) {
      // Se è relativo, prova a costruire URL completo (richiede WP_SITE_URL se disponibile)
      const wpSiteUrl = env("WP_SITE_URL", "");
      if (wpSiteUrl) {
        fullUrl = `${wpSiteUrl.replace(/\/$/, "")}${urlPath}`;
      } else {
        return null;
      }
    }

    // Scarica
    await ensureDir(path.dirname(outPath));
    const res = await fetch(fullUrl);
    if (!res.ok) {
      console.warn(`[download] Fallito ${res.status} per ${fullUrl}`);
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(outPath, buf);
    return `/${relativePath.replace(/\\/g, "/")}`;
  } catch (err) {
    console.warn(`[download] Errore per ${url}:`, err.message);
    return null;
  }
}

/**
 * Trova e sostituisce URL immagini nel contenuto HTML
 * Ritorna { content: HTML modificato, imagesDownloaded: numero }
 */
async function processImagesInContent(html, postDate) {
  if (!html || typeof html !== "string") return { content: html, imagesDownloaded: 0 };

  const imgRegex = /<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi;
  let modified = html;
  let imagesDownloaded = 0;
  const replacements = [];

  for (const match of html.matchAll(imgRegex)) {
    const fullMatch = match[0];
    const before = match[1];
    const src = match[2];
    const after = match[3];

    // Se è già un path locale, salta
    if (src.startsWith("/") && !src.includes("wp-content")) {
      continue;
    }

    // Se contiene wp-content/uploads, prova a scaricare
    if (src.includes("wp-content/uploads") || src.includes("wp-content")) {
      const localPath = await downloadWpImage(src, postDate);
      if (localPath) {
        replacements.push({
          old: fullMatch,
          new: `<img${before} src="${localPath}"${after}>`,
        });
        imagesDownloaded++;
      }
    }
  }

  // Applica sostituzioni
  for (const { old, new: newStr } of replacements) {
    modified = modified.replace(old, newStr);
  }

  return { content: modified, imagesDownloaded };
}

async function main() {
  assertEnv();
  await ensureDir(OUT_DIR);
  await ensureDir(WP_MEDIA_DIR);

  console.log("[export] Connessione a database WordPress...");
  
  // Configurazione connessione con SSL per PlanetScale
  const connectionConfig = {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    charset: "utf8mb4",
  };

  // Aggiungi SSL se host contiene "psdb" (PlanetScale) o se esplicitamente richiesto
  if (DB_HOST.includes("psdb") || env("DB_SSL", "true").toLowerCase() === "true") {
    connectionConfig.ssl = {
      rejectUnauthorized: true,
    };
  }

  const db = await mysql.createConnection(connectionConfig);

  try {
    const p = (name) => `${WP_TABLE_PREFIX}${name}`;

    // 1) Estrai posts pubblicati
    console.log("[export] Estrazione posts...");
    const [posts] = await db.execute(`
      SELECT 
        p.ID as id,
        p.post_name as slug,
        p.post_title as title,
        p.post_content as content,
        p.post_excerpt as excerpt,
        p.post_date_gmt as date,
        p.post_modified_gmt as modified,
        p.post_author as author_id
      FROM ${p("posts")} p
      WHERE p.post_type = 'post' 
        AND p.post_status = 'publish'
      ORDER BY p.post_date_gmt DESC
    `);

    const postList = Array.isArray(posts) ? posts : [];
    console.log(`[export] Trovati ${postList.length} posts`);

    if (postList.length === 0) {
      console.warn("[export] Nessun post trovato. Verifica query e status.");
      return;
    }

    // 2) Estrai autori
    const authorIds = [...new Set(postList.map((p) => p.author_id))];
    const [authors] = await db.execute(`
      SELECT ID, display_name, user_nicename
      FROM ${p("users")}
      WHERE ID IN (${authorIds.map(() => "?").join(",")})
    `, authorIds);
    const authorMap = new Map((authors || []).map((a) => [a.ID, a.display_name || a.user_nicename || "Canapalandia"]));

    // 3) Estrai categorie e tag
    const postIds = postList.map((p) => p.id);
    const [terms] = await db.execute(`
      SELECT 
        tr.object_id as post_id,
        t.term_id,
        t.slug,
        t.name,
        tt.taxonomy
      FROM ${p("term_relationships")} tr
      JOIN ${p("term_taxonomy")} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
      JOIN ${p("terms")} t ON tt.term_id = t.term_id
      WHERE tr.object_id IN (${postIds.map(() => "?").join(",")})
        AND tt.taxonomy IN ('category', 'post_tag')
    `, postIds);

    const postCategories = new Map();
    const postTags = new Map();
    const categoryMap = new Map();
    const tagMap = new Map();

    for (const term of terms || []) {
      const slug = toSafeSlug(term.slug);
      const name = he.decode(String(term.name || ""));
      
      if (term.taxonomy === "category") {
        categoryMap.set(term.term_id, { slug, name });
        if (!postCategories.has(term.post_id)) {
          postCategories.set(term.post_id, []);
        }
        postCategories.get(term.post_id).push({ id: term.term_id, slug, name });
      } else if (term.taxonomy === "post_tag") {
        tagMap.set(term.term_id, { slug, name });
        if (!postTags.has(term.post_id)) {
          postTags.set(term.post_id, []);
        }
        postTags.get(term.post_id).push({ id: term.term_id, slug, name });
      }
    }

    // 4) Estrai featured images (thumbnail)
    const [thumbMeta] = await db.execute(`
      SELECT post_id, meta_value AS thumb_id
      FROM ${p("postmeta")}
      WHERE meta_key = '_thumbnail_id'
        AND post_id IN (${postIds.map(() => "?").join(",")})
    `, postIds);

    const thumbByPost = new Map();
    const attachmentIds = [];
    for (const meta of thumbMeta || []) {
      const aid = Number(meta.thumb_id);
      if (aid) {
        thumbByPost.set(Number(meta.post_id), aid);
        attachmentIds.push(aid);
      }
    }

    // Mappa inversa: attachment ID -> post ID.
    // WordPress salva _thumbnail_id sul post, mentre _wp_attached_file appartiene
    // all'attachment: usare thumbByPost.get(attachmentId) non può funzionare.
    const postByThumbnail = new Map(
      [...thumbByPost.entries()].map(([postId, attachmentId]) => [attachmentId, postId])
    );

    // Estrai URL featured images
    const featuredImageMap = new Map();
    if (attachmentIds.length) {
      const [attachedFiles] = await db.execute(`
        SELECT post_id, meta_value AS file
        FROM ${p("postmeta")}
        WHERE meta_key = '_wp_attached_file'
          AND post_id IN (${attachmentIds.map(() => "?").join(",")})
      `, attachmentIds);

      const wpSiteUrl = env("WP_SITE_URL", "");
      for (const file of attachedFiles || []) {
        const attachmentId = Number(file.post_id);
        const postId = postByThumbnail.get(attachmentId);
        if (!postId || !file.file) continue;

        const imageUrl = wpSiteUrl
          ? `${wpSiteUrl.replace(/\/$/, "")}/wp-content/uploads/${String(file.file).replace(/^\/+/, "")}`
          : null;

        if (imageUrl) {
          featuredImageMap.set(postId, imageUrl);
        }
      }
    }

    // 5) Genera file MDX per ogni post
    let written = 0;
    let totalImagesDownloaded = 0;
    let errors = 0;

    for (const post of postList) {
      try {
        const slug = toSafeSlug(post.slug);
        if (!slug) {
          console.warn(`[export] Post ${post.id} senza slug valido, skip`);
          errors++;
          continue;
        }

        const title = he.decode(String(post.title || "").trim()) || slug;
        const contentHtml = String(post.content || "").trim();
        const excerptRaw = String(post.excerpt || "").trim();
        const excerpt = excerptRaw || stripHtml(contentHtml).slice(0, 160);

        const publishDate = new Date(post.date);
        const updatedDate = new Date(post.modified || post.date);
        const author = authorMap.get(post.author_id) || "Canapalandia";

        // Categorie e tag
        const categories = postCategories.get(post.id) || [];
        const tags = postTags.get(post.id) || [];
        const primaryCategory = categories.length > 0 ? categories[0].slug : "";

        // Featured image
        let coverImage = "";
        const featuredImageUrl = featuredImageMap.get(post.id);
        if (featuredImageUrl) {
          const localPath = await downloadWpImage(featuredImageUrl, post.date);
          if (localPath) {
            coverImage = localPath;
            totalImagesDownloaded++;
          }
        }

        // Processa immagini nel contenuto
        const { content: contentProcessed, imagesDownloaded } = await processImagesInContent(
          contentHtml,
          post.date
        );
        totalImagesDownloaded += imagesDownloaded;

        // Sanitizza HTML
        const contentSanitized = sanitizeHtml(contentProcessed);

        // Frontmatter
        const frontmatter = [
          `---`,
          `title: "${yamlEscape(title)}"`,
          `description: "${yamlEscape(excerpt)}"`,
          `slug: "${yamlEscape(slug)}"`,
          `publishDate: "${publishDate.toISOString()}"`,
          `updatedDate: "${updatedDate.toISOString()}"`,
          `author: "${yamlEscape(author)}"`,
          primaryCategory ? `category: "${yamlEscape(primaryCategory)}"` : `category: ""`,
          `tags: [${tags.slice(0, 3).map((t) => `"${yamlEscape(t.slug)}"`).join(", ")}]`,
          `draft: false`,
          `canonical: "/${yamlEscape(slug)}/"`,
          coverImage ? `image: "${yamlEscape(coverImage)}"` : `image: ""`,
          coverImage ? `coverImage: "${yamlEscape(coverImage)}"` : `coverImage: ""`,
          coverImage ? `coverAlt: "${yamlEscape(title)}"` : `coverAlt: ""`,
          `---`,
          ``,
        ].join("\n");

        const md = `${frontmatter}${contentSanitized}\n`;
        const filename = `${slug}.md`;
        const outPath = path.join(OUT_DIR, filename);

        const changed = await writeFileIfChanged(outPath, md);
        if (changed) written++;
      } catch (err) {
        console.error(`[export] Errore processando post ${post.id}:`, err.message);
        errors++;
      }
    }

    // 6) Summary
    console.log(`\n[export] ✓ Completato:`);
    console.log(`  - Post esportati: ${written}`);
    console.log(`  - Immagini scaricate: ${totalImagesDownloaded}`);
    console.log(`  - Errori: ${errors}`);
    console.log(`  - Path: ${OUT_DIR}`);
  } catch (err) {
    console.error("[export] Errore:", err.message);
    if (err.stack) console.error(err.stack);
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
