export const prerender = false; // API route must be server-side

import type { APIRoute } from 'astro';

const BUTTONDOWN_API_URL = "https://buttondown.com/api/emails/embed-subscribe/Canapalandia";

export const POST: APIRoute = async ({ request }) => {
    try {
        // Supporta sia JSON che form submissions
        const contentType = request.headers.get("content-type") || "";
        let email: string | null = null;
        let consent: string | null = null;
        let hp: string | null = null;

        if (contentType.includes("application/json")) {
            const data = await request.json();
            email = data.email || null;
            consent = data.consent || null;
            hp = data.hp || null;
        } else {
            const form = await request.formData();
            email = (form.get("email") as string) || null;
            consent = (form.get("consent") as string) || null;
            hp = (form.get("hp") as string) || null;
        }

        // Honeypot: se hp è valorizzato, ritorna OK senza iscrivere (antibot)
        if (hp && hp.trim() !== "") {
            return new Response(JSON.stringify({ message: "ok" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Validazione email
        if (!email || !/\S+@\S+\.\S+/.test(email)) {
            return new Response(JSON.stringify({ message: "Email non valida" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Validazione consenso GDPR
        const consentOk =
            consent === true ||
            consent === "true" ||
            consent === "on" ||
            consent === "1";
        if (!consentOk) {
            return new Response(JSON.stringify({ 
                message: "Devi accettare la Privacy Policy" 
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // POST diretto a Buttondown
        const response = await fetch(BUTTONDOWN_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email }),
        });

        if (response.ok || response.status === 201) {
            return new Response(JSON.stringify({
                message: "Iscrizione avvenuta con successo!"
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        } else {
            // Buttondown ritorna 400 per email duplicate, 422 per validazione
            const errorText = await response.text();
            console.error(`[Newsletter] Buttondown error: ${response.status} - ${errorText}`);
            
            if (response.status === 400 || response.status === 422) {
                return new Response(JSON.stringify({
                    message: "Email già iscritta o non valida."
                }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                });
            }

            return new Response(JSON.stringify({
                message: "Errore durante l'iscrizione. Riprova più tardi."
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }
    } catch (error) {
        console.error("[Newsletter] Error:", error);
        return new Response(JSON.stringify({ message: "Errore interno" }), { 
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
