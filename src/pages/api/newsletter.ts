export const prerender = false; // API route must be server-side

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const data = await request.json();
        const email = data.email;

        if (!email || !/\S+@\S+\.\S+/.test(email)) {
            return new Response(JSON.stringify({ message: "Email non valida" }), {
                status: 400,
            });
        }

        // Qui andrà l'integrazione con Supabase o Mailchimp/ConvertKit
        console.log(`[Newsletter] Iscrizione ricevuta: ${email}`);

        return new Response(JSON.stringify({
            message: "Iscrizione avvenuta con successo!"
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        return new Response(JSON.stringify({ message: "Errore interno" }), { status: 500 });
    }
};
