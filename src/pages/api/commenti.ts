import type { APIRoute } from "astro";
import { WP_API_BASE } from "@/lib/consts";
import { fetchWpJson } from "@/lib/wpFetch";

// Basic anti-spam: honeypot + rate limit in-memory (ok in dev; su serverless è best-effort)
const RATE_WINDOW_MS = 60_000; // 1 min
const RATE_MAX = 6;
const bucket = new Map<string, { ts: number; count: number }>();

function rateLimit(ip: string) {
  const now = Date.now();
  const entry = bucket.get(ip);
  if (!entry || now - entry.ts > RATE_WINDOW_MS) {
    bucket.set(ip, { ts: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count += 1;
  return true;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress || "unknown";
  if (!rateLimit(ip)) {
    return new Response(JSON.stringify({ ok: false, error: "Troppe richieste, riprova tra poco." }), { status: 429 });
  }

  const form = await request.formData();
  const postId = Number(form.get("postId"));
  const author_name = String(form.get("name") || "").trim();
  const author_email = String(form.get("email") || "").trim();
  const content = String(form.get("content") || "").trim();

  // honeypot
  const hp = String(form.get("website") || "").trim();
  if (hp) return new Response(JSON.stringify({ ok: true }), { status: 200 });

  if (!postId || !author_name || !author_email || !content) {
    return new Response(JSON.stringify({ ok: false, error: "Dati mancanti." }), { status: 400 });
  }

  // Usa helper resiliente per fetch a WordPress
  const url = `${WP_API_BASE.replace(/\/$/, "")}/comments`;

  const result = await fetchWpJson(url, {
    method: "POST",
    body: JSON.stringify({ post: postId, author_name, author_email, content }),
  });

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: result.error || "Invio fallito. WordPress API non disponibile.",
      }),
      { status: 400 }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Commento inviato. Se la moderazione è attiva, verrà pubblicato dopo approvazione.",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};