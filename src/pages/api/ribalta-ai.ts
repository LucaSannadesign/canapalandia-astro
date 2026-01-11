/**
 * API endpoint per Ribaltatore AI
 * 
 * Replica ESATTAMENTE il comportamento del PHP originale:
 * - Riceve POST con FormData (frase, email_trap)
 * - Valida honeypot (email_trap)
 * - Rate limit per IP (10 richieste / 10 minuti)
 * - Chiama OpenAI chat/completions (gpt-3.5-turbo, temperature 0.9)
 * - Prompt identico al PHP
 * - Salva in DB e restituisce JSON { id, originale, ribaltata }
 */

import type { APIRoute } from "astro";
import { insertRibaltata } from "@/lib/repositories/ribaltatoreRepo";
import { checkRateLimit, extractClientIp } from "@/lib/rateLimit";
import crypto from "node:crypto";

/**
 * Chiama OpenAI API (chat/completions) come il PHP originale
 */
async function callOpenAI(frase: string): Promise<{ ok: true; ribaltata: string } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY non configurata." };
  }

  // Prompt IDENTICO al PHP originale
  const prompt = `Agisci come un attivista antiproibizionista e satirico. Ribalta con ironia e intelligenza lo slogan: "${frase}"`;

  // Parametri IDENTICI al PHP: gpt-3.5-turbo, temperature 0.9
  const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
  const temperature = parseFloat(process.env.OPENAI_TEMPERATURE || "0.9");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature,
        // Nota: max_tokens rimosso per allinearsi al PHP (usa default OpenAI)
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Errore OpenAI (${response.status}): ${errorText.slice(0, 200)}`,
      };
    }

    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      return { ok: false, error: "Risposta OpenAI non valida." };
    }

    // Sanitizza output: rimuovi eventuali tag HTML e limita lunghezza
    let ribaltata = content.trim().replace(/<[^>]*>/g, "");
    if (ribaltata.length > 1200) {
      ribaltata = ribaltata.slice(0, 1200) + "...";
    }

    return { ok: true, ribaltata };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { ok: false, error: "Timeout chiamata OpenAI." };
    }
    return { ok: false, error: `Errore: ${err?.message || String(err)}` };
  }
}

export const POST: APIRoute = async ({ request }) => {
  // 1. Valida Content-Type (multipart/form-data)
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
    return new Response(JSON.stringify({ error: "Content-Type non valido" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // 2. Parse FormData
  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Errore parsing form" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // 3. Valida honeypot (email_trap)
  const trap = String(form.get("email_trap") ?? "").trim();
  if (trap) {
    // Honeypot compilato = spam
    return new Response(
      JSON.stringify({ ribaltata: "❌ Richiesta rifiutata (spam rilevato)" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      },
    );
  }

  // 4. Valida frase
  const fraseRaw = form.get("frase");
  if (!fraseRaw || typeof fraseRaw !== "string") {
    return new Response(JSON.stringify({ ribaltata: "❌ Frase non valida" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const frase = fraseRaw.trim();
  // Vincoli: min 3 caratteri, max 400 (come PHP originale o default ragionevole)
  if (frase.length < 3 || frase.length > 400) {
    return new Response(
      JSON.stringify({ ribaltata: "❌ Frase deve essere tra 3 e 400 caratteri" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      },
    );
  }

  // 5. Rate limit per IP
  const ip = extractClientIp(request);
  const rateLimit = checkRateLimit(ip, 10, 10 * 60 * 1000); // 10 richieste / 10 minuti

  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        ribaltata: `⏳ Troppe richieste. Riprova tra qualche minuto.`,
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  // 6. Chiama OpenAI
  const aiResult = await callOpenAI(frase);

  if (!aiResult.ok) {
    return new Response(JSON.stringify({ ribaltata: `❌ ${aiResult.error}` }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  // 7. Salva in DB (Supabase)
  let id: number;
  try {
    // Hash IP per privacy (opzionale, non obbligatorio)
    const ipHash = ip ? crypto.createHash("sha256").update(ip).digest("hex") : null;
    
    id = await insertRibaltata({
      frase_originale: frase,
      frase_ribaltata: aiResult.ribaltata,
      ip_hash: ipHash,
      // user_id: null per ora (opzionale per futuro)
    });
  } catch (err: any) {
    console.error("[ribalta-ai] Errore salvataggio DB:", err?.message);
    // Anche se fallisce il salvataggio, restituisci il risultato (fallback)
    id = 0;
  }

  // 8. Restituisci JSON (formato compatibile PHP: originale, ribaltata, id)
  return new Response(
    JSON.stringify({
      originale: frase,
      ribaltata: aiResult.ribaltata,
      id,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
};