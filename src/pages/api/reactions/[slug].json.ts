/**
 * API endpoint per reazioni post blog (variante .json)
 * 
 * Re-export da [slug].ts per supportare sia /api/reactions/:slug/
 * che /api/reactions/:slug.json
 * 
 * Route: /api/reactions/[slug].json
 */

export { GET, POST } from "./[slug].ts";
