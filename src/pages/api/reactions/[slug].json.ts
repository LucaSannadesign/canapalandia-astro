/**
 * API endpoint per reazioni post blog
 * 
 * GET: ritorna i contatori delle reazioni per un post
 * POST: incrementa una reazione (atomico via RPC)
 */

import type { APIRoute } from "astro";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  
  if (!slug || typeof slug !== "string") {
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
      console.error("[reactions] Error fetching:", error);
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
    console.error("[reactions] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Errore interno" }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  
  if (!slug || typeof slug !== "string") {
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

    // Valida reazione
    if (!reaction || !["up", "love", "laugh", "fire"].includes(reaction)) {
      return new Response(
        JSON.stringify({ error: "Reazione non valida" }),
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
      console.error("[reactions] RPC error:", error);
      return new Response(
        JSON.stringify({ error: "Errore nell'incremento reazione" }),
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
    console.error("[reactions] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Errore interno" }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};
