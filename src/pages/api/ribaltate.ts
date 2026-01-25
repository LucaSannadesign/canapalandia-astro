import type { APIRoute } from "astro";
import fs from "node:fs/promises";

const STORE_PATH = process.env.RIBALTATORE_STORE_PATH || "/tmp/canapalandia-ribaltate.json";

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // Log solo in dev per evitare spam in produzione
    if (import.meta.env.DEV) {
      console.warn("[ribaltate] Errore lettura store:", err);
    }
    return [];
  }
}

export const GET: APIRoute = async () => {
  try {
    const items = await readStore();
    return new Response(JSON.stringify({ items: items.slice(0, 60) }), {
      status: 200,
      headers: { 
        "content-type": "application/json",
        "cache-control": "public, max-age=60", // Cache 1 minuto
      },
    });
  } catch (err) {
    console.error("[ribaltate] Errore GET:", err);
    // Fallback: ritorna array vuoto invece di 500
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
};