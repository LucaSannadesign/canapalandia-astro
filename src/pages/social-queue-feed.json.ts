import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { isPublishedBlogEntry } from "../lib/blogVisibility";
import { buildSocialHashtags, formatSocialHashtags } from "../lib/socialHashtags";

const SITE_URL = "https://canapalandia.com";

type SocialChannel = "facebook" | "instagram";

function cleanSlug(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/^blog\//, "");
}

function toAbsoluteUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  return `${SITE_URL}${normalized}`;
}

function buildCanonicalPostUrl(slug: unknown): string {
  const clean = cleanSlug(slug);
  return clean ? `${SITE_URL}/blog/${clean}/` : `${SITE_URL}/blog/`;
}

function buildTrackedPostUrl(
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

function buildSocialEventId(
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

function normalizeImage(
  channel: SocialChannel,
  instagramImage?: unknown,
  image?: unknown,
  coverImage?: unknown,
): string {
  const candidate =
    (channel === "instagram" &&
      typeof instagramImage === "string" &&
      instagramImage.trim()) ||
    (typeof image === "string" && image.trim()) ||
    (typeof coverImage === "string" && coverImage.trim()) ||
    "";

  return toAbsoluteUrl(candidate);
}

export const GET: APIRoute = async () => {
  const posts = await getCollection("blog");
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const events = posts
    .filter((post) => {
      if (!isPublishedBlogEntry(post, now)) return false;
      const publishTs = new Date(String(post.data.publishDate)).getTime();
      if (Number.isNaN(publishTs) || publishTs < fourteenDaysAgo.getTime()) return false;
      return post.data.socialShare === true || post.data.instagramShare === true;
    })
    .sort((a, b) => {
      const da = new Date(String(a.data.publishDate || 0)).getTime();
      const db = new Date(String(b.data.publishDate || 0)).getTime();
      return da - db;
    })
    .flatMap((post) => {
      const slug = String(post.data.slug || post.id || "");
      const canonicalUrl = buildCanonicalPostUrl(slug);
      const socialHashtags = buildSocialHashtags(
        post.data.socialHashtags,
        post.data.tags,
      );
      const socialHashtagsText = formatSocialHashtags(socialHashtags);
      const baseCopy =
        typeof post.data.description === "string" ? post.data.description.trim() : "";
      const copy = [baseCopy, socialHashtagsText].filter(Boolean).join("\n\n");
      const publishDate = post.data.publishDate
        ? new Date(String(post.data.publishDate)).toISOString()
        : "";
      const variant = "launch";
      const campaign = `${cleanSlug(slug).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "post"}_${variant}`;

      const channels: SocialChannel[] = [];
      if (post.data.socialShare === true) channels.push("facebook");
      if (post.data.instagramShare === true) channels.push("instagram");

      return channels.map((channel) => ({
        eventId: buildSocialEventId(slug, channel, post.data.publishDate, variant),
        channel,
        variant,
        state: "ready",
        title: post.data.title || "",
        copy,
        canonicalUrl,
        url: buildTrackedPostUrl(canonicalUrl, channel, campaign, variant),
        image: normalizeImage(
          channel,
          post.data.instagramImage,
          post.data.image,
          post.data.coverImage,
        ),
        category: post.data.category || "",
        tags: Array.isArray(post.data.tags) ? post.data.tags : [],
        socialHashtags,
        socialHashtagsText,
        utmSource: channel,
        utmMedium: "social",
        utmCampaign: campaign,
        utmContent: variant,
        publishDate,
        notBefore: publishDate,
      }));
    })
    .slice(0, 100);

  return new Response(JSON.stringify(events), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
};
