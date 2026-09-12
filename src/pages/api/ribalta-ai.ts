/**
 * API endpoint for the Ribaltatore AI / AI Reframer.
 * Supports the original Italian flow and the English UI through a `lang=en` field.
 */

import type { APIRoute } from "astro";
import { insertRibaltata } from "@/lib/repositories/ribaltatoreRepo";
import { checkRateLimit, extractClientIp } from "@/lib/rateLimit";
import { cleanPhrase } from "@/lib/utils";
import crypto from "node:crypto";

type UiLang = "it" | "en";

async function callOpenAI(
  frase: string,
  apiKey: string,
  lang: UiLang,
): Promise<{ ok: true; ribaltata: string } | { ok: false; error: string }> {
  const prompt = lang === "en"
    ? `Act as a witty anti-prohibition activist and satirist. Reframe the slogan: "${frase}" with irony, intelligence and factual common sense. Maximum 3 sentences and 350 characters. Write in English. Do not encourage breaking the law.`
    : `Agisci come un attivista antiproibizionista e satirico. Ribalta con ironia e intelligenza lo slogan: "${frase}". Massimo 3 frasi, massimo 350 caratteri. Tono ironico e antiproibizionista, senza incitazione a violare leggi.`;

  const model = import.meta.env.OPENAI_MODEL_DEFAULT || "gpt-5-mini";
  const maxTokens = parseInt(import.meta.env.OPENAI_MAX_OUTPUT_TOKENS || "2000", 10);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        ok: false,
        error: lang === "en"
          ? `OpenAI error (${response.status}): ${errorText.slice(0, 200)}`
          : `Errore OpenAI (${response.status}): ${errorText.slice(0, 200)}`,
      };
    }

    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return { ok: false, error: lang === "en" ? "Invalid OpenAI response." : "Risposta OpenAI non valida." };
    }

    let ribaltata = content.trim().replace(/<[^>]*>/g, "");
    if (ribaltata.length > 420) {
      let truncated = ribaltata.slice(0, 400);
      const lastSpace = truncated.lastIndexOf(" ");
      if (lastSpace > 350) truncated = truncated.slice(0, lastSpace);
      ribaltata = truncated + "…";
    }
    return { ok: true, ribaltata };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { ok: false, error: lang === "en" ? "OpenAI request timed out." : "Timeout chiamata OpenAI." };
    }
    return { ok: false, error: lang === "en" ? `Error: ${err?.message || String(err)}` : `Errore: ${err?.message || String(err)}` };
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const apiKey = import.meta.env.OPENAI_API_KEY;
    const contentType = request.headers.get("content-type") || "";
    let frase = "";
    let trap = "";
    let lang: UiLang = "it";

    if (contentType.includes("application/json")) {
      try {
        const body = await request.json();
        frase = String(body.frase || body.testo || body.text || body.prompt || body.input || "").trim();
        trap = String(body.email_trap || "").trim();
        lang = String(body.lang || "").toLowerCase() === "en" ? "en" : "it";
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "invalid_request" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
    } else {
      try {
        const form = await request.formData();
        frase = String(form.get("frase") || "").trim();
        trap = String(form.get("email_trap") || "").trim();
        lang = String(form.get("lang") || "").toLowerCase() === "en" ? "en" : "it";
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "invalid_request" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
    }

    const errorMessage = (it: string, en: string) => lang === "en" ? en : it;

    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, error: errorMessage("OPENAI_API_KEY non configurata.", "OPENAI_API_KEY is not configured.") }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    if (trap) {
      return new Response(JSON.stringify({ ok: false, error: errorMessage("Richiesta rifiutata (spam rilevato)", "Request rejected (spam detected)") }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (!frase) {
      return new Response(JSON.stringify({ ok: false, error: "missing_frase" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (frase.length < 3 || frase.length > 400) {
      return new Response(JSON.stringify({ ok: false, error: errorMessage("Frase deve essere tra 3 e 400 caratteri", "The phrase must be between 3 and 400 characters") }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const ip = extractClientIp(request);
    const rateLimit = checkRateLimit(ip, 10, 10 * 60 * 1000);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ ok: false, error: errorMessage("Troppe richieste. Riprova tra qualche minuto.", "Too many requests. Try again in a few minutes.") }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      });
    }

    const aiResult = await callOpenAI(frase, apiKey, lang);
    if (!aiResult.ok) {
      return new Response(JSON.stringify({ ok: false, error: aiResult.error }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    let id = 0;
    let editToken: string | null = null;
    let editExpiresAt: string | null = null;
    const fraseOriginalePulita = cleanPhrase(frase);
    const fraseRibaltataPulita = cleanPhrase(aiResult.ribaltata, true);

    try {
      const ipHash = ip ? crypto.createHash("sha256").update(ip).digest("hex") : null;
      const insertResult = await insertRibaltata({
        frase_originale: fraseOriginalePulita,
        frase_ribaltata: fraseRibaltataPulita,
        ip_hash: ipHash,
      });
      id = insertResult.id;
      editToken = insertResult.editToken;
      editExpiresAt = insertResult.editExpiresAt;
    } catch (err: any) {
      console.error("[ribalta-ai] Errore salvataggio DB:", err?.message);
    }

    return new Response(JSON.stringify({
      ok: true,
      id,
      originale: fraseOriginalePulita,
      ribaltata: fraseRibaltataPulita,
      editToken: editToken || null,
      editExpiresAt: editExpiresAt || null,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[ribalta-ai] Errore inatteso:", err?.message || String(err));
    return new Response(JSON.stringify({ ok: false, error: "Internal server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};
