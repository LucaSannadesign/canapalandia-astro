/**
 * Tracciamento pubblicitario first-party, senza cookie né storage nel browser.
 *
 * - Impressione = box visibile almeno al 50% per almeno 1 secondo continuo con la scheda in primo piano
 *   (vedi clientScript.ts). Senza JavaScript non viene registrata: è un minimo verificabile.
 * - Ogni annuncio servito porta un TOKEN DI VISUALIZZAZIONE firmato dal server (HMAC), legato a
 *   posizionamento, momento del rendering e lettore (IP + user-agent). Il beacon di impressione è
 *   accettato solo con un token valido, non più giovane di 1 s e non più vecchio di 30 min:
 *   un evento non può essere fabbricato senza aver prima ricevuto la pagina dallo stesso client.
 * - Clic = passaggio dall'endpoint di redirect del server. Senza token valido il lettore viene comunque
 *   reindirizzato, ma il clic è registrato come non verificato (non idoneo).
 * - Ogni evento accettato è registrato; è "idoneo" solo se non è bot/prefetch, non è ripetuto ed è verificato.
 * - visitor_hash = HMAC-SHA256(secret, giorno|IP|user-agent) troncato: non reversibile, non collegabile
 *   tra giorni diversi; serve solo alla deduplica e viene rimosso dopo 2 giorni (ads_purge_events).
 * - Clic unici: NON misurati (un hash giornaliero non è una metodologia affidabile di unicità).
 *
 * Cosa il server NON può verificare: che un essere umano abbia davvero guardato il box, che la
 * visibilità riportata dal browser sia autentica (un client che esegue il JavaScript, anche headless,
 * può simularla), il traffico da proxy/IP residenziali diversi, i blocchi pubblicitari.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { AdEventType } from "./types";

/** Finestra entro cui un evento identico dello stesso visitatore è considerato ripetuto. */
export const DEDUP_WINDOW_MS: Readonly<Record<AdEventType, number>> = {
  impression: 30 * 60 * 1000,
  click: 10 * 60 * 1000,
};

/** Limite di eventi per IP e minuto oltre il quale l'endpoint risponde 429 senza registrare. */
export const EVENT_RATE_LIMIT = { max: 60, windowMs: 60_000 } as const;

/** Età ammessa del token: il beacon non può precedere il secondo di visibilità né arrivare troppo tardi. */
export const VIEW_TOKEN_AGE: Readonly<Record<AdEventType, { minMs: number; maxMs: number }>> = {
  impression: { minMs: 1000, maxMs: 30 * 60 * 1000 },
  click: { minMs: 0, maxMs: 4 * 60 * 60 * 1000 },
};

const TOKEN_RE = /^(\d{13})\.([a-f0-9]{32})$/;
/** Tolleranza per orologi di istanze serverless diverse. */
const CLOCK_SKEW_MS = 5_000;

const BOT_UA =
  /bot|crawl|spider|slurp|scrape|fetch|preview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|httpclient|okhttp|java\/|go-http|axios|node-fetch|undici|facebookexternalhit|whatsapp|telegram|discord|skype|embedly|quora link|vercel/i;

export interface RequestSignals {
  userAgent: string | null;
  /** Header Sec-Purpose / Purpose / X-Purpose (prefetch e prerender del browser). */
  purpose: string | null;
  /** Sec-Fetch-Site inviato dai browser moderni (same-origin per il beacon del sito). */
  fetchSite: string | null;
}

export function readSignals(request: Request): RequestSignals {
  const h = request.headers;
  return {
    userAgent: h.get("user-agent"),
    purpose: h.get("sec-purpose") ?? h.get("purpose") ?? h.get("x-purpose") ?? h.get("x-moz"),
    fetchSite: h.get("sec-fetch-site"),
  };
}

