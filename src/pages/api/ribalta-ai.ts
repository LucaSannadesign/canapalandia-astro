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
import { cleanPhrase } from "@/lib/utils";
import crypto from "node:crypto";

/**
 * Chiama OpenAI API (chat/completions) come il PHP originale
 */
async function callOpenAI(frase: string): Promise<{ ok: true; ribaltata: string } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY non configurata." };
  }

  // Prompt aggiornato: massimo 3 frasi, max 350 caratteri, tono ironico/antiproibizionista
  const prompt = `Agisci come un attivista antiproibizionista e satirico. Ribalta con ironia e intelligenza lo slogan: "${frase}". Massimo 3 frasi, massimo 350 caratteri. Tono ironico e antiproibizionista, senza incitazione a violare leggi.`;

  // Parametri: gpt-3.5-turbo, temperature 0.9, max_tokens limitato
  const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
  const temperature = parseFloat(process.env.OPENAI_TEMPERATURE || "0.9");
  const maxTokens = 160; // Limite tecnico per risposte brevi

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
        max_tokens: maxTokens,
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

    // Sanitizza output: rimuovi eventuali tag HTML
    let ribaltata = content.trim().replace(/<[^>]*>/g, "");
    
    // Post-process: tronca a 400 caratteri se supera 420 (senza spezzare parola se possibile)
    if (ribaltata.length > 420) {
      let truncated = ribaltata.slice(0, 400);
      // Cerca ultimo spazio prima del limite per non spezzare parola
      const lastSpace = truncated.lastIndexOf(" ");
      if (lastSpace > 350) {
        truncated = truncated.slice(0, lastSpace);
      }
      ribaltata = truncated + "…";
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
  const contentType = request.headers.get("content-type") || "";
  let frase: string = "";
  let trap: string = "";

  // 1. Accetta sia JSON che FormData
  if (contentType.includes("application/json")) {
    // Parse JSON
    try {
      const body = await request.json();
      // Estrai frase con priorità: frase -> testo -> text -> prompt -> input
      frase = (body.frase || body.testo || body.text || body.prompt || body.input || "").trim();
      trap = String(body.email_trap || "").trim();
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: "Errore parsing JSON" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  } else {
    // Parse FormData
    try {
      const form = await request.formData();
      frase = String(form.get("frase") || "").trim();
      trap = String(form.get("email_trap") || "").trim();
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: "Errore parsing form" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  // 2. Valida honeypot (email_trap)
  if (trap) {
    return new Response(
      JSON.stringify({ ok: false, error: "Richiesta rifiutata (spam rilevato)" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 3. Valida frase (vuota o mancante)
  if (!frase) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_frase" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  // 4. Vincoli: min 3 caratteri, max 400
  if (frase.length < 3 || frase.length > 400) {
    return new Response(
      JSON.stringify({ ok: false, error: "Frase deve essere tra 3 e 400 caratteri" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 5. Rate limit per IP
  const ip = extractClientIp(request);
  const rateLimit = checkRateLimit(ip, 10, 10 * 60 * 1000); // 10 richieste / 10 minuti

  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Troppe richieste. Riprova tra qualche minuto.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  // 6. Chiama OpenAI
  const aiResult = await callOpenAI(frase);

  if (!aiResult.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: aiResult.error }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 7. Salva in DB (Supabase)
  let id: number = 0;
  // Pulisci frasi da caratteri escapati prima di salvare e restituire
  const fraseOriginalePulita = cleanPhrase(frase);
  const fraseRibaltataPulita = cleanPhrase(aiResult.ribaltata, true); // Preserva newline

  try {
    // Hash IP per privacy (opzionale, non obbligatorio)
    const ipHash = ip ? crypto.createHash("sha256").update(ip).digest("hex") : null;
    
    id = await insertRibaltata({
      frase_originale: fraseOriginalePulita,
      frase_ribaltata: fraseRibaltataPulita,
      ip_hash: ipHash,
      // user_id: null per ora (opzionale per futuro)
    });
  } catch (err: any) {
    console.error("[ribalta-ai] Errore salvataggio DB:", err?.message);
    // Anche se fallisce il salvataggio, restituisci il risultato (fallback con id=0)
  }

  // 8. Restituisci JSON con schema stabile (frasi già pulite)
  return new Response(
    JSON.stringify({
      ok: true,
      id,
      originale: fraseOriginalePulita,
      ribaltata: fraseRibaltataPulita,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};