import type { APIRoute } from "astro";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PAGEVIEWS_FILE = join(process.cwd(), "data", "pageviews.json");

interface PageviewsData {
  [slug: string]: number;
}

async function readPageviews(): Promise<PageviewsData> {
  try {
    const content = await readFile(PAGEVIEWS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    // Se il file non esiste, ritorna oggetto vuoto
    return {};
  }
}

async function writePageviews(data: PageviewsData): Promise<void> {
  try {
    await writeFile(PAGEVIEWS_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[pageviews] Errore scrittura file:", err);
  }
}

// GET: legge il numero di visite per uno slug
export const GET: APIRoute = async ({ params }) => {
  const slug = String(params.slug ?? "").trim();
  if (!slug) {
    return new Response(JSON.stringify({ error: "Slug mancante" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const data = await readPageviews();
    const views = data[slug] || 0;
    return new Response(JSON.stringify({ slug, views }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60", // Cache 1 minuto
      },
    });
  } catch (err) {
    console.error("[pageviews] Errore lettura:", err);
    return new Response(JSON.stringify({ error: "Errore server" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// POST: incrementa il contatore (chiamato in modo asincrono dal client)
export const POST: APIRoute = async ({ params, request, clientAddress }) => {
  const slug = String(params.slug ?? "").trim();
  if (!slug) {
    return new Response(JSON.stringify({ error: "Slug mancante" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Basic rate limiting: max 1 incremento per IP ogni 10 secondi
  const rateKey = `${clientAddress}:${slug}`;
  const rateMap = new Map<string, number>();
  const now = Date.now();
  const lastIncrement = rateMap.get(rateKey) || 0;
  
  if (now - lastIncrement < 10000) {
    // Troppo presto, ritorna il conteggio attuale senza incrementare
    try {
      const data = await readPageviews();
      const views = data[slug] || 0;
      return new Response(JSON.stringify({ slug, views }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Errore server" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  rateMap.set(rateKey, now);

  try {
    const data = await readPageviews();
    data[slug] = (data[slug] || 0) + 1;
    await writePageviews(data);
    
    return new Response(JSON.stringify({ slug, views: data[slug] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[pageviews] Errore incremento:", err);
    return new Response(JSON.stringify({ error: "Errore server" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
