/**
 * API endpoint ping per verificare che le reactions API siano raggiungibili
 * 
 * Route: /api/reactions/ping.json
 */

import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({ ok: true, route: "/api/reactions/ping.json" }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex,nofollow",
      },
    }
  );
};
