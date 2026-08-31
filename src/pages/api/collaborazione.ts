export const prerender = false;

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, redirect }) => {
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

    // Honeypot anti-spam
    if (hp) {
      return redirect("/grazie-collaborazione/", 303);
    }

    if (
      !nome ||
      !email ||
      !azienda ||
      !sitoWeb ||
      !tipoContenuto ||
      !argomento ||
      !link ||
      !messaggio ||
      !privacy
    ) {
      return new Response("Dati mancanti", { status: 400 });
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      return new Response("Email non valida", { status: 400 });
    }

    const apiKey = import.meta.env.RESEND_API_KEY;

    if (!apiKey) {
      console.error("[Collaborazione] RESEND_API_KEY mancante");
      return new Response("Configurazione email mancante", { status: 500 });
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
        subject: `Proposta collaborazione — ${azienda} — ${argomento}`,
        text: [
          "NUOVA PROPOSTA DI COLLABORAZIONE",
          "",
          `Nome: ${nome}`,
          `Email: ${email}`,
          `Azienda / progetto: ${azienda}`,
          `Sito web: ${sitoWeb}`,
          `Tipo di contenuto: ${tipoContenuto}`,
          `Argomento: ${argomento}`,
          `Link da valutare: ${link}`,
          "",
          "Messaggio:",
          messaggio,
          "",
          "Privacy: accettata",
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(
        "[Collaborazione] Resend error:",
        response.status,
        error
      );
      return new Response("Errore durante l'invio", { status: 500 });
    }

    return redirect("/grazie-collaborazione/", 303);
  } catch (error) {
    console.error("[Collaborazione] Error:", error);
    return new Response("Errore interno", { status: 500 });
  }
};
