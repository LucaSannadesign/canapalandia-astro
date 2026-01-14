import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import he from "he";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "src", "content", "blog");
const PUBLIC_DIR = path.join(ROOT, "public");

// Env
const env = (k, fallback = "") => process.env[k] ?? fallback;

const WP_DB_HOST = env("WP_DB_HOST", "127.0.0.1");
const WP_DB_PORT = Number(env("WP_DB_PORT", "3306"));
const WP_DB_USER = env("WP_DB_USER");
const WP_DB_PASSWORD = env("WP_DB_PASSWORD");
const WP_DB_NAME = env("WP_DB_NAME");
const WP_TABLE_PREFIX = env("WP_TABLE_PREFIX", "wp_").trim();

const WP_SITE_URL = env("WP_SITE_URL").replace(/\/$/, "");
const WP_UPLOADS_BASE = env("WP_UPLOADS_BASE", `${WP_SITE_URL}/wp-content/uploads`).replace(/\/$/, "");
const MIRROR_MEDIA = String(env("MIRROR_MEDIA", "false")).toLowerCase() === "true";

function assertEnv() {
  const required = ["WP_DB_USER", "WP_DB_PASSWORD", "WP_DB_NAME", "WP_SITE_URL"];
  const missing = required.filter((k) => !env(k));
  if (missing.length) {
    throw new Error(`Mancano variabili .env: ${missing.join(", ")}`);
  }
}

function stripHtml(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSafeFilename(slug) {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9\-_/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/g, "-")
    .replace(/^-|-$/g, "");
}

