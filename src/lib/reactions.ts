/**
 * Helper per costruire URL delle reactions API
 * 
 * Normalizza lo slug e aggiunge sempre lo slash finale
 * per rispettare trailingSlash: "always" di Astro
 */

/**
 * Costruisce l'URL per l'endpoint reactions API
 * @param slug - Slug del post (può avere o meno slash iniziali/finali)
 * @returns URL normalizzato con slash finale: /api/reactions/{slug}/
 */
export function reactionsUrl(slug: string): string {
  // Rimuove slash iniziali e finali, poi aggiunge slash finale
  const normalized = slug.replace(/^\/+|\/+$/g, "");
  return `/api/reactions/${normalized}/`;
}
