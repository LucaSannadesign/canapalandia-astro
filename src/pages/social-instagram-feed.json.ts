import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { isPublishedBlogEntry } from "../lib/blogVisibility";
import { buildSocialHashtags, formatSocialHashtags } from "../lib/socialHashtags";
import {
  buildCanonicalPostUrl,
  buildPlatformCopy,
  buildSocialCampaign,
  buildSocialEventId,
  buildTrackedPostUrl,
  toAbsoluteUrl,
} from "../lib/socialDistribution";

function normalizeImage(instagramImage?: unknown, image?: unknown, coverImage?: unknown): string {
  const candidate =
    (typeof instagramImage === "string" && instagramImage.trim()) ||
    (typeof image === "string" && image.trim()) ||
    (typeof coverImage === "string" && coverImage.trim()) ||
    "";
  return toAbsoluteUrl(candidate);
}

export const GET: APIRoute = async () => {
  const posts = await getCollection("blog");
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const items = posts
    .filter((post) => {
      if (!isPublishedBlogEntry(post, now)) return false;
      if (post.data.instagramShare !== true) return false;
      const publishTs = new Date(String(post.data.publishDate)).getTime();
      return !Number.isNaN(publishTs) && publishTs >= sixMonthsAgo.getTime();
    })
    .sort((a, b) => {
      const da = new Date(String(a.data.publishDate || 0)).getTime();
      const db = new Date(String(b.data.publishDate || 0)).getTime();
      return db - da;
    })
    // Compatibilità con lo scenario Make esistente: espone ancora un solo item.
    // La nuova coda multi-item è /social-queue-feed.json.
    .slice(0, 1)
    .map((post) => {
      const slug = String(post.data.slug || post.id || "");
      const socialHashtags = buildSocialHashtags(post.data.socialHashtags, post.data.tags);
      const socialHashtagsText = formatSocialHashtags(socialHashtags);
      const canonicalUrl = buildCanonicalPostUrl(slug);
      const variant = "launch";
      const campaign = buildSocialCampaign(slug, post.data.socialCampaign, variant);

      return {
        eventId: buildSocialEventId(slug, "instagram", post.data.publishDate, variant),
        channel: "instagram",
        variant,
        title: post.data.title || "",
        // Mantiene il campo description per la compatibilità con il mapping Make corrente.
        description: buildPlatformCopy(post.data, "instagram", socialHashtagsText),
        canonicalUrl,
        url: buildTrackedPostUrl(canonicalUrl, "instagram", campaign, variant),
        image: normalizeImage(post.data.instagramImage, post.data.image, post.data.coverImage),
        category: post.data.category || "",
        tags: Array.isArray(post.data.tags) ? post.data.tags : [],
        socialHashtags,
        socialHashtagsText,
        utmSource: "instagram",
        utmMedium: "social",
        utmCampaign: campaign,
        utmContent: variant,
        publishDate: post.data.publishDate
          ? new Date(String(post.data.publishDate)).toISOString()
          : "",
      };
    });

  return new Response(JSON.stringify(items), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
