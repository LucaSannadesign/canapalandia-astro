export type PageTranslationPair = {
  it: string;
  en: string;
};

/**
 * Explicit registry for verified structural page pairs.
 * Keep this list intentional: a language alternate must point to a real,
 * equivalent destination rather than being inferred from a slug.
 */
export const PAGE_TRANSLATION_PAIRS: readonly PageTranslationPair[] = [
  { it: "/", en: "/en/" },
  { it: "/blog/", en: "/en/blog/" },
  { it: "/categoria/cannabis-news-it/", en: "/en/news/" },
  { it: "/categoria/normativa/", en: "/en/policy/" },
  { it: "/categoria/cbd-alimentazione/", en: "/en/cbd/" },
  { it: "/categoria/canapa-e-ambiente/", en: "/en/hemp/" },
  { it: "/cerca/", en: "/en/search/" },
  { it: "/chi-siamo/", en: "/en/about/" },
  { it: "/chi-siamo/missione/", en: "/en/mission/" },
  { it: "/pubblicita/", en: "/en/advertising/" },
  { it: "/collabora-con-canapalandia/", en: "/en/collaborate/" },
  { it: "/contatti/", en: "/en/contact/" },
  { it: "/sostieni-la-nostra-causa/", en: "/en/support/" },
  { it: "/disclaimer-legale-canapalandia/", en: "/en/disclaimer/" },
  { it: "/privacy-policy/", en: "/en/privacy/" },
  { it: "/cookie-policy/", en: "/en/cookies/" },
  { it: "/termini-e-condizioni/", en: "/en/terms/" },
  { it: "/mappa-del-sito/", en: "/en/sitemap/" },
  { it: "/lab/", en: "/en/lab/" },
  { it: "/ribaltatore/", en: "/en/ribaltatore/" },
  { it: "/frasi-ribaltate/", en: "/en/frasi-ribaltate/" },
  { it: "/bottega/", en: "/en/bottega/" },
  { it: "/drop-001/", en: "/en/drop-001/" },
  { it: "/grazie-collaborazione/", en: "/en/thanks-collaboration/" },
] as const;

export function normalizePagePath(path: string): string {
  const raw = String(path || "").split(/[?#]/, 1)[0] || "/";
  if (raw === "/") return "/";
  return `/${raw.replace(/^\/+|\/+$/g, "")}/`;
}

export function findPageTranslationPair(path: string): PageTranslationPair | null {
  const normalized = normalizePagePath(path);
  return PAGE_TRANSLATION_PAIRS.find((pair) => pair.it === normalized || pair.en === normalized) ?? null;
}
