const BRAND_HASHTAG = "Canapalandia";
const MAX_HASHTAGS = 5;

const ACRONYMS = new Set(["ai", "cbd", "coa", "efsa", "thc", "ue", "usa"]);

function normalizeExplicitHashtag(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^#+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "");
}

function tagToHashtag(value: unknown): string {
  const parts = String(value ?? "")
    .trim()
    .replace(/^#+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  return parts
    .map((part) => {
      const lower = part.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join("");
}

export function buildSocialHashtags(
  explicitHashtags?: unknown,
  fallbackTags?: unknown,
): string[] {
  const explicit = Array.isArray(explicitHashtags)
    ? explicitHashtags.map(normalizeExplicitHashtag)
    : [];
  const fallback = Array.isArray(fallbackTags)
    ? fallbackTags.map(tagToHashtag)
    : [];

  const candidates = [BRAND_HASHTAG, ...(explicit.length ? explicit : fallback)];
  const seen = new Set<string>();

  return candidates
    .filter(Boolean)
    .filter((hashtag) => {
      const key = hashtag.toLocaleLowerCase("it");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_HASHTAGS);
}

export function formatSocialHashtags(hashtags: string[]): string {
  return hashtags.map((hashtag) => `#${hashtag}`).join(" ");
}
