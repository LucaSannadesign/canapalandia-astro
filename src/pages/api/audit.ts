import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  return new Response(
    JSON.stringify({
      ok: true,
      endpoint: "/api/audit/",
      path: url.pathname,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
};
