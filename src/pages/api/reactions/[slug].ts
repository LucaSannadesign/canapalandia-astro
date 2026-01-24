/**
 * API endpoint per reazioni post blog
 * 
 * GET: ritorna i contatori delle reazioni per un post
 * POST: incrementa una reazione (atomico via RPC)
 * 
 * Route: /api/reactions/[slug]
 */

import type { APIRoute } from "astro";
import { getSupabaseServer } from "@/lib/supabaseServer";

// API route must be server-side
export const prerender = false;

// Valori reazioni consentiti (coerenti con DB)
const VALID_REACTIONS = ["up", "love", "laugh", "fire"] as const;
type ValidReaction = typeof VALID_REACTIONS[number];

/**
 * Normalizza il valore della reazione:
 * - trim + lowercase
 * - mappa "likes" -> "up"
 * - mappa "like" -> "up"
 */
function normalizeReaction(input: string): string | null {
  const normalized = input.trim().toLowerCase();
  
  // Mappa alias comuni
  if (normalized === "likes" || normalized === "like") {
    return "up";
  }
  
  // Verifica se è un valore valido
  if (VALID_REACTIONS.includes(normalized as ValidReaction)) {
    return normalized;
  }
  
  return null;
}

// Logging solo in dev
const isDev = import.meta.env.DEV;
function log(...args: unknown[]) {
  if (isDev) {
    console.log("[reactions]", ...args);
  }
}

function logError(...args: unknown[]) {
  if (isDev) {
    console.error("[reactions]", ...args);
  }
}

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  
  log(`GET /api/reactions/${slug}`);
  
  if (!slug || typeof slug !== "string") {
    logError("GET: Slug mancante o non valido", { slug, params });
    return new Response(
      JSON.stringify({ error: "Slug mancante" }),
      { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const supabase = getSupabaseServer();
    
    const { data, error } = await supabase
      .from("post_reactions")
      .select("slug, up, love, laugh, fire, updated_at")
      .eq("slug", slug)
      .single();

    if (error && error.code !== "PGRST116") { // PGRST116 = no rows returned
      logError("GET: Error fetching from Supabase:", error);
      return new Response(
        JSON.stringify({ error: "Errore nel recupero reazioni" }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Se non esiste, ritorna contatori a zero
    const counts = data || {
      slug,
      up: 0,
      love: 0,
      laugh: 0,
      fire: 0,
      updated_at: null,
    };

    return new Response(
      JSON.stringify({
        slug: counts.slug,
        up: counts.up || 0,
        love: counts.love || 0,
        laugh: counts.laugh || 0,
        fire: counts.fire || 0,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err) {
    logError("GET: Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Errore interno", details: err instanceof Error ? err.message : String(err) }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  
  log(`POST /api/reactions/${slug}`);
  
  if (!slug || typeof slug !== "string") {
    logError("POST: Slug mancante o non valido", { slug, params });
    return new Response(
      JSON.stringify({ error: "Slug mancante" }),
      { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const body = await request.json();
    const { reaction: rawReaction } = body;

    if (!rawReaction || typeof rawReaction !== "string") {
      logError("POST: Reazione mancante o non valida", { reaction: rawReaction, slug });
      return new Response(
        JSON.stringify({ error: "Reazione mancante", received: rawReaction }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Normalizza reazione
    const reaction = normalizeReaction(rawReaction);
    
    if (!reaction) {
      logError("POST: Reazione non valida", { 
        received: rawReaction, 
        slug,
        validReactions: VALID_REACTIONS 
      });
      return new Response(
        JSON.stringify({ 
          error: "Reazione non valida", 
          received: rawReaction,
          validReactions: VALID_REACTIONS 
        }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    log(`POST: reaction="${reaction}" (normalized from "${rawReaction}") for slug="${slug}"`);

    const supabase = getSupabaseServer();

    // Chiama funzione RPC per incremento atomico
    const { data, error } = await supabase.rpc("increment_post_reaction", {
      p_slug: slug,
      p_reaction: reaction,
    });

    if (error) {
      logError("POST: RPC error:", error);
      return new Response(
        JSON.stringify({ error: "Errore nell'incremento reazione", details: error.message }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (!data || data.length === 0) {
      logError("POST: Nessun dato ritornato da RPC", { slug, reaction });
      return new Response(
        JSON.stringify({ error: "Nessun dato ritornato" }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const result = data[0];

    return new Response(
      JSON.stringify({
        slug: result.slug,
        up: result.up || 0,
        love: result.love || 0,
        laugh: result.laugh || 0,
        fire: result.fire || 0,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err) {
    logError("POST: Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Errore interno", details: err instanceof Error ? err.message : String(err) }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};

// Support OPTIONS for CORS if needed
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
