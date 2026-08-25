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
  type SocialChannel,
} from "../lib/socialDistribution";

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
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const events = posts
    .filter((post) => {
      if (!isPublishedBlogEntry(post, now)) return false;
      const publishTs = new Date(String(post.data.publishDate)).getTime();
      if (Number.isNaN(publishTs) || publishTs < thirtyDaysAgo.getTime()) return false;
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
      const publishDate = post.data.publishDate
        ? new Date(String(post.data.publishDate)).toISOString()
        : "";

      const channels: SocialChannel[] = [];
      if (post.data.socialShare === true) channels.push("facebook");
      if (post.data.instagramShare === true) channels.push("instagram");

      return channels.map((channel) => {
        const variant = "launch";
        const campaign = buildSocialCampaign(
          slug,
          post.data.socialCampaign,
          variant,
        );

        return {
          eventId: buildSocialEventId(
            slug,
            channel,
            post.data.publishDate,
            variant,
          ),
          channel,
          variant,
          state: "ready",
          title: post.data.title || "",
          copy: buildPlatformCopy(post.data, channel, socialHashtagsText),
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
        };
      });
    })
    .slice(0, 100);

  return new Response(JSON.stringify(events), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
};
