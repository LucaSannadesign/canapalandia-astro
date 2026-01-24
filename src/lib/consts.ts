export const WP_HOST = import.meta.env.PUBLIC_WP_HOST || "https://canapalandia.com";
export const WP_API_BASE = import.meta.env.PUBLIC_WP_API_BASE || `${WP_HOST}/wp-json/wp/v2`;
export const SITE_URL = import.meta.env.SITE || "https://canapalandia.com";

// AdSense Configuration
export const ADSENSE_CLIENT = "ca-pub-6462363788506395";
export const ADS_SLOT_TOP = "7168595886"; // Top bar / adbar
// NOTA: Sostituire ADS_SLOT_ARTICLE e ADS_SLOT_SIDEBAR con slot ID reali da AdSense
// Per ora usiamo lo stesso slot come fallback temporaneo (funziona ma non ottimale per revenue)
export const ADS_SLOT_ARTICLE = "7168595886"; // In-article (TODO: sostituire con slot reale)
export const ADS_SLOT_SIDEBAR = "7168595886"; // Sidebar (TODO: sostituire con slot reale)
export const ADS_SLOT_HOME = "7168595886"; // Homepage
export const ADS_SLOT_BLOG_BOTTOM = "7168595886"; // Blog list bottom (TODO: sostituire con slot reale)

// Routes dove NON mostrare ads (low-value pages)
export const ADS_EXCLUDED_ROUTES = ["/cerca/", "/cerca"];

// Feature flags
export const FEATURES = {
  REACTIONS: false, // Disattiva temporaneamente il sistema Reactions
} as const;
