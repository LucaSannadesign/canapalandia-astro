import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { isPublishedBlogEntry } from "../lib/blogVisibility";
import { buildSocialHashtags, formatSocialHashtags } from "../lib/socialHashtags";
import {
  buildCanonicalPostUrl,
  buildPlatformCopy,
  buildSocialCampaign,
  buildTrackedPostUrl,
  toAbsoluteUrl,
} from "../lib/socialDistribution";

function normalizeImage(image?: unknown, coverImage?: unknown): string {
  const candidate =
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
      if (post.data.socialEvergreen !== true) return false;
      const publishTs = new Date(String(post.data.publishDate)).getTime();
      return !Number.isNaN(publishTs) && publishTs >= sixMonthsAgo.getTime();
    })
    .sort((a, b) => {
      const da = new Date(String(a.data.publishDate || 0)).getTime();
      const db = new Date(String(b.data.publishDate || 0)).getTime();
      return db - da;
    })
    .slice(0, 1)
    .map((post) => {
      const slug = String(post.data.slug || post.id || "");
      const socialHashtags = buildSocialHashtags(post.data.socialHashtags, post.data.tags);
      const socialHashtagsText = formatSocialHashtags(socialHashtags);
      const canonicalUrl = buildCanonicalPostUrl(slug);
      const variant = "evergreen";
      const campaign = buildSocialCampaign(slug, post.data.socialCampaign, variant);

      return {
        // Non è un eventId definitivo: ogni rilancio evergreen deve essere creato nel Diario
        // con un proprio ID (es. EV1, EV2...) per consentire più pubblicazioni nel tempo.
        contentKey: slug,
        channel: "facebook",
        variant,
        title: post.data.title || "",
        description: buildPlatformCopy(post.data, "facebook", socialHashtagsText),
        canonicalUrl,
        url: buildTrackedPostUrl(canonicalUrl, "facebook", campaign, variant),
        image: normalizeImage(post.data.image, post.data.coverImage),
        category: post.data.category || "",
        tags: Array.isArray(post.data.tags) ? post.data.tags : [],
        socialHashtags,
        socialHashtagsText,
        utmSource: "facebook",
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
