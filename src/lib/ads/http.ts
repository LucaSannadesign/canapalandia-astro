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

export type JsonBody = { ok: true; value: unknown } | { ok: false; error: "too_large" | "invalid" };

/**
 * Legge il body come JSON con un limite EFFETTIVO di byte: il flusso viene letto a pezzi e interrotto
 * (reader.cancel) appena supera `maxBytes`, anche senza Content-Length o con un valore falso.
 * UTF-8 non valido o JSON malformato → "invalid".
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBody> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    return { ok: false, error: /^\d+$/.test(declared) ? "too_large" : "invalid" };
  }
  if (!request.body) return { ok: false, error: "invalid" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("body oltre il limite").catch(() => {});
        return { ok: false, error: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (total === 0) return { ok: false, error: "invalid" };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

/** Risposta standard per un body rifiutato. */
export const bodyError = (error: "too_large" | "invalid") =>
  error === "too_large" ? json({ error: "payload_too_large" }, 413) : json({ error: "invalid_body" }, 400);

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
