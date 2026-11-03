/**
 * Tracciamento pubblicitario first-party, senza cookie né storage nel browser.
 *
 * - Impressione = box visibile almeno al 50% per almeno 1 secondo (IntersectionObserver lato client).
 *   Senza JavaScript non viene registrata: le impressioni riportate sono un minimo verificabile.
 * - Clic = passaggio dall'endpoint di redirect del server.
 * - Ogni evento viene sempre registrato, ma è "idoneo" solo se non è bot/prefetch e non è ripetuto.
 * - visitor_hash = HMAC-SHA256(secret, giorno|IP|user-agent) troncato: non reversibile e non
 *   collegabile tra giorni diversi; serve solo a riconoscere le ripetizioni a breve termine.
 * - Clic unici: NON misurati (un hash giornaliero non è una metodologia affidabile di unicità).
 */

import { createHmac } from "node:crypto";
import type { AdEventType } from "./types";

/** Finestra entro cui un evento identico dello stesso visitatore è considerato ripetuto. */
export const DEDUP_WINDOW_MS: Readonly<Record<AdEventType, number>> = {
  impression: 30 * 60 * 1000,
  click: 10 * 60 * 1000,
};

/** Limite di eventi per IP e minuto oltre il quale l'endpoint risponde 429 senza registrare. */
export const EVENT_RATE_LIMIT = { max: 60, windowMs: 60_000 } as const;

const BOT_UA =
  /bot|crawl|spider|slurp|scrape|fetch|preview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python|httpclient|okhttp|java\/|go-http|axios|node-fetch|undici|facebookexternalhit|whatsapp|telegram|discord|skype|embedly|quora link|vercel/i;

export interface RequestSignals {
  userAgent: string | null;
  /** Header Sec-Purpose / Purpose / X-Purpose (prefetch e prerender del browser). */
  purpose: string | null;
}

export function readSignals(request: Request): RequestSignals {
  const h = request.headers;
  return {
    userAgent: h.get("user-agent"),
    purpose: h.get("sec-purpose") ?? h.get("purpose") ?? h.get("x-purpose") ?? h.get("x-moz"),
  };
}

/** Restituisce il motivo del filtro, o null se il traffico sembra umano. */
export function automatedTrafficReason(signals: RequestSignals): string | null {
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

export interface EventClassification {
  is_bot: boolean;
  is_duplicate: boolean;
  filter_reason: string | null;
}

export function classifyEvent(input: {
  signals: RequestSignals;
  lastSimilarEventAt: string | null;
  type: AdEventType;
  now: Date;
}): EventClassification {
  const botReason = automatedTrafficReason(input.signals);
  if (botReason) return { is_bot: true, is_duplicate: false, filter_reason: botReason };
  if (input.lastSimilarEventAt) {
    const elapsed = input.now.getTime() - Date.parse(input.lastSimilarEventAt);
    if (elapsed >= 0 && elapsed < DEDUP_WINDOW_MS[input.type]) {
      return { is_bot: false, is_duplicate: true, filter_reason: "ripetuto nella finestra di deduplica" };
    }
  }
  return { is_bot: false, is_duplicate: false, filter_reason: null };
}
