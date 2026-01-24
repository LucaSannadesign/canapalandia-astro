/**
 * API endpoint per reazioni post blog
 * 
 * GET: ritorna i contatori delle reazioni per un post
 * POST: incrementa/decrementa una reazione
 * 
 * Route: /api/reactions/[slug]
 */

import type { APIRoute } from "astro";
import { promises as fs } from "node:fs";
import { join } from "node:path";

// API route must be server-side
export const prerender = false;

// Valori reazioni consentiti
const VALID_REACTION_TYPES = ["like", "heart", "fire", "laugh"] as const;
type ReactionType = typeof VALID_REACTION_TYPES[number];

interface ReactionCounts {
  like: number;
  heart: number;
  fire: number;
  laugh: number;
}

interface ReactionData {
  slug: string;
  counts: ReactionCounts;
  updatedAt: string;
}

/**
 * Sanitizza lo slug per uso come nome file
 */
function sanitizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "_")
    .replace(/_+/g, "_");
}

/**
 * Ottiene il percorso del file per la persistenza
 */
function getReactionsFilePath(slug: string): string {
  const safeSlug = sanitizeSlug(slug);
  return join(process.cwd(), "data", "reactions", `${safeSlug}.json`);
}

/**
 * Legge i contatori da file (solo in DEV)
 */
async function readReactionsFromFile(slug: string): Promise<ReactionCounts | null> {
  if (import.meta.env.PROD) {
    return null;
  }

  try {
    const filePath = getReactionsFilePath(slug);
    const content = await fs.readFile(filePath, "utf-8");
    const data: ReactionData = JSON.parse(content);
    return data.counts;
  } catch (err) {
    // File non esiste o errore di lettura -> ritorna null
    return null;
  }
}

/**
 * Scrive i contatori su file (solo in DEV)
 */
async function writeReactionsToFile(slug: string, counts: ReactionCounts): Promise<boolean> {
  if (import.meta.env.PROD) {
    return false;
  }

  try {
    const filePath = getReactionsFilePath(slug);
    const dirPath = join(process.cwd(), "data", "reactions");
    
    // Crea directory se non esiste
    await fs.mkdir(dirPath, { recursive: true });

    const data: ReactionData = {
      slug,
      counts,
      updatedAt: new Date().toISOString(),
    };

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("[reactions] Error writing to file:", err);
    return false;
  }
}

/**
 * Inizializza contatori a zero
 */
function getInitialCounts(): ReactionCounts {
  return {
    like: 0,
    heart: 0,
    fire: 0,
    laugh: 0,
  };
}

/**
 * Valida e normalizza il delta
 */
function validateDelta(delta: unknown): number | null {
  if (typeof delta !== "number") {
    return null;
  }

  // Range consentito: -10..10 escluso 0
  if (delta >= -10 && delta <= 10 && delta !== 0 && Number.isInteger(delta)) {
    return delta;
  }

  return null;
}

/**
 * Applica delta ai contatori mantenendo minimo 0
 */
function applyDelta(counts: ReactionCounts, type: ReactionType, delta: number): ReactionCounts {
  const newCounts = { ...counts };
  const current = newCounts[type];
  const newValue = Math.max(0, current + delta);
  newCounts[type] = newValue;
  return newCounts;
}

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex,nofollow",
} as const;

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;

  if (!slug || typeof slug !== "string") {
    return new Response(
      JSON.stringify({ ok: false, error: "Slug mancante" }),
      {
        status: 400,
        headers: JSON_HEADERS,
      }
    );
  }

  try {
    // Leggi da file (solo in DEV)
    const counts = await readReactionsFromFile(slug) || getInitialCounts();

    const response: ReactionData = {
      slug,
      counts,
      updatedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err) {
    console.error("[reactions] GET error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Errore interno" }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug;

  if (!slug || typeof slug !== "string") {
    return new Response(
      JSON.stringify({ ok: false, error: "Slug mancante" }),
      {
        status: 400,
        headers: JSON_HEADERS,
      }
    );
  }

  try {
    // Parse JSON body
    let body: { type?: unknown; delta?: unknown };
    try {
      body = await request.json();
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid JSON" }),
        {
          status: 400,
          headers: JSON_HEADERS,
        }
      );
    }

    // Valida type
    const { type, delta: rawDelta } = body;
    if (!type || typeof type !== "string" || !VALID_REACTION_TYPES.includes(type as ReactionType)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid reaction type" }),
        {
          status: 400,
          headers: JSON_HEADERS,
        }
      );
    }

    const reactionType = type as ReactionType;

    // Valida e normalizza delta
    const delta = rawDelta === undefined ? 1 : validateDelta(rawDelta);
    if (delta === null) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid delta" }),
        {
          status: 400,
          headers: JSON_HEADERS,
        }
      );
    }

    // Leggi contatori attuali
    const currentCounts = await readReactionsFromFile(slug) || getInitialCounts();

    // Applica delta
    const newCounts = applyDelta(currentCounts, reactionType, delta);

    // Persisti (solo in DEV)
    const persisted = await writeReactionsToFile(slug, newCounts);

    const responseData: ReactionData = {
      slug,
      counts: newCounts,
      updatedAt: new Date().toISOString(),
    };

    return new Response(
      JSON.stringify({
        ok: true,
        persisted,
        data: responseData,
      }),
      {
        status: 200,
        headers: JSON_HEADERS,
      }
    );
  } catch (err) {
    console.error("[reactions] POST error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Errore interno" }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }
};
