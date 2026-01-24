/**
 * API endpoint di test per verificare che la struttura reactions funzioni
 * 
 * Route: /api/reactions/test.json
 * 
 * Ritorna un JSON di test per verificare che le API routes siano raggiungibili
 */

import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({ ok: true, route: "/api/reactions/test.json" }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );
};