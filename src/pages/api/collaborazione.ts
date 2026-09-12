export const prerender = false;

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, redirect }) => {
  let lang: "it" | "en" = "it";
  try {
    const form = await request.formData();

    const nome = String(form.get("nome_cognome") || "").trim();
    const email = String(form.get("email") || "").trim();
    const azienda = String(form.get("azienda") || "").trim();
    const sitoWeb = String(form.get("sito_web") || "").trim();
    const tipoContenuto = String(form.get("tipo_contenuto") || "").trim();
    const argomento = String(form.get("argomento") || "").trim();
    const link = String(form.get("link") || "").trim();
    const messaggio = String(form.get("messaggio") || "").trim();
    const privacy = form.get("privacy");
    const hp = String(form.get("_gotcha") || "").trim();
    lang = String(form.get("lang") || "").toLowerCase() === "en" ? "en" : "it";

    const successPath = lang === "en" ? "/en/thanks-collaboration/" : "/grazie-collaborazione/";
    const reply = (it: string, en: string, status: number) =>
      new Response(lang === "en" ? en : it, { status });

    if (hp) return redirect(successPath, 303);

    if (!nome || !email || !azienda || !sitoWeb || !tipoContenuto || !argomento || !link || !messaggio || !privacy) {
      return reply("Dati mancanti", "Missing required fields", 400);
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      return reply("Email non valida", "Invalid email address", 400);
    }

    const apiKey = import.meta.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[Collaborazione] RESEND_API_KEY mancante");
      return reply("Configurazione email mancante", "Email service is not configured", 500);
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Canapalandia <noreply@canapalandia.com>",
        to: ["info@canapalandia.com"],
        reply_to: email,
        subject: `${lang === "en" ? "Collaboration proposal" : "Proposta collaborazione"} — ${azienda} — ${argomento}`,
        text: [
          lang === "en" ? "NEW COLLABORATION PROPOSAL" : "NUOVA PROPOSTA DI COLLABORAZIONE",
          `Lingua / Language: ${lang}`,
          "",
          `Nome / Name: ${nome}`,
          `Email: ${email}`,
          `Azienda / Project: ${azienda}`,
          `Sito web / Website: ${sitoWeb}`,
          `Tipo / Format: ${tipoContenuto}`,
          `Argomento / Topic: ${argomento}`,
          `Link: ${link}`,
          "",
          "Messaggio / Message:",
          messaggio,
          "",
          "Privacy: accepted",
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Collaborazione] Resend error:", response.status, error);
      return reply("Errore durante l'invio", "There was an error sending the proposal", 500);
    }

    return redirect(successPath, 303);
  } catch (error) {
    console.error("[Collaborazione] Error:", error);
    return new Response(lang === "en" ? "Internal error" : "Errore interno", { status: 500 });
  }
};
