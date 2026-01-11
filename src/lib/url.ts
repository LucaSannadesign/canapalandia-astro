/**
 * Utility per normalizzare URL a path interni relativi
 */

/**
 * Converte un URL (assoluto o relativo) in un path interno relativo
 * @param input - URL assoluto (es. "https://canapalandia.com/ribaltate-ai/123/") o path relativo (es. "/ribaltate-ai/123/")
 * @returns Path relativo che inizia con "/" (es. "/ribaltate-ai/123/")
 */
export function toInternalPath(input: string | null | undefined): string {
  if (!input || typeof input !== "string") {
    return "/";
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }

  // Se è già un path relativo che inizia con "/", ritorna così
  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  // Se è un URL assoluto, estrai pathname + search + hash
  try {
    const url = new URL(trimmed);
    return url.pathname + url.search + url.hash;
  } catch {
    // Se non è un URL valido, assume che sia un path relativo e aggiungi "/"
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
}
