export const prerender = false;

import type { APIRoute } from "astro";

const BUTTONDOWN_API_URL = "https://api.buttondown.com/v1/subscribers";

type Campaign = "drop-001" | "hemp-food-001";
type UiLang = "it" | "en";

const DROP_001_PREFERENCES = new Set(["tshirt", "poster", "tote"]);
const DROP_001_CREATIVE_VERSIONS = new Set(["claims-v2", "neutral-format-v1"]);
const HEMP_FOOD_001_PREFERENCES = new Set(["semi-decorticati-500g"]);
const HEMP_FOOD_001_CREATIVE_VERSIONS = new Set(["seed-pilot-v1"]);

function normalizedCampaign(value: unknown): Campaign | null {
  return value === "drop-001" || value === "hemp-food-001" ? value : null;
}

function normalizedPreference(value: unknown, campaign: Campaign | null): string | null {
  if (typeof value !== "string") return null;
  if (campaign === "drop-001" && DROP_001_PREFERENCES.has(value)) return value;
  if (campaign === "hemp-food-001" && HEMP_FOOD_001_PREFERENCES.has(value)) return value;
  return null;
}

function normalizedCreativeVersion(value: unknown, campaign: Campaign | null): string | null {
  if (typeof value !== "string") return null;
  if (campaign === "drop-001" && DROP_001_CREATIVE_VERSIONS.has(value)) return value;
  if (campaign === "hemp-food-001" && HEMP_FOOD_001_CREATIVE_VERSIONS.has(value)) return value;
  return null;
}

function jsonResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isCampaignEnabled(campaign: Campaign | null): boolean {
  if (campaign === "drop-001") return import.meta.env.DROP_001_TEST_ENABLED === "true";
  if (campaign === "hemp-food-001") return import.meta.env.HEMP_FOOD_001_TEST_ENABLED === "true";
  return true;
}

export const POST: APIRoute = async ({ request }) => {
  let lang: UiLang = "it";
  try {
    const contentType = request.headers.get("content-type") || "";
    let email: string | null = null;
    let consent: string | boolean | null = null;
    let hp: string | null = null;
    let campaign: Campaign | null = null;
    let preference: string | null = null;
    let creativeVersion: string | null = null;

    if (contentType.includes("application/json")) {
      const data = await request.json();
      email = data.email || null;
      consent = data.consent || null;
      hp = data.hp || null;
      campaign = normalizedCampaign(data.campaign);
      preference = normalizedPreference(data.preference, campaign);
      creativeVersion = normalizedCreativeVersion(data.creativeVersion, campaign);
      lang = String(data.lang || "").toLowerCase() === "en" ? "en" : "it";
    } else {
      const form = await request.formData();
      email = (form.get("email") as string) || null;
      consent = (form.get("consent") as string) || null;
      hp = (form.get("hp") as string) || null;
      campaign = normalizedCampaign(form.get("campaign"));
      preference = normalizedPreference(form.get("preference"), campaign);
      creativeVersion = normalizedCreativeVersion(form.get("creativeVersion"), campaign);
      lang = String(form.get("lang") || "").toLowerCase() === "en" ? "en" : "it";
    }

    const msg = (it: string, en: string) => lang === "en" ? en : it;

    if (hp && hp.trim() !== "") return jsonResponse("ok", 200);

    if (campaign && !isCampaignEnabled(campaign)) {
      return new Response(JSON.stringify({ message: msg("Campagna non disponibile", "Campaign not available") }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    if (!email || !/\S+@\S+\.\S+/.test(email)) return jsonResponse(msg("Email non valida", "Invalid email address"), 400);
    if (campaign && !preference) return jsonResponse(msg("Preferenza prodotto non valida", "Invalid product preference"), 400);
    if (campaign && !creativeVersion) return jsonResponse(msg("Versione creativa non valida", "Invalid creative version"), 400);

    const consentOk = consent === true || consent === "true" || consent === "on" || consent === "1";
    if (!consentOk) return jsonResponse(msg("Devi accettare la Privacy Policy", "You must accept the Privacy Policy"), 400);

    const apiKey = import.meta.env.BUTTONDOWN_API_KEY;
    if (!apiKey) return jsonResponse(msg("Config newsletter mancante (BUTTONDOWN_API_KEY)", "Newsletter configuration is missing (BUTTONDOWN_API_KEY)"), 500);

    const xff = request.headers.get("x-forwarded-for") || "";
    const ip_address = xff.split(",")[0]?.trim() || undefined;
    const metadata: Record<string, string> = { source: "canapalandia-astro", language: lang };
    if (campaign) {
      metadata.campaign = campaign;
      metadata.preference = preference!;
      metadata.creative_version = creativeVersion!;
      metadata.consent_context = `${campaign}-waitlist`;
    }

    const subscriberPayload: {
      email_address: string;
      ip_address?: string;
      metadata: Record<string, string>;
      tags?: string[];
    } = { email_address: email, ip_address, metadata };

    if (!campaign) subscriberPayload.tags = ["canapalandia-site"];

    const response = await fetch(BUTTONDOWN_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
        "X-Buttondown-Collision-Behavior": "overwrite",
      },
      body: JSON.stringify(subscriberPayload),
    });

    if (response.ok || response.status === 201) {
      return jsonResponse(msg("Iscrizione avvenuta con successo!", "Subscription successful! Please check your inbox if confirmation is required."), 200);
    }

    let errJson: any = null;
    try { errJson = await response.json(); } catch { errJson = null; }
    const code = errJson?.code as string | undefined;
    const detail = errJson?.detail as string | undefined;
    console.error(`[Newsletter] Buttondown error: ${response.status} - ${code || "unknown"} - ${detail || ""}`);

    if (code === "email_already_exists" || code === "subscriber_already_exists") return jsonResponse(msg("Sei già iscritto 🙂", "You are already subscribed 🙂"), 409);
    if (code === "email_invalid" || code === "email_empty") return jsonResponse(msg("Email non valida", "Invalid email address"), 400);
    if (code === "rate_limited") return jsonResponse(msg("Troppe richieste, riprova tra poco.", "Too many requests. Please try again shortly."), 429);
    return jsonResponse(msg("Errore durante l’iscrizione. Riprova più tardi.", "There was an error subscribing. Please try again later."), 500);
  } catch (error) {
    console.error("[Newsletter] Error:", error);
    return jsonResponse(lang === "en" ? "Internal error" : "Errore interno", 500);
  }
};
