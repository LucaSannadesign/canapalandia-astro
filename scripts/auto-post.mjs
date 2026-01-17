import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CAL_PATH = path.join(ROOT, "calendar", "posts.json");
const OUT_DIR = path.join(ROOT, "src", "content", "blog");

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
  const image = post.image || "/images/cover-default.webp";

  return (
    `---\n` +
    `title: "${fmEsc(post.title)}"\n` +
    `description: "${fmEsc(post.description)}"\n` +
    `slug: "${fmEsc(post.slug)}"\n` +
    `publishDate: ${post.publishDate}\n` +
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
    } else {
      fs.writeFileSync(outFile, mdx, "utf8");
      console.log(`[auto-post] WROTE: ${path.relative(ROOT, outFile)}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