/** Restituisce il motivo del filtro, o null se il traffico sembra umano. */
export function automatedTrafficReason(signals: Pick<RequestSignals, "userAgent" | "purpose">): string | null {
  const ua = (signals.userAgent ?? "").trim();
  if (!ua) return "user-agent assente";
  if (ua.length < 20) return "user-agent anomalo";
  if (BOT_UA.test(ua)) return "user-agent automatizzato";
  if (signals.purpose && /prefetch|prerender|preview/i.test(signals.purpose)) return "prefetch/prerender";
  return null;
}

export function visitorHash(secret: string, day: string, ip: string, userAgent: string | null): string {
  return createHmac("sha256", secret)
    .update(`${day}|${ip || "unknown"}|${userAgent ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

/** Legame token ↔ lettore indipendente dal giorno (un token emesso alle 23:59 resta valido dopo mezzanotte). */
function viewerBinding(secret: string, ip: string, userAgent: string | null): string {
  return createHmac("sha256", secret).update(`bind|${ip || "unknown"}|${userAgent ?? ""}`).digest("hex");
}

function tokenMac(secret: string, placementId: string, binding: string, issuedMs: string): string {
  return createHmac("sha256", secret).update(`view|${placementId}|${binding}|${issuedMs}`).digest("hex").slice(0, 32);
}

export interface Viewer {
  ip: string;
  userAgent: string | null;
}

export function issueViewToken(secret: string, placementId: string, viewer: Viewer, now: Date): string {
  // Istante di emissione al millisecondo: il tempo minimo di visibilità si verifica senza arrotondamenti.
  const issuedMs = String(now.getTime()).padStart(13, "0");
  return `${issuedMs}.${tokenMac(secret, placementId, viewerBinding(secret, viewer.ip, viewer.userAgent), issuedMs)}`;
}

export type TokenCheck = { ok: true } | { ok: false; reason: string };

export function verifyViewToken(
  secret: string,
  token: unknown,
  placementId: string,
  viewer: Viewer,
  now: Date,
  type: AdEventType,
): TokenCheck {
  if (typeof token !== "string" || token.length === 0) return { ok: false, reason: "token mancante" };
  const m = TOKEN_RE.exec(token);
  if (!m) return { ok: false, reason: "token malformato" };
  const expected = Buffer.from(tokenMac(secret, placementId, viewerBinding(secret, viewer.ip, viewer.userAgent), m[1]));
  const provided = Buffer.from(m[2]);
  if (!timingSafeEqual(expected, provided)) return { ok: false, reason: "token non valido per questo lettore o posizionamento" };
  const ageMs = now.getTime() - Number(m[1]);
  const { minMs, maxMs } = VIEW_TOKEN_AGE[type];
  if (ageMs < -CLOCK_SKEW_MS) return { ok: false, reason: "token emesso nel futuro" };
  if (ageMs < minMs) return { ok: false, reason: "evento prima del tempo minimo di visibilità" };
  if (ageMs > maxMs) return { ok: false, reason: "token scaduto" };
  return { ok: true };
}

export interface EventClassification {
  is_bot: boolean;
  is_duplicate: boolean;
  is_unverified: boolean;
  filter_reason: string | null;
}

export function classifyEvent(input: {
  signals: Pick<RequestSignals, "userAgent" | "purpose">;
  lastSimilarEventAt: string | null;
  type: AdEventType;
  now: Date;
  /** Esito della verifica del token (i clic sono registrati anche senza token valido). */
  token?: TokenCheck;
}): EventClassification {
  const botReason = automatedTrafficReason(input.signals);
  if (botReason) return { is_bot: true, is_duplicate: false, is_unverified: false, filter_reason: botReason };
  if (input.token && !input.token.ok) {
    return { is_bot: false, is_duplicate: false, is_unverified: true, filter_reason: input.token.reason };
  }
  if (input.lastSimilarEventAt) {
    const elapsed = input.now.getTime() - Date.parse(input.lastSimilarEventAt);
    if (elapsed >= 0 && elapsed < DEDUP_WINDOW_MS[input.type]) {
      return { is_bot: false, is_duplicate: true, is_unverified: false, filter_reason: "ripetuto nella finestra di deduplica" };
    }
  }
  return { is_bot: false, is_duplicate: false, is_unverified: false, filter_reason: null };
}
