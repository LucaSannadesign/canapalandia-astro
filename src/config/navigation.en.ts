export type EnglishNavigationItem = {
  label: string;
  href: string;
};

export const EN_PRIMARY_NAVIGATION: readonly EnglishNavigationItem[] = [
  { label: "News", href: "/en/news/" },
  { label: "Policy", href: "/en/policy/" },
  { label: "CBD", href: "/en/cbd/" },
  { label: "Hemp", href: "/en/hemp/" },
  { label: "Blog", href: "/en/blog/" },
] as const;

export const EN_UTILITY_NAVIGATION: readonly EnglishNavigationItem[] = [
  { label: "Search", href: "/en/search/" },
] as const;

export const EN_FOOTER_EXPLORE_NAVIGATION: readonly EnglishNavigationItem[] = [
  ...EN_PRIMARY_NAVIGATION,
  { label: "Canapalandia Lab", href: "/en/lab/" },
  { label: "AI Reframer", href: "/en/ribaltatore/" },
  { label: "Reframed phrases", href: "/en/frasi-ribaltate/" },
  { label: "Sitemap", href: "/en/sitemap/" },
] as const;
