export type NavigationItem = {
  label: string;
  href: string;
};

/**
 * Navigazione editoriale principale.
 *
 * La UI non deve essere generata automaticamente dalle tassonomie del blog:
 * una categoria può esistere per classificare i contenuti senza meritare una
 * voce nell'header. Qui esponiamo solo i percorsi editoriali con sufficiente
 * consistenza e utilità per il lettore.
 */
export const PRIMARY_NAVIGATION: readonly NavigationItem[] = [
  { label: "Notizie", href: "/categoria/cannabis-news-it/" },
  { label: "Normativa", href: "/categoria/normativa/" },
  { label: "CBD", href: "/categoria/cbd-alimentazione/" },
  { label: "Canapa", href: "/categoria/canapa-e-ambiente/" },
  { label: "Blog", href: "/blog/" },
] as const;

/** Link di utilità mostrati fuori dalla gerarchia editoriale principale. */
export const UTILITY_NAVIGATION: readonly NavigationItem[] = [
  { label: "Cerca", href: "/cerca/" },
] as const;

/**
 * Il footer può essere più esteso dell'header, ma mantiene in testa gli stessi
 * quattro nuclei editoriali per non creare una seconda architettura mentale.
 */
export const FOOTER_EXPLORE_NAVIGATION: readonly NavigationItem[] = [
  ...PRIMARY_NAVIGATION,
  { label: "Ribaltatore AI", href: "/ribaltatore/" },
  { label: "Frasi Ribaltate", href: "/frasi-ribaltate/" },
  { label: "Mappa del sito", href: "/mappa-del-sito/" },
] as const;
