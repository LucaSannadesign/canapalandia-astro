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
    const lang = String(form.get("lang") || "").trim().toLowerCase() === "en" ? "en" : "it";
    const successPath = lang === "en" ? "/en/contact/?sent=1" : "/contatti/?sent=1";
    const reply = (it: string, en: string, status: number) =>
      new Response(lang === "en" ? en : it, { status });

    if (hp) {
      return redirect(successPath, 303);
    }

    if (!name || !email || !subject || !message || !privacy) {
      return reply("Dati mancanti", "Missing required fields", 400);
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      return reply("Email non valida", "Invalid email address", 400);
    }

    const apiKey = import.meta.env.RESEND_API_KEY;

    if (!apiKey) {
      console.error("[Contatti] RESEND_API_KEY mancante");
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
        subject: `Canapalandia — ${subject}`,
        text: [
          `Lingua / Language: ${lang}`,
          `Nome / Name: ${name}`,
          `Email: ${email}`,
          "",
          "Messaggio / Message:",
          message,
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Contatti] Resend error:", response.status, error);
      return reply("Errore durante l'invio", "There was an error sending your message", 500);
    }

    return redirect(successPath, 303);
  } catch (error) {
    console.error("[Contatti] Error:", error);
    return new Response("Internal server error", { status: 500 });
  }
};
