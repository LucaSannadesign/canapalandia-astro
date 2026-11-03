/** Utility HTTP condivise dagli endpoint pubblicitari: risposte, lettura body limitata, auth admin. */

import { createHash, timingSafeEqual } from "node:crypto";
import { ADS_MIN_SECRET_LENGTH, type AdsEnv } from "./config";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

export function empty(status: number, extra: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...BASE_HEADERS, ...extra } });
}

export const notFound = () => json({ error: "not_found" }, 404);

/** Legge il body come JSON entro un limite di byte; null se assente, troppo grande o non valido. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  const text = await request.text();
  if (!text || new TextEncoder().encode(text).length > maxBytes) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export type AdminAuth = { ok: true } | { ok: false; response: Response };

/**
 * Autorizzazione admin server-side: header `Authorization: Bearer <ADS_ADMIN_TOKEN>`.
 * Senza token configurato (o troppo corto) l'area admin non esiste (404).
 * Confronto a tempo costante su digest SHA-256 di lunghezza fissa.
 */
export function authorizeAdmin(request: Request, env: AdsEnv): AdminAuth {
  const expected = env.ADS_ADMIN_TOKEN ?? "";
  if (expected.length < ADS_MIN_SECRET_LENGTH) return { ok: false, response: notFound() };
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/.exec(header);
  const provided = match?.[1] ?? "";
  const valid = timingSafeEqual(digest(provided), digest(expected)) && provided.length > 0;
  if (!valid) {
    return { ok: false, response: json({ error: "unauthorized" }, 401, { "WWW-Authenticate": 'Bearer realm="ads-admin"' }) };
  }
  return { ok: true };
}
