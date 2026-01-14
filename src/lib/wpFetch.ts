/**
 * Helper resiliente per fetch a WordPress REST API
 * 
 * Caratteristiche:
 * - Timeout (8000ms)
 * - User-Agent e Accept headers per ridurre blocchi
 * - Gestione errori con fallback
 * - Non crasha la pagina se WP risponde 403/429/5xx o timeout
 */

const WP_FETCH_TIMEOUT = 8000; // 8 secondi
const WP_USER_AGENT = "canapalandia-astro/1.0";

export type WpFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string | FormData;
  timeout?: number;
};

export type WpFetchResult<T = any> = {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
};

/**
 * Fetch resiliente a WordPress REST API con timeout e gestione errori
 */
export async function fetchWpJson<T = any>(
  url: string,
  options: WpFetchOptions = {}
): Promise<WpFetchResult<T>> {
  const {
    method = "GET",
    headers = {},
    body,
    timeout = WP_FETCH_TIMEOUT,
  } = options;

  // Headers di default
  const defaultHeaders: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": WP_USER_AGENT,
    ...headers,
  };

  // Se c'è body e non è FormData, aggiungi Content-Type
  if (body && typeof body === "string") {
    defaultHeaders["Content-Type"] = "application/json";
  }

  try {
    // AbortController per timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method,
      headers: defaultHeaders,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Se risposta non ok, ritorna errore gestito
    if (!response.ok) {
      const status = response.status;
      const isClientError = status >= 400 && status < 500;
      const isServerError = status >= 500;

      // Per 403/429/5xx, ritorna errore gestito (non crasha)
      if (status === 403 || status === 429 || isServerError) {
        return {
          ok: false,
          error: `WordPress API risposta ${status}`,
          status,
        };
      }

      // Per altri errori client (400, 404, ecc.), ritorna comunque errore gestito
      if (isClientError) {
        return {
          ok: false,
          error: `WordPress API errore ${status}`,
          status,
        };
      }
    }

    // Prova a parsare JSON
    try {
      const data = await response.json();
      return {
        ok: true,
        data,
        status: response.status,
      };
    } catch (parseError) {
      // Se non è JSON, ritorna errore
      return {
        ok: false,
        error: "Risposta non valida da WordPress API",
        status: response.status,
      };
    }
  } catch (error: any) {
    // Timeout o errore di rete
    if (error.name === "AbortError") {
      return {
        ok: false,
        error: "Timeout nella richiesta a WordPress API",
      };
    }

    // Altri errori di rete
    return {
      ok: false,
      error: error.message || "Errore di rete nella richiesta a WordPress API",
    };
  }
}

/**
 * Fallback: carica dati da file JSON locale (data/wp/out/posts.json)
 */
export async function loadWpJsonFallback<T = any>(
  fallbackPath: string
): Promise<T | null> {
  try {
    // In Astro, possiamo importare direttamente i JSON
    // Questo è un fallback per quando WP API non è disponibile
    const module = await import(fallbackPath);
    return module.default || module || null;
  } catch (error) {
    console.warn(`[wpFetch] Fallback non disponibile: ${fallbackPath}`, error);
    return null;
  }
}
