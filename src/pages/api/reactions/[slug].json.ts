/**
 * API endpoint per reazioni post blog
 * 
 * GET: ritorna i contatori delle reazioni per un post
 * POST: incrementa una reazione (atomico via RPC)
 * 
 * Route: /api/reactions/[slug].json
 */

import type { APIRoute } from "astro";
import { getSupabaseServer } from "@/lib/supabaseServer";

// API route must be server-side
export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  
  console.log(`[reactions] GET /api/reactions/${slug}.json`);
  
  if (!slug || typeof slug !== "string") {
    console.error("[reactions] GET: Slug mancante o non valido", { slug, params });
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
      console.error("[reactions] GET: Error fetching from Supabase:", error);
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
    console.error("[reactions] GET: Unexpected error:", err);
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
  
  console.log(`[reactions] POST /api/reactions/${slug}.json`);
  
  if (!slug || typeof slug !== "string") {
    console.error("[reactions] POST: Slug mancante o non valido", { slug, params });
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
    const { reaction } = body;

    console.log(`[reactions] POST: reaction="${reaction}" for slug="${slug}"`);

    // Valida reazione
    if (!reaction || !["up", "love", "laugh", "fire"].includes(reaction)) {
      console.error("[reactions] POST: Reazione non valida", { reaction, slug });
      return new Response(
        JSON.stringify({ error: "Reazione non valida", received: reaction }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const supabase = getSupabaseServer();

    // Chiama funzione RPC per incremento atomico
    const { data, error } = await supabase.rpc("increment_post_reaction", {
      p_slug: slug,
      p_reaction: reaction,
    });

    if (error) {
      console.error("[reactions] POST: RPC error:", error);
      return new Response(
        JSON.stringify({ error: "Errore nell'incremento reazione", details: error.message }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (!data || data.length === 0) {
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
    console.error("[reactions] POST: Unexpected error:", err);
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
