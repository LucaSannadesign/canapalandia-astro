import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import he from "he";
import dotenv from "dotenv";
import https from "node:https";
import http from "node:http";

const ROOT = process.cwd();

// Carica .env e .env.local (override: .env.local sovrascrive .env)
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const OUT_DIR = path.join(ROOT, "src", "content", "blog");
const PUBLIC_DIR = path.join(ROOT, "public");

// Env
const env = (k, fallback = "") => process.env[k] ?? fallback;

// IP diretto per bypass challenge (opzionale)
const WP_ORIGIN_IP = env("WP_ORIGIN_IP");
const WP_ORIGIN_HOST = env("WP_ORIGIN_HOST");

const WP_DB_HOST = env("WP_DB_HOST", "127.0.0.1");
const WP_DB_PORT = Number(env("WP_DB_PORT", "3306"));
const WP_DB_USER = env("WP_DB_USER");
const WP_DB_PASSWORD = env("WP_DB_PASSWORD");
const WP_DB_NAME = env("WP_DB_NAME");
const WP_TABLE_PREFIX = env("WP_TABLE_PREFIX", "wp_").trim();

const WP_SITE_URL = env("WP_SITE_URL") || env("PUBLIC_WP_BASE_URL") || "";
const WP_UPLOADS_BASE = env("WP_UPLOADS_BASE") || (WP_SITE_URL ? `${WP_SITE_URL.replace(/\/$/, "")}/wp-content/uploads` : "");
const MIRROR_MEDIA = String(env("MIRROR_MEDIA", "false")).toLowerCase() === "true";

