export const WP_HOST = import.meta.env.PUBLIC_WP_HOST || "https://canapalandia.com";
export const WP_API_BASE = import.meta.env.PUBLIC_WP_API_BASE || `${WP_HOST}/wp-json/wp/v2`;
export const SITE_URL = import.meta.env.SITE || "https://canapalandia.com";

// Feature flags
export const FEATURES = {
  REACTIONS: false, // Disattiva temporaneamente il sistema Reactions
} as const;
