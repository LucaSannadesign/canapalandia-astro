export type SocialChannel = "facebook" | "instagram";

const SITE_URL = "https://canapalandia.com";

function cleanSlug(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/^blog\//, "");
}

export function toAbsoluteUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  return `${SITE_URL}${normalized}`;
}

export function buildCanonicalPostUrl(slug: unknown): string {
  const clean = cleanSlug(slug);
  return clean ? `${SITE_URL}/blog/${clean}/` : `${SITE_URL}/blog/`;
}

export function buildSocialCampaign(
  slug: unknown,
  configuredCampaign?: unknown,
  variant = "launch",
): string {
  const configured =
    typeof configuredCampaign === "string" ? configuredCampaign.trim() : "";
  if (configured) return configured;

  const clean = cleanSlug(slug)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return [clean || "post", variant].filter(Boolean).join("_");
}

export function buildTrackedPostUrl(
  canonicalUrl: string,
  channel: SocialChannel,
  campaign: string,
  variant = "launch",
): string {
  const url = new URL(canonicalUrl);
  url.searchParams.set("utm_source", channel);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("utm_content", variant);
  return url.toString();
}

function dateKey(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "UNDATED";
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export function buildSocialEventId(
  slug: unknown,
  channel: SocialChannel,
  publishDate: unknown,
  variant = "launch",
): string {
  const clean = cleanSlug(slug)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const variantKey = String(variant || "launch")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-");

  return `SOC-${dateKey(publishDate)}-${channel.toUpperCase()}-${variantKey}-${clean || "POST"}`;
}

export function buildPlatformCopy(
  data: {
    description?: unknown;
    facebookCopy?: unknown;
    instagramCopy?: unknown;
  },
  channel: SocialChannel,
  hashtagsText = "",
): string {
  const dedicated =
    channel === "facebook" ? data.facebookCopy : data.instagramCopy;
  const base =
    (typeof dedicated === "string" && dedicated.trim()) ||
    (typeof data.description === "string" && data.description.trim()) ||
    "";

  return [base, hashtagsText.trim()].filter(Boolean).join("\n\n");
}