function assertEnv() {
  // Se abbiamo DB creds, usiamo DB. Altrimenti useremo REST API.
  const hasDb = env("WP_DB_USER") && env("WP_DB_PASSWORD") && env("WP_DB_NAME");
  const hasRestApi = env("PUBLIC_WP_BASE_URL") || env("PUBLIC_WP_HOST");
  
  // Log chiavi presenti (senza valori)
  const presentKeys = [];
  if (env("WP_DB_USER")) presentKeys.push("WP_DB_USER");
  if (env("WP_DB_PASSWORD")) presentKeys.push("WP_DB_PASSWORD");
  if (env("WP_DB_NAME")) presentKeys.push("WP_DB_NAME");
  if (env("WP_DB_HOST")) presentKeys.push("WP_DB_HOST");
  if (env("WP_DB_PORT")) presentKeys.push("WP_DB_PORT");
  if (env("WP_TABLE_PREFIX")) presentKeys.push("WP_TABLE_PREFIX");
  if (env("WP_SITE_URL")) presentKeys.push("WP_SITE_URL");
  if (env("PUBLIC_WP_BASE_URL")) presentKeys.push("PUBLIC_WP_BASE_URL");
  if (env("PUBLIC_WP_HOST")) presentKeys.push("PUBLIC_WP_HOST");
  if (env("WP_ORIGIN_IP")) presentKeys.push("WP_ORIGIN_IP");
  if (env("WP_ORIGIN_HOST")) presentKeys.push("WP_ORIGIN_HOST");
  if (env("MIRROR_MEDIA")) presentKeys.push("MIRROR_MEDIA");
  
  if (presentKeys.length > 0) {
    console.log(`[migrate] Env OK: ${presentKeys.join(", ")}`);
  }
  
  if (!hasDb && !hasRestApi) {
    throw new Error(
      `Mancano variabili .env: imposta WP_DB_USER/WP_DB_PASSWORD/WP_DB_NAME (per DB) ` +
      `oppure PUBLIC_WP_BASE_URL o PUBLIC_WP_HOST (per REST API)`
    );
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

  // Usa fetchWp per download immagini (supporta IP diretto)
  try {
    const res = await fetchWp(url);
    if (!res.ok) throw new Error(`Download fallito ${res.status} per ${url}`);
    // Usa buffer direttamente per file binari
    const buf = res.buffer;
    await fs.writeFile(outPath, buf);
    return `/${relativeOutPath.replace(/\\/g, "/")}`;
  } catch (err) {
    console.warn(`[download] fetchWp fallito per ${url}, fallback a fetch standard:`, err.message);
    // Fallback a fetch standard se fetchWp fallisce
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download fallito ${res.status} per ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(outPath, buf);
    return `/${relativeOutPath.replace(/\\/g, "/")}`;
  }
}

/**
 * Fetch resiliente a WordPress con supporto IP diretto
 */
async function fetchWp(url, options = {}) {
  const urlObj = new URL(url);
  const isHttps = urlObj.protocol === "https:";
  
  // Se WP_ORIGIN_IP è presente, sostituisci hostname con IP
  let targetHost = urlObj.hostname;
  let targetPort = urlObj.port || (isHttps ? 443 : 80);
  let hostHeader = urlObj.hostname;
  
  if (WP_ORIGIN_IP) {
    targetHost = WP_ORIGIN_IP;
    hostHeader = WP_ORIGIN_HOST || urlObj.hostname;
    console.log(`[fetchWp] Using direct IP: ${targetHost} (Host: ${hostHeader})`);
  }
  
  // Headers
  const headers = {
    "Accept": "application/json",
    "Host": hostHeader,
    ...(options.headers || {}),
  };
  
  // Agent per HTTPS con certificato (se necessario)
  let agent = undefined;
  if (isHttps && WP_ORIGIN_IP) {
    agent = new https.Agent({
      rejectUnauthorized: false, // Bypass certificato se IP diretto
    });
  }
  
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: targetHost,
      port: targetPort,
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers,
      agent,
    };
    
    const client = isHttps ? https : http;
    const req = client.request(requestOptions, (res) => {
      const chunks = [];
      
      res.on("data", (chunk) => {
        chunks.push(chunk);
      });
      
      res.on("end", () => {
        const bodyBuffer = Buffer.concat(chunks);
        const bodyString = bodyBuffer.toString("utf8");
        
        // Log errori/redirect
        if (res.statusCode >= 300 && res.statusCode < 500) {
          const location = res.headers.location || "";
          const bodyPreview = bodyString.slice(0, 120).replace(/\s+/g, " ");
          console.warn(
            `[fetchWp] ${res.statusCode} ${res.statusMessage} ` +
            `${location ? `→ ${location}` : ""} ` +
            `${bodyPreview ? `Body: ${bodyPreview}` : ""}`
          );
        }
        
        // Gestisci redirect 3xx
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url);
          return resolve(fetchWp(redirectUrl.toString(), options));
        }
        
        // Gestisci errori
        if (res.statusCode >= 400) {
          const error = new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`);
          error.status = res.statusCode;
          error.body = bodyString;
          return reject(error);
        }
        
        // Successo
        resolve({
          ok: true,
          status: res.statusCode,
          json: async () => {
            try {
              return JSON.parse(bodyString);
            } catch {
              throw new Error("Response is not JSON");
            }
          },
          text: async () => bodyString,
          arrayBuffer: async () => bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength),
          buffer: bodyBuffer, // Per download immagini
        });
      });
    });
    
    req.on("error", reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

/**
 * Fetch posts da WordPress REST API
 */
async function fetchPostsFromRestApi() {
  const baseUrl = (env("PUBLIC_WP_BASE_URL") || env("PUBLIC_WP_HOST") || "").replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("PUBLIC_WP_BASE_URL o PUBLIC_WP_HOST non configurato");
  }

  console.log("[migrate] Using REST mode with base URL:", baseUrl);
  if (WP_ORIGIN_IP) {
    console.log(`[migrate] Direct IP mode: ${WP_ORIGIN_IP} (Host: ${WP_ORIGIN_HOST || new URL(baseUrl).hostname})`);
  }

  const allPosts = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    // IMPORTANTE: trailing slash per evitare 308 redirect
    const url = `${baseUrl}/wp-json/wp/v2/posts/?per_page=${perPage}&page=${page}&_embed=1`;
    console.log(`[migrate] Fetching page ${page}...`);

    try {
      const res = await fetchWp(url);

      if (!res.ok) {
        if (res.status === 404 || res.status === 400) {
          // Fine paginazione
          break;
        }
        throw new Error(`WP REST API errore ${res.status}`);
      }

      const posts = await res.json();
      if (!Array.isArray(posts) || posts.length === 0) {
        break;
      }

      allPosts.push(...posts);
      console.log(`[migrate] Fetched ${posts.length} posts (total: ${allPosts.length})`);

      // Se abbiamo meno di perPage, siamo all'ultima pagina
      if (posts.length < perPage) {
        break;
      }

      page++;
    } catch (err) {
      console.error(`[migrate] Errore fetch pagina ${page}:`, err.message);
      if (err.status) {
        console.error(`[migrate] Status: ${err.status}, Body preview: ${(err.body || "").slice(0, 120)}`);
      }
      break;
    }
  }

  console.log(`[migrate] Posts fetched: ${allPosts.length}`);
  return allPosts;
}

/**
 * Converte post WP REST API in formato compatibile con DB extraction
 */
function normalizeRestApiPost(wpPost) {
  const embedded = wpPost._embedded || {};
  const featuredMedia = embedded["wp:featuredmedia"]?.[0];
  
  // Estrai categorie e tag
  const categories = [];
  const tags = [];
  
  if (embedded["wp:term"]) {
    for (const termGroup of embedded["wp:term"] || []) {
      for (const term of termGroup || []) {
        if (term.taxonomy === "category") {
          categories.push({ slug: term.slug, name: term.name });
        } else if (term.taxonomy === "post_tag") {
          tags.push({ slug: term.slug, name: term.name });
        }
      }
    }
  }

  // Featured image
  let coverImage = "";
  let coverAlt = "";
  if (featuredMedia) {
    const sizes = featuredMedia.media_details?.sizes || {};
    const imageUrl =
      sizes.large?.source_url ||
      sizes.medium_large?.source_url ||
      sizes.full?.source_url ||
      featuredMedia.source_url;
    
    if (imageUrl) {
      coverImage = imageUrl;
      coverAlt = featuredMedia.alt_text || wpPost.title?.rendered || "";
    }
  }

  return {
    ID: wpPost.id,
    post_name: wpPost.slug,
    post_title: wpPost.title?.rendered || wpPost.title || "",
    post_content: wpPost.content?.rendered || wpPost.content || "",
    post_excerpt: wpPost.excerpt?.rendered || wpPost.excerpt || "",
    post_date_gmt: wpPost.date_gmt || wpPost.date || new Date().toISOString(),
    post_modified_gmt: wpPost.modified_gmt || wpPost.modified || wpPost.date || new Date().toISOString(),
    post_author: wpPost.author || 0,
    _categories: categories,
    _tags: tags,
    _coverImage: coverImage,
    _coverAlt: coverAlt,
    _authorName: embedded.author?.[0]?.name || "Canapalandia",
  };
}

async function main() {
  assertEnv();
  await ensureDir(OUT_DIR);

  let postList = [];
  let userMap = new Map();
  let catsByPost = new Map();
  let tagsByPost = new Map();
  let thumbByPost = new Map();
  let attachedFileMap = new Map();
  let attachmentAltMap = new Map();
  let useRestApi = false;

  // Prova DB prima, fallback a REST API
  const hasDb = env("WP_DB_USER") && env("WP_DB_PASSWORD") && env("WP_DB_NAME");
  
  if (hasDb) {
    try {
      console.log("[migrate] Tentativo connessione database...");
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

      postList = Array.isArray(posts) ? posts : [];
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

      userMap = new Map((users || []).map((u) => [u.ID, u]));

      // 3) Categorie e tag
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

      for (const r of catRows || []) {
        if (!catsByPost.has(r.post_id)) catsByPost.set(r.post_id, []);
        catsByPost.get(r.post_id).push({ slug: r.slug, name: r.name });
      }

      for (const r of tagRows || []) {
        if (!tagsByPost.has(r.post_id)) tagsByPost.set(r.post_id, []);
        tagsByPost.get(r.post_id).push({ slug: r.slug, name: r.name });
      }

      // 4) Featured image
      const [thumbMeta] = await db.execute(
        `
        SELECT post_id, meta_value AS thumb_id
        FROM ${p("postmeta")}
        WHERE meta_key='_thumbnail_id'
        AND post_id IN (${postIds.length ? postIds.map(() => "?").join(",") : "NULL"})
        `,
        postIds.length ? postIds : []
      );

      const attachmentIds = [];
      for (const r of thumbMeta || []) {
        const aid = Number(r.thumb_id);
        if (aid) {
          thumbByPost.set(Number(r.post_id), aid);
          attachmentIds.push(aid);
        }
      }

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

      await db.end();
      console.log("[migrate] Database connection: OK");
    } catch (dbErr) {
      console.warn("[migrate] Database connection failed:", dbErr.message);
      console.log("[migrate] Fallback a WordPress REST API...");
      useRestApi = true;
    }
  } else {
    useRestApi = true;
  }

  // Se non abbiamo DB o DB fallito, usa REST API
  if (useRestApi) {
    const restApiPosts = await fetchPostsFromRestApi();
    postList = restApiPosts.map(normalizeRestApiPost);
    
    // Estrai categorie/tag/immagini dai post normalizzati
    for (const post of postList) {
      if (post._categories) {
        catsByPost.set(post.ID, post._categories);
      }
      if (post._tags) {
        tagsByPost.set(post.ID, post._tags);
      }
      if (post._coverImage) {
        thumbByPost.set(post.ID, { url: post._coverImage, alt: post._coverAlt });
      }
      if (post._authorName) {
        userMap.set(post.post_author, { display_name: post._authorName });
      }
    }
  }

  // 5) Generazione file MDX
  let written = 0;
  let errors = 0;

  console.log(`[migrate] Processing ${postList.length} posts...`);

  for (const post of postList) {
    try {
      const id = Number(post.ID);
      const slug = String(post.post_name || "").trim();
      if (!slug) {
        console.warn(`[migrate] Post ${id} senza slug valido, skip`);
        errors++;
        continue;
      }

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
      const thumbData = thumbByPost.get(id);
      
      if (thumbData) {
        // Se è da REST API, thumbData è { url, alt }
        if (thumbData.url) {
          coverImage = thumbData.url;
          coverAlt = thumbData.alt || title;
          
          if (MIRROR_MEDIA) {
            try {
              // Estrai path da URL
              const urlObj = new URL(coverImage);
              const urlPath = urlObj.pathname;
              if (urlPath.includes("wp-content/uploads")) {
                const relativePath = urlPath.replace(/^\/wp-content\/uploads\//, "");
                const localPath = `wp/uploads/${relativePath}`;
                coverImage = await downloadToPublic(coverImage, localPath);
              }
            } catch {
              // fallback remoto
            }
          }
        } else {
          // Se è da DB, thumbData è l'ID attachment
          const thumbId = thumbData;
          const fileRel = attachedFileMap.get(thumbId);
          if (fileRel) {
            const remoteUrl = `${WP_UPLOADS_BASE}/${String(fileRel).replace(/^\/+/, "")}`;
            coverAlt = he.decode(String(attachmentAltMap.get(thumbId) || title)).trim();

            if (MIRROR_MEDIA) {
              const localPath = `wp/uploads/${String(fileRel).replace(/^\/+/, "")}`;
              try {
                coverImage = await downloadToPublic(remoteUrl, localPath);
              } catch {
                coverImage = remoteUrl;
              }
            } else {
              coverImage = remoteUrl;
            }
          }
        }
      }

      const wpSiteUrl = env("WP_SITE_URL") || env("PUBLIC_WP_BASE_URL") || env("PUBLIC_WP_HOST") || "";
      const canonical = wpSiteUrl ? `${wpSiteUrl.replace(/\/$/, "")}/${slug}/` : `/${slug}/`;

      const frontmatter = [
        `---`,
        `title: "${yamlEscape(title)}"`,
        `description: "${yamlEscape(excerpt)}"`,
        `slug: "${yamlEscape(slug)}"`,
        `publishDate: "${publishDate.toISOString()}"`,
        `updatedDate: "${updatedDate.toISOString()}"`,
        `author: "${yamlEscape(author)}"`,
        `draft: false`,
        primaryCategory ? `category: "${yamlEscape(primaryCategory)}"` : `category: ""`,
        `tags: [${tags.map((t) => `"${yamlEscape(t)}"`).join(", ")}]`,
        coverImage ? `coverImage: "${yamlEscape(coverImage)}"` : `coverImage: ""`,
        coverAlt ? `coverAlt: "${yamlEscape(coverAlt)}"` : `coverAlt: ""`,
        `canonical: "${yamlEscape(canonical)}"`,
        `---`,
        ``,
      ].join("\n");

      // MDX: teniamo HTML puro (funziona benissimo in MDX)
      // Piccola pulizia: elimina i marker Gutenberg commentati
      const body = contentHtml
        .replace(/<!--\s*wp:[\s\S]*?-->/g, "")  // rimuove commenti wp:...
        .trim();

      const mdx = `${frontmatter}${body}\n`;

      const filename = `${toSafeFilename(slug)}.mdx`;
      const outPath = path.join(OUT_DIR, filename);

      const changed = await writeFileIfChanged(outPath, mdx);
      if (changed) written++;
    } catch (err) {
      console.error(`[migrate] Errore processando post ${post.ID}:`, err.message);
      errors++;
    }
  }

  // Summary finale
  console.log(`\n[migrate] ✓ Completato:`);
  console.log(`  Posts fetched: ${postList.length}`);
  console.log(`  Files written: ${written}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Images mirrored: ${MIRROR_MEDIA ? "ON" : "OFF"}`);
  console.log(`  Output: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
