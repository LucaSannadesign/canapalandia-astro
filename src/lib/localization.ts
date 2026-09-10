export type SiteLanguage = "it" | "en";

export const EN_BLOG_CATEGORIES = new Set<string>([
  "cannabis-news",
  "cannabis-legalization",
  "cbd-and-nutrition",
  "cannabis-and-innovation",
  "medical-cannabis",
  "hemp-sustainability",
  "health-wellness",
]);

export type BlogTranslationPair = {
  it: string;
  en: string;
};

/**
 * Registry intenzionale delle sole traduzioni verificate.
 *
 * Non dedurre mai una coppia da titolo, slug o somiglianza semantica: hreflang e
 * language switcher vengono emessi soltanto quando entrambe le URL sono state
 * revisionate e registrate esplicitamente qui.
 */
export const BLOG_TRANSLATION_PAIRS: readonly BlogTranslationPair[] = [
  {
    it: "germania-record-importazioni-cannabis-medica-2026",
    en: "germany-medical-cannabis-imports-record-2026",
  },
] as const;

export function languageFromCategory(category: unknown): SiteLanguage {
  return typeof category === "string" && EN_BLOG_CATEGORIES.has(category) ? "en" : "it";
}

export function findBlogTranslationPair(slug: string): BlogTranslationPair | null {
  const normalized = String(slug || "").trim();
  if (!normalized) return null;
  return BLOG_TRANSLATION_PAIRS.find((pair) => pair.it === normalized || pair.en === normalized) ?? null;
}

export function blogUrl(slug: string, siteUrl = "https://canapalandia.com"): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/blog/${slug}/`;
}

export function translationAlternates(slug: string, siteUrl = "https://canapalandia.com") {
  const pair = findBlogTranslationPair(slug);
  if (!pair) return null;

  return {
    pair,
    it: blogUrl(pair.it, siteUrl),
    en: blogUrl(pair.en, siteUrl),
    xDefault: blogUrl(pair.it, siteUrl),
  };
}
