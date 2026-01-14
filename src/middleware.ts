import type { MiddlewareHandler } from "astro";

/**
 * Middleware SEO: forza noindex su preview Vercel e localhost
 * Aggiunge header X-Robots-Tag per bloccare indicizzazione
 */
export const onRequest: MiddlewareHandler = async (context, next) => {
  // Chiama next() e ottieni la Response
  const response = await next();

  // Estrai hostname dalla richiesta
  const hostname = context.url.hostname;

  // Verifica se è preview Vercel o localhost
  const isPreviewOrLocalhost =
    hostname === "localhost" ||
    hostname.startsWith("127.0.0.1") ||
    hostname.endsWith(".vercel.app") ||
    hostname.includes("vercel.app");

  // Se è preview/localhost, aggiungi header X-Robots-Tag
  if (isPreviewOrLocalhost) {
    // Clona la response per poter modificare gli header
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    // Aggiungi header X-Robots-Tag
    newResponse.headers.set("X-Robots-Tag", "noindex, nofollow");

    return newResponse;
  }

  // Altrimenti ritorna la response originale senza modifiche
  return response;
};
