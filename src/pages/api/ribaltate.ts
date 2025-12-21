import type { APIRoute } from "astro";
import fs from "node:fs/promises";

const STORE_PATH = process.env.RIBALTATORE_STORE_PATH || "/tmp/canapalandia-ribaltate.json";

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const GET: APIRoute = async () => {
  const items = await readStore();
  return new Response(JSON.stringify({ items: items.slice(0, 60) }), {
    headers: { "content-type": "application/json" },
  });
};