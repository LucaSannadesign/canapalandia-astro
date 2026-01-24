/**
 * API endpoint per reazioni post blog (variante .json)
 * 
 * Re-export da [slug].ts per supportare sia /api/reactions/:slug/
 * che /api/reactions/:slug.json (compatibilità)
 * 
 * Route: /api/reactions/[slug].json
 */

// API route must be server-side
export const prerender = false;

export { GET, POST } from "./[slug].ts";
