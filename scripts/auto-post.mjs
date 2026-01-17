import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const CAL_PATH = path.join(ROOT, "calendar", "posts.json");
const OUT_DIR = path.join(ROOT, "src", "content", "blog");
const IMAGES_DIR = path.join(ROOT, "public", "images");

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
  return fmt.format(new Date()); // YYYY-MM-DD
}

function romeMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const h = Number(parts.find(p => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find(p => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

// Finestra editoriale: 10:30–11:00 Europe/Rome
function inRomeWindow() {
  const t = romeMinutes();
  return t >= (10 * 60 + 30) && t <= (11 * 60);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadCalendar() {
  if (!fs.existsSync(CAL_PATH)) throw new Error(`Missing ${CAL_PATH}`);
  const raw = fs.readFileSync(CAL_PATH, "utf8");
  const posts = JSON.parse(raw);
  if (!Array.isArray(posts)) throw new Error("calendar/posts.json must be an array");
  return posts;
}

function fmEsc(s) {
  return String(s ?? "").replace(/"/g, '\\"');
}

function renderFrontmatter(post) {
  const tags = Array.isArray(post.tags) ? post.tags.slice(0, 3) : [];
  // Forza image path usando slug: /images/<slug>.webp
  const image = `/images/${fmEsc(post.slug)}.webp`;

  // Assicura publishDate come stringa ISO tra virgolette (es. "2026-01-17")
  const publishDateStr = `"${String(post.publishDate || "")}"`;

  return (
    `---\n` +
    `title: "${fmEsc(post.title)}"\n` +
    `description: "${fmEsc(post.description)}"\n` +
    `slug: "${fmEsc(post.slug)}"\n` +
    `publishDate: ${publishDateStr}\n` +
    `author: "Canapalandia"\n` +
    `category: "${fmEsc(post.category || "Blog")}"\n` +
    `tags: ${JSON.stringify(tags)}\n` +
    `image: "${fmEsc(image)}"\n` +
    `---\n\n`
  );
}

const INSTRUCTIONS = `
Scrivi in italiano. Sei un giornalista divulgativo + copywriter SEO per un blog italiano sulla cannabis (Canapalandia).
Tono: ironico e antiproibizionista, ma sempre responsabile e rispettoso delle leggi.

Vincoli assoluti:
- Non includere MAI istruzioni operative per violare la legge o “come fare” illegale.
- Non suggerire aggiramenti/workaround per eludere controlli.
- Se un punto è incerto: dichiaralo “zona grigia” e usa formule prudenti (“in linea generale”, “può variare”, “da verificare”).
- Evita citazioni di norme/commi specifici se non sei certo: non inventare.

Formato:
- Produci SOLO il corpo in MDX (senza frontmatter, senza backticks).
- Headings H2/H3 senza numerazioni.
- FAQ obbligatoria con <details><summary>…</summary><p>…</p></details>.
- CTA finale obbligatoria: sezione “Ribaltatore” + rimando testuale a “Archivio frasi” (senza URL).
`.trim();

function buildUserPrompt(post) {
  const tags = Array.isArray(post.tags) ? post.tags.join(", ") : "";
  return `
Titolo: ${post.title}
Slug: ${post.slug}
Data: ${post.publishDate}
Categoria: ${post.category || "Blog"}
Tag: ${tags}

Obiettivo:
Scrivi un articolo “pilastro” aggiornato al 2026 che chiarisca cosa è legale e cosa no in Italia su:
- canapa industriale
- cannabis light
- CBD (oli, cosmetici, infiorescenze, alimenti dove pertinente)
Aggiungi un quadro sintetico UE/mondo (4–6 esempi max), senza diventare enciclopedia.
Deve essere utile, leggibile e costruire fiducia.

Struttura obbligatoria (H2/H3, senza numerazioni):
- Apertura forte (2–4 paragrafi): hook ironico + promessa di chiarezza.
- “Definizioni rapide” (canapa industriale / cannabis light / CBD / THC).
- “Cosa è generalmente consentito vs cosa è rischioso/contestato”
  - H3: “Più solido”, “Zone grigie”, “Più rischioso”
- “Controlli, sequestri, interpretazioni”
- “Italia vs resto del mondo” (4–6 esempi max)
- “FAQ” (6–10) in formato:
  <details>
    <summary><strong>Domanda…</strong></summary>
    <p>Risposta breve…</p>
  </details>
- “Conclusione” (riassunto + invito alla responsabilità)
- “Ribaltatore” (CTA + rimando a “Archivio frasi”, senza URL)

Internal linking (obbligatorio):
Inserisci 3 suggerimenti (anchor text + punto del testo) verso:
- “Decreto Sicurezza 2025” (se non esiste: “articolo sulla normativa italiana”)
- “Ricerca universitaria in Italia” (se non esiste: “articolo su ricerca e università”)
- “Partner” (se non esiste: “pagina partner / collaborazioni”)

Nota legale:
Evita dettagli normativi specifici se non verificabili. Se incerto: “da verificare”.
`.trim();
}

function ensureCta(body) {
  const hasRibaltatore = /##\s+Ribaltatore/i.test(body);
  const hasArchivio = /Archivio frasi/i.test(body);
  if (hasRibaltatore && hasArchivio) return body.trim() + "\n";
  // fallback ultra-minimo
  return body.trim() + `

## Ribaltatore

Vuoi una frase antiproibizionista pronta da condividere?

Usa il **Ribaltatore** qui sotto: una dose di ironia, zero inviti a violare la legge.  
Per leggere le migliori uscite della community, cerca l’**Archivio frasi**.
`.trim() + "\n";
}

async function generateBodyWithOpenAI(post) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const model = process.env.OPENAI_MODEL_DEFAULT || "gpt-5-mini";
  const maxOut = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || "7000");

  // Responses API: POST /v1/responses :contentReference[oaicite:2]{index=2}
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: INSTRUCTIONS,
      input: buildUserPrompt(post),
      max_output_tokens: maxOut,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);

  const data = await res.json();

  // Estrazione testo dall'array output (messages -> content -> output_text) :contentReference[oaicite:3]{index=3}
  const chunks = [];
  for (const item of data.output || []) {
    if (item?.type === "message" && item?.role === "assistant") {
      for (const c of item.content || []) {
        if (c?.type === "output_text" && typeof c.text === "string") chunks.push(c.text);
      }
    }
  }

  const body = chunks.join("\n").trim();
  if (!body) throw new Error("Empty model output");
  return ensureCta(body);
}

// Estrae estratto testuale dal body MDX (primi 700-900 caratteri, senza markdown pesante)
function extractBodyExcerpt(body) {
  // Rimuove markdown pesante: heading markers, code blocks, links complessi
  let cleaned = String(body)
    .replace(/^#{1,6}\s+/gm, "") // Rimuove heading markers
    .replace(/```[\s\S]*?```/g, "") // Rimuove code blocks
    .replace(/`[^`]+`/g, "") // Rimuove inline code
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // Semplifica link a solo testo
    .replace(/^\s*[-*+]\s+/gm, "") // Rimuove bullet markers
    .replace(/\n{3,}/g, "\n\n") // Normalizza newline multiple
    .trim();

  // Prende primi ~800 caratteri, fermandosi a fine parola/frase
  const maxLen = 800;
  if (cleaned.length <= maxLen) return cleaned;
  
  const excerpt = cleaned.slice(0, maxLen);
  const lastSpace = excerpt.lastIndexOf(" ");
  const lastPeriod = excerpt.lastIndexOf(".");
  const lastBreak = Math.max(lastSpace, lastPeriod);
  
  return lastBreak > maxLen * 0.7 ? excerpt.slice(0, lastBreak + 1) : excerpt + "...";
}

// Genera cover image usando OpenAI Images API
async function generateCoverImage(post, body) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[auto-post] OPENAI_API_KEY missing, skipping cover generation");
    return;
  }

  ensureDir(IMAGES_DIR);

  const imagePath = path.join(IMAGES_DIR, `${post.slug}.webp`);

  // Verifica se esiste già e ha size > 0
  if (fs.existsSync(imagePath)) {
    const stats = fs.statSync(imagePath);
    if (stats.size > 0) {
      console.log(`[auto-post] SKIP cover (exists): ${path.relative(ROOT, imagePath)} (${stats.size} bytes)`);
      return;
    }
    // Se è 0 byte, rimuovilo e rigenera
    fs.unlinkSync(imagePath);
    console.log(`[auto-post] Removing zero-byte cover, regenerating...`);
  }

  // Estrai estratto dal body per contesto
  const bodyExcerpt = extractBodyExcerpt(body);
  const tags = Array.isArray(post.tags) ? post.tags.join(", ") : "";
  const category = post.category || "Blog";

  // Prompt "art-directed" per cover editoriale
  const prompt = `Editorial magazine cover illustration. Style: refined, sophisticated, editorial illustration or soft 3D rendering, not a giant leaf. Visual metaphor for "legal/bureaucracy" theme: stamps, folders, balance scales, institutional frames, with discrete botanical accents (subtle hemp leaf motifs). Color palette: dark green (#0a2915, #1a4a2d) + cream/soft gold (#f4e8d1, #e8d5b7). Atmosphere: serious but not gloomy, professional, informative. Clean composition, central subject, ample negative space. NO text in the image, NO words or letters. Subject matter: legal documents, official stamps, balance scales, Italian institutional elements, subtle hemp/cannabis botanical references. Title context: "${post.title}". Description: "${post.description}". Category: ${category}. Tags: ${tags}. Content excerpt: "${bodyExcerpt.substring(0, 400)}".`;

  try {
    // OpenAI Images API: DALL-E 3
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1792x1024", // 16:9 landscape (DALL-E 3 supporta: 1024x1024, 1792x1024, 1024x1792)
        quality: "hd", // "standard" o "hd"
        response_format: "url", // Restituisce URL, non b64_json
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.warn(`[auto-post] OpenAI Images API error ${res.status}: ${errorText}`);
      return;
    }

    const data = await res.json();
    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
      console.warn("[auto-post] No image URL in OpenAI response");
      return;
    }

    // Download immagine
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      console.warn(`[auto-post] Failed to download image: ${imageRes.status}`);
      return;
    }

    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

    // Converti e salva come WebP con sharp (output_compression ~85-92)
    await sharp(imageBuffer)
      .resize(1600, 900, { fit: "cover", position: "center" }) // 16:9 ratio
      .webp({ quality: 88 }) // Compression ~85-92
      .toFile(imagePath);

    const finalStats = fs.statSync(imagePath);
    console.log(`[auto-post] GENERATED IMAGE: ${path.relative(ROOT, imagePath)} (bytes: ${finalStats.size})`);
  } catch (error) {
    console.warn(`[auto-post] Cover generation failed: ${error.message}`);
    // Non bloccare il processo se la cover fallisce
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const forcedDate = arg("--date"); // YYYY-MM-DD

  if (!force && !inRomeWindow()) {
    console.log("[auto-post] Outside Rome window 10:30–11:00. Skipping.");
    return;
  }

  ensureDir(OUT_DIR);

  const today = forcedDate || romeDateISO();
  const posts = loadCalendar();
  const due = posts.filter(p => String(p.publishDate) === today);

  if (!due.length) {
    console.log(`[auto-post] No posts due for ${today}.`);
    return;
  }

  for (const post of due) {
    const outFile = path.join(OUT_DIR, `${post.slug}.mdx`);
    if (fs.existsSync(outFile)) {
      console.log(`[auto-post] SKIP (exists): ${path.relative(ROOT, outFile)}`);
      continue;
    }

    const frontmatter = renderFrontmatter(post);
    const body = await generateBodyWithOpenAI(post);
    const mdx = frontmatter + body + "\n";

    if (dryRun) {
      console.log(`\n[auto-post] DRY RUN would write: ${path.relative(ROOT, outFile)}\n`);
      console.log(mdx.slice(0, 900) + "\n…\n");
      // In dry-run non generiamo la cover
    } else {
      fs.writeFileSync(outFile, mdx, "utf8");
      console.log(`[auto-post] WROTE: ${path.relative(ROOT, outFile)}`);
      
      // Genera cover image dopo aver scritto il body (per avere estratto)
      await generateCoverImage(post, body);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