function yamlEscape(str = "") {
  // YAML safe, single-line
  return String(str).replace(/\r?\n/g, " ").replace(/"/g, '\\"').trim();
}

function pickTags(tags = [], max = 3) {
  // per tua preferenza Canapalandia: massimo 3 tag
  return tags.slice(0, max);
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

async function downloadToPublic(url, relativeOutPath) {
  const outPath = path.join(PUBLIC_DIR, relativeOutPath);
  await ensureDir(path.dirname(outPath));

  // già scaricata?
  try {
    await fs.access(outPath);
    return `/${relativeOutPath.replace(/\\/g, "/")}`;
  } catch {}

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fallito ${res.status} per ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, buf);
  return `/${relativeOutPath.replace(/\\/g, "/")}`;
}

async function main() {
  assertEnv();
  await ensureDir(OUT_DIR);

  const db = await mysql.createConnection({
    host: WP_DB_HOST,
    port: WP_DB_PORT,
    user: WP_DB_USER,
    password: WP_DB_PASSWORD,
    database: WP_DB_NAME,
    charset: "utf8mb4",
  });

  const p = (name) => `${WP_TABLE_PREFIX}${name}`;

  // 1) Post pubblicati
  const [posts] = await db.execute(
    `
    SELECT ID, post_name, post_title, post_content, post_excerpt,
           post_date_gmt, post_modified_gmt, post_author
    FROM ${p("posts")}
    WHERE post_type='post' AND post_status='publish'
    ORDER BY post_date_gmt DESC
    `
  );

  const postList = Array.isArray(posts) ? posts : [];
  const postIds = postList.map((x) => x.ID);

  // 2) Autori
  const [users] = await db.execute(
    `
    SELECT ID, display_name, user_email
    FROM ${p("users")}
    WHERE ID IN (${postIds.length ? postIds.map(() => "?").join(",") : "NULL"})
    `,
    postIds.length ? postList.map((x) => x.post_author) : []
  ).catch(() => [[], null]);

  const userMap = new Map((users || []).map((u) => [u.ID, u]));

  // 3) Categorie e tag (tutte in una botta)
  const termSql = (taxonomy) => `
    SELECT tr.object_id AS post_id, t.slug, t.name
    FROM ${p("term_relationships")} tr
    JOIN ${p("term_taxonomy")} tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
    JOIN ${p("terms")} t ON tt.term_id = t.term_id
    WHERE tt.taxonomy = ?
    AND tr.object_id IN (${postIds.length ? postIds.map(() => "?").join(",") : "NULL"})
  `;

  const params = postIds.length ? postIds : [];
  const [catRows] = await db.execute(termSql("category"), ["category", ...params]);
  const [tagRows] = await db.execute(termSql("post_tag"), ["post_tag", ...params]);

  const catsByPost = new Map();
  for (const r of catRows || []) {
    if (!catsByPost.has(r.post_id)) catsByPost.set(r.post_id, []);
    catsByPost.get(r.post_id).push({ slug: r.slug, name: r.name });
  }

  const tagsByPost = new Map();
  for (const r of tagRows || []) {
    if (!tagsByPost.has(r.post_id)) tagsByPost.set(r.post_id, []);
    tagsByPost.get(r.post_id).push({ slug: r.slug, name: r.name });
  }

  // 4) Featured image (thumbnail)
  const [thumbMeta] = await db.execute(
    `
    SELECT post_id, meta_value AS thumb_id
    FROM ${p("postmeta")}
    WHERE meta_key='_thumbnail_id'
    AND post_id IN (${postIds.length ? postIds.map(() => "?").join(",") : "NULL"})
    `,
    postIds.length ? postIds : []
  );

  const thumbByPost = new Map();
  const attachmentIds = [];
  for (const r of thumbMeta || []) {
    const aid = Number(r.thumb_id);
    if (aid) {
      thumbByPost.set(Number(r.post_id), aid);
      attachmentIds.push(aid);
    }
  }

  // attachment path + alt
  let attachedFileMap = new Map();
  let attachmentAltMap = new Map();

  if (attachmentIds.length) {
    const uniq = [...new Set(attachmentIds)];

    const [attachedFiles] = await db.execute(
      `
      SELECT post_id, meta_value AS file
      FROM ${p("postmeta")}
      WHERE meta_key='_wp_attached_file'
      AND post_id IN (${uniq.map(() => "?").join(",")})
      `,
      uniq
    );

    attachedFileMap = new Map((attachedFiles || []).map((r) => [Number(r.post_id), r.file]));

    const [alts] = await db.execute(
      `
      SELECT post_id, meta_value AS alt
      FROM ${p("postmeta")}
      WHERE meta_key='_wp_attachment_image_alt'
      AND post_id IN (${uniq.map(() => "?").join(",")})
      `,
      uniq
    );
    attachmentAltMap = new Map((alts || []).map((r) => [Number(r.post_id), r.alt]));
  }

  // 5) Generazione file MDX
  let written = 0;

  for (const post of postList) {
    const id = Number(post.ID);
    const slug = String(post.post_name || "").trim();
    if (!slug) continue;

    const title = he.decode(String(post.post_title || "").trim()) || slug;
    const contentHtml = String(post.post_content || "").trim();
    const excerptRaw = String(post.post_excerpt || "").trim();
    const excerpt = excerptRaw ? stripHtml(excerptRaw) : stripHtml(contentHtml).slice(0, 180);

    const publishDate = new Date(post.post_date_gmt + "Z");
    const updatedDate = new Date(post.post_modified_gmt + "Z");

    const author = userMap.get(Number(post.post_author))?.display_name || "Canapalandia";
    const categories = (catsByPost.get(id) || []).map((c) => c.slug);
    const tags = pickTags((tagsByPost.get(id) || []).map((t) => t.slug), 3);

    // Categoria primaria (prima, se esiste)
    const primaryCategory = categories[0] || "";

    // Featured image
    let coverImage = "";
    let coverAlt = "";
    const thumbId = thumbByPost.get(id);
    if (thumbId) {
      const fileRel = attachedFileMap.get(thumbId); // es: 2025/06/img.jpg
      if (fileRel) {
        const remoteUrl = `${WP_UPLOADS_BASE}/${String(fileRel).replace(/^\/+/, "")}`;
        coverAlt = he.decode(String(attachmentAltMap.get(thumbId) || title)).trim();

        if (MIRROR_MEDIA) {
          // Salva in public/wp/uploads/2025/06/img.jpg
          const localPath = `wp/uploads/${String(fileRel).replace(/^\/+/, "")}`;
          try {
            coverImage = await downloadToPublic(remoteUrl, localPath);
          } catch {
            // fallback remoto
            coverImage = remoteUrl;
          }
        } else {
          coverImage = remoteUrl;
        }
      }
    }

    const frontmatter = [
      `---`,
      `title: "${yamlEscape(title)}"`,
      `description: "${yamlEscape(excerpt)}"`,
      `slug: "${yamlEscape(slug)}"`,
      `publishDate: "${publishDate.toISOString()}"`,
      `updatedDate: "${updatedDate.toISOString()}"`,
      `author: "${yamlEscape(author)}"`,
      primaryCategory ? `category: "${yamlEscape(primaryCategory)}"` : `category: ""`,
      `tags: [${tags.map((t) => `"${yamlEscape(t)}"`).join(", ")}]`,
      coverImage ? `coverImage: "${yamlEscape(coverImage)}"` : `coverImage: ""`,
      coverAlt ? `coverAlt: "${yamlEscape(coverAlt)}"` : `coverAlt: ""`,
      `canonical: "${WP_SITE_URL.replace(/\/$/, "")}/${slug}/"`,
      `---`,
      ``,
    ].join("\n");

    // MDX: teniamo HTML puro (funziona benissimo in MDX)
    // Piccola pulizia: elimina i marker Gutenberg commentati se vuoi
    const body = contentHtml
      .replace(/<!--\s*wp:[\s\S]*?-->/g, "")  // rimuove commenti wp:... (opzionale)
      .trim();

    const mdx = `${frontmatter}${body}\n`;

    const filename = `${toSafeFilename(slug)}.mdx`;
    const outPath = path.join(OUT_DIR, filename);

    const changed = await writeFileIfChanged(outPath, mdx);
    if (changed) written++;
  }

  await db.end();

  console.log(`Post trovati: ${postList.length}`);
  console.log(`File aggiornati/scritti: ${written}`);
  console.log(`Immagini locali: ${MIRROR_MEDIA ? "ON" : "OFF"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
