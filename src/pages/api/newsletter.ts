export const prerender = false; // API route must be server-side

import type { APIRoute } from 'astro';

const BUTTONDOWN_API_URL = "https://api.buttondown.com/v1/subscribers";
const DROP_001_PREFERENCES = new Set(["tshirt", "poster", "tote"]);
const DROP_001_CREATIVE_VERSIONS = new Set(["claims-v2"]);

function normalizedCampaign(value: unknown): string | null {
    return value === "drop-001" ? "drop-001" : null;
}

function normalizedPreference(value: unknown): string | null {
    return typeof value === "string" && DROP_001_PREFERENCES.has(value)
        ? value
        : null;
}

function normalizedCreativeVersion(value: unknown): string | null {
    return typeof value === "string" && DROP_001_CREATIVE_VERSIONS.has(value)
        ? value
        : null;
}

export const POST: APIRoute = async ({ request }) => {
    try {
        // Supporta sia JSON che form submissions.
        const contentType = request.headers.get("content-type") || "";
        let email: string | null = null;
        let consent: string | boolean | null = null;
        let hp: string | null = null;
        let campaign: string | null = null;
        let preference: string | null = null;
        let creativeVersion: string | null = null;

        if (contentType.includes("application/json")) {
            const data = await request.json();
            email = data.email || null;
            consent = data.consent || null;
            hp = data.hp || null;
            campaign = normalizedCampaign(data.campaign);
            preference = normalizedPreference(data.preference);
            creativeVersion = normalizedCreativeVersion(data.creativeVersion);
        } else {
            const form = await request.formData();
            email = (form.get("email") as string) || null;
            consent = (form.get("consent") as string) || null;
            hp = (form.get("hp") as string) || null;
            campaign = normalizedCampaign(form.get("campaign"));
            preference = normalizedPreference(form.get("preference"));
            creativeVersion = normalizedCreativeVersion(form.get("creativeVersion"));
        }

        // Honeypot: se hp è valorizzato, ritorna OK senza iscrivere (antibot).
        if (hp && hp.trim() !== "") {
            return new Response(JSON.stringify({ message: "ok" }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (!email || !/\S+@\S+\.\S+/.test(email)) {
            return new Response(JSON.stringify({ message: "Email non valida" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (campaign === "drop-001" && !preference) {
            return new Response(JSON.stringify({ message: "Seleziona il prodotto che ti interessa" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

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

        const apiKey = import.meta.env.BUTTONDOWN_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({
                message: "Config newsletter mancante (BUTTONDOWN_API_KEY)"
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        const xff = request.headers.get("x-forwarded-for") || "";
        const ip_address = xff.split(",")[0]?.trim() || undefined;

        const tags = ["canapalandia-site"];
        const metadata: Record<string, string> = { source: "canapalandia-astro" };

        if (campaign === "drop-001") {
            tags.push("drop-001-waitlist");
            metadata.campaign = campaign;

            if (preference) {
                tags.push(`drop-001-${preference}`);
                metadata.preference = preference;
            }

            if (creativeVersion) {
                tags.push(`drop-001-${creativeVersion}`);
                metadata.creative_version = creativeVersion;
            }
        }

        const response = await fetch(BUTTONDOWN_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Token ${apiKey}`,
                "Content-Type": "application/json",
                "X-Buttondown-Collision-Behavior": "overwrite",
            },
            body: JSON.stringify({
                email_address: email,
                ip_address,
                tags,
                metadata,
            }),
        });

        if (response.ok || response.status === 201) {
            return new Response(JSON.stringify({
                message: "Iscrizione avvenuta con successo!"
            }), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
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
            return new Response(JSON.stringify({ message: "Sei già iscritto 🙂" }), {
                status: 409,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (code === "email_invalid" || code === "email_empty") {
            return new Response(JSON.stringify({ message: "Email non valida" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (code === "rate_limited") {
            return new Response(JSON.stringify({ message: "Troppe richieste, riprova tra poco." }), {
                status: 429,
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({
            message: "Errore durante l’iscrizione. Riprova più tardi."
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        console.error("[Newsletter] Error:", error);
        return new Response(JSON.stringify({ message: "Errore interno" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};
