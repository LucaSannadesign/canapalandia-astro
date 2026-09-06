export const prerender = false;

import type { APIRoute } from "astro";

const BUTTONDOWN_API_URL = "https://api.buttondown.com/v1/subscribers";

type Campaign = "drop-001" | "hemp-food-001";

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
    } else {
      const form = await request.formData();
      email = (form.get("email") as string) || null;
      consent = (form.get("consent") as string) || null;
      hp = (form.get("hp") as string) || null;
      campaign = normalizedCampaign(form.get("campaign"));
      preference = normalizedPreference(form.get("preference"), campaign);
      creativeVersion = normalizedCreativeVersion(form.get("creativeVersion"), campaign);
    }

    if (hp && hp.trim() !== "") {
      return jsonResponse("ok", 200);
    }

    if (campaign && !isCampaignEnabled(campaign)) {
      return new Response(JSON.stringify({ message: "Campagna non disponibile" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return jsonResponse("Email non valida", 400);
    }

    if (campaign && !preference) {
      return jsonResponse("Preferenza prodotto non valida", 400);
    }

    if (campaign && !creativeVersion) {
      return jsonResponse("Versione creativa non valida", 400);
    }

    const consentOk = consent === true || consent === "true" || consent === "on" || consent === "1";
    if (!consentOk) {
      return jsonResponse("Devi accettare la Privacy Policy", 400);
    }

    const apiKey = import.meta.env.BUTTONDOWN_API_KEY;
    if (!apiKey) {
      return jsonResponse("Config newsletter mancante (BUTTONDOWN_API_KEY)", 500);
    }

    const xff = request.headers.get("x-forwarded-for") || "";
    const ip_address = xff.split(",")[0]?.trim() || undefined;

    const metadata: Record<string, string> = { source: "canapalandia-astro" };
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
    } = {
      email_address: email,
      ip_address,
      metadata,
    };

    // La newsletter ordinaria mantiene il tag storico.
    // I demand test restano metadata-first e indipendenti dalla feature Tags.
    if (!campaign) {
      subscriberPayload.tags = ["canapalandia-site"];
    }

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
      return jsonResponse("Iscrizione avvenuta con successo!", 200);
    }

    let errJson: any = null;
    try {
      errJson = await response.json();
    } catch {
      errJson = null;
    }

    const code = errJson?.code as string | undefined;
    const detail = errJson?.detail as string | undefined;
    console.error(`[Newsletter] Buttondown error: ${response.status} - ${code || "unknown"} - ${detail || ""}`);

    if (code === "email_already_exists" || code === "subscriber_already_exists") {
      return jsonResponse("Sei già iscritto 🙂", 409);
    }

    if (code === "email_invalid" || code === "email_empty") {
      return jsonResponse("Email non valida", 400);
    }

    if (code === "rate_limited") {
      return jsonResponse("Troppe richieste, riprova tra poco.", 429);
    }

    return jsonResponse("Errore durante l’iscrizione. Riprova più tardi.", 500);
  } catch (error) {
    console.error("[Newsletter] Error:", error);
    return jsonResponse("Errore interno", 500);
  }
};
