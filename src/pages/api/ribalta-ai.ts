import type { APIRoute } from "astro";
import fs from "node:fs/promises";
import crypto from "node:crypto";

const STORE_PATH = process.env.RIBALTATORE_STORE_PATH || "/tmp/canapalandia-ribaltate.json";
const MAX_STORE_ITEMS = 120;

function extractClientIp(request: Request) {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "";
  const xr = request.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "";
}

function hashIp(ip: string) {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex");
}

function getRateMap() {
  const g = globalThis as any;
  if (!g.__rib_rate) g.__rib_rate = new Map<string, number>();
  return g.__rib_rate as Map<string, number>;
}

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStore(items: any[]) {
  try {
    await fs.writeFile(STORE_PATH, JSON.stringify(items.slice(0, MAX_STORE_ITEMS), null, 2), "utf-8");
  } catch {
    // su serverless può essere volatile/limitato: ignoriamo l'errore
  }
}

async function callOpenAI(frase: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false as const, error: "OPENAI_API_KEY non configurata." };

  const model = process.env.OPENAI_MODEL || "gpt-5";
  const instructions = [
    "Sei Il Ribaltatore AI di Canapalandia.",
    "Ribalta slogan proibizionisti sulla cannabis con ironia e satira (tono antiproibizionista).",
    "Nessuna incitazione a violare leggi. Niente odio o insulti verso gruppi protetti.",
    "Massimo 2-4 frasi. Punchline finale.",
    "Scrivi in italiano naturale.",
  ].join("\n");

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input: frase,
      max_output_tokens: 220,
    }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return { ok: false as const, error: `Errore OpenAI (${r.status}). ${t}`.slice(0, 380) };
  }

  const data: any = await r.json();
  const outText =
    (typeof data?.output_text === "string" && data.output_text) ||
    (() => {
      const parts: string[] = [];
      for (const item of data?.output || []) {
        for (const c of item?.content || []) {
          if (c?.type === "output_text" && typeof c?.text === "string") parts.push(c.text);
        }
      }
      return parts.join("\n");
    })();

  const ribaltata = String(outText || "").trim();
  if (!ribaltata) return { ok: false as const, error: "Risposta vuota." };
  return { ok: true as const, ribaltata };
}

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();

  const trap = String(form.get("email_trap") ?? "");
  if (trap.trim()) {
    return new Response(JSON.stringify({ ribaltata: "❌ Spam rilevato." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const frase = String(form.get("frase") ?? "").replace(/\s+/g, " ").trim();
  if (!frase || frase.length < 6 || frase.length > 420) {
    return new Response(JSON.stringify({ ribaltata: "❌ Frase non valida." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const ip = extractClientIp(request);
  const key = ip || "local";
  const rate = getRateMap();
  const now = Date.now();
  const last = rate.get(key) || 0;
  if (now - last < 2500) {
    return new Response(JSON.stringify({ ribaltata: "⏳ Troppo veloce: riprova tra un attimo." }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  }
  rate.set(key, now);

  const ai = await callOpenAI(frase);
  if (!ai.ok) {
    return new Response(JSON.stringify({ ribaltata: `❌ ${ai.error}` }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const items = await readStore();
  const record = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2),
    created_at: new Date().toISOString(),
    input: frase,
    output: ai.ribaltata,
    ip_hash: hashIp(ip),
  };

  items.unshift(record);
  await writeStore(items);

  return new Response(JSON.stringify({ ribaltata: record.output, item: record }), {
    headers: { "content-type": "application/json" },
  });
};