export const prerender = false;

import type { APIRoute } from "astro";

const BUTTONDOWN_API_URL = "https://api.buttondown.com/v1/subscribers";

type Campaign = "hemp-food-001";
type UiLang = "it" | "en";
type EnglishFormStatus = "success" | "exists" | "error";

const HEMP_FOOD_001_PREFERENCES = new Set(["semi-decorticati-500g"]);
const HEMP_FOOD_001_CREATIVE_VERSIONS = new Set(["seed-pilot-v1"]);

function normalizedCampaign(value: unknown): Campaign | null {
  return value === "hemp-food-001" ? value : null;
}

function normalizedPreference(value: unknown, campaign: Campaign | null): string | null {
  if (typeof value !== "string") return null;
  if (campaign === "hemp-food-001" && HEMP_FOOD_001_PREFERENCES.has(value)) return value;
  return null;
}

function normalizedCreativeVersion(value: unknown, campaign: Campaign | null): string | null {
  if (typeof value !== "string") return null;
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
  if (campaign === "hemp-food-001") return import.meta.env.HEMP_FOOD_001_TEST_ENABLED === "true";
  return true;
}

export const POST: APIRoute = async ({ request }) => {
  let lang: UiLang = "it";
  const contentType = request.headers.get("content-type") || "";
  const wantsJson = contentType.includes("application/json");

  const englishFormRedirect = (status: EnglishFormStatus) =>
    Response.redirect(new URL(`/en/newsletter-thanks/?status=${status}`, request.url), 303);

  try {
    let email: string | null = null;
    let consent: string | boolean | null = null;
    let hp: string | null = null;
    let campaign: Campaign | null = null;
    let preference: string | null = null;
    let creativeVersion: string | null = null;
    let explicitLang = "";

    if (wantsJson) {
      const data = await request.json();
      email = data.email || null;
      consent = data.consent || null;
      hp = data.hp || null;
      campaign = normalizedCampaign(data.campaign);
      preference = normalizedPreference(data.preference, campaign);
      creativeVersion = normalizedCreativeVersion(data.creativeVersion, campaign);
      explicitLang = String(data.lang || "").toLowerCase();
    } else {
      const form = await request.formData();
      email = (form.get("email") as string) || null;
      consent = (form.get("consent") as string) || null;
      hp = (form.get("hp") as string) || null;
      campaign = normalizedCampaign(form.get("campaign"));
      preference = normalizedPreference(form.get("preference"), campaign);
      creativeVersion = normalizedCreativeVersion(form.get("creativeVersion"), campaign);
      explicitLang = String(form.get("lang") || "").toLowerCase();
    }

    const referer = request.headers.get("referer") || "";
    lang = explicitLang === "en" || (!explicitLang && /\/en(?:\/|$)/.test(referer)) ? "en" : "it";
    const msg = (it: string, en: string) => lang === "en" ? en : it;
    const respond = (message: string, status: number, englishStatus: EnglishFormStatus = "error") =>
      !wantsJson && lang === "en" ? englishFormRedirect(englishStatus) : jsonResponse(message, status);

    if (hp && hp.trim() !== "") {
      return !wantsJson && lang === "en" ? englishFormRedirect("success") : jsonResponse("ok", 200);
    }

    if (campaign && !isCampaignEnabled(campaign)) {
      return respond(msg("Campagna non disponibile", "Campaign not available"), 404);
    }

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return respond(msg("Email non valida", "Invalid email address"), 400);
    }
    if (campaign && !preference) {
      return respond(msg("Preferenza prodotto non valida", "Invalid product preference"), 400);
    }
    if (campaign && !creativeVersion) {
      return respond(msg("Versione creativa non valida", "Invalid creative version"), 400);
    }

    const consentOk = consent === true || consent === "true" || consent === "on" || consent === "1";
    if (!consentOk) {
      return respond(msg("Devi accettare la Privacy Policy", "You must accept the Privacy Policy"), 400);
    }

    const apiKey = import.meta.env.BUTTONDOWN_API_KEY;
    if (!apiKey) {
      return respond(
        msg("Config newsletter mancante (BUTTONDOWN_API_KEY)", "Newsletter configuration is missing (BUTTONDOWN_API_KEY)"),
        500,
      );
    }

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
      return respond(
        msg("Iscrizione avvenuta con successo!", "Subscription successful! Please check your inbox if confirmation is required."),
        200,
        "success",
      );
    }

    let errJson: any = null;
    try { errJson = await response.json(); } catch { errJson = null; }
    const code = errJson?.code as string | undefined;
    const detail = errJson?.detail as string | undefined;
    console.error(`[Newsletter] Buttondown error: ${response.status} - ${code || "unknown"} - ${detail || ""}`);

    if (code === "email_already_exists" || code === "subscriber_already_exists") {
      return respond(msg("Sei già iscritto 🙂", "You are already subscribed 🙂"), 409, "exists");
    }
    if (code === "email_invalid" || code === "email_empty") {
      return respond(msg("Email non valida", "Invalid email address"), 400);
    }
    if (code === "rate_limited") {
      return respond(msg("Troppe richieste, riprova tra poco.", "Too many requests. Please try again shortly."), 429);
    }
    return respond(
      msg("Errore durante l’iscrizione. Riprova più tardi.", "There was an error subscribing. Please try again later."),
      500,
    );
  } catch (error) {
    console.error("[Newsletter] Error:", error);
    if (!wantsJson && lang === "en") return englishFormRedirect("error");
    return jsonResponse(lang === "en" ? "Internal error" : "Errore interno", 500);
  }
};