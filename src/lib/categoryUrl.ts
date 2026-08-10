export function normalizeCategorySlug(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function categoryHref(category: string): string {
  const slug = normalizeCategorySlug(category);
  return slug ? `/categoria/${slug}/` : "/blog/";
}
