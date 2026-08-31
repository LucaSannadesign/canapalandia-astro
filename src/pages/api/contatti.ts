export const prerender = false;

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, redirect }) => {
  try {
    const form = await request.formData();

    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const subject = String(form.get("subject") || "").trim();
    const message = String(form.get("message") || "").trim();
    const privacy = form.get("privacy");
    const hp = String(form.get("_gotcha") || "").trim();

    if (hp) {
      return redirect("/contatti/?sent=1", 303);
    }

    if (!name || !email || !subject || !message || !privacy) {
      return new Response("Dati mancanti", { status: 400 });
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      return new Response("Email non valida", { status: 400 });
    }

    const apiKey = import.meta.env.RESEND_API_KEY;

    if (!apiKey) {
      console.error("[Contatti] RESEND_API_KEY mancante");
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
        subject: `Canapalandia — ${subject}`,
        text: [
          `Nome: ${name}`,
          `Email: ${email}`,
          "",
          "Messaggio:",
          message,
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Contatti] Resend error:", response.status, error);
      return new Response("Errore durante l'invio", { status: 500 });
    }

    return redirect("/contatti/?sent=1", 303);
  } catch (error) {
    console.error("[Contatti] Error:", error);
    return new Response("Errore interno", { status: 500 });
  }
};
