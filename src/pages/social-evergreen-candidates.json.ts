import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { isPublishedBlogEntry } from "../lib/blogVisibility";
import {
  ageInDays,
  getAutopilotPolicy,
  getAutopilotState,
  getBaseAutopilotScore,
  getEffectiveContentDate,
} from "../lib/socialAutopilot";
import {
  buildCanonicalPostUrl,
  toAbsoluteUrl,
} from "../lib/socialDistribution";

function normalizeImage(image?: unknown, coverImage?: unknown): string {
  const candidate =
    (typeof image === "string" && image.trim()) ||
    (typeof coverImage === "string" && coverImage.trim()) ||
    "";
  return toAbsoluteUrl(candidate);
}

function normalizeInstagramImage(
  instagramImage?: unknown,
  image?: unknown,
  coverImage?: unknown,
): string {
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

  const candidates = posts
    .filter((post) => {
      if (!isPublishedBlogEntry(post, now)) return false;
      if (post.data.socialEvergreen !== true) return false;
      const effectiveDate = getEffectiveContentDate(
        post.data.publishDate,
        post.data.updatedDate,
      );
      return Boolean(effectiveDate && effectiveDate >= sixMonthsAgo);
    })
    .map((post) => {
      const slug = String(post.data.slug || post.id || "");
      const effectiveDate =
        getEffectiveContentDate(post.data.publishDate, post.data.updatedDate) ||
        post.data.publishDate ||
        now;
      const policy = getAutopilotPolicy({
        slug,
        title: post.data.title,
        category: post.data.category,
        tags: post.data.tags,
      });
      const ageDays = ageInDays(effectiveDate, now);
      const autopilotState = getAutopilotState(policy, effectiveDate, now);
      const canonicalUrl = buildCanonicalPostUrl(slug);

      return {
        contentKey: slug,
        title: post.data.title || "",
        description: post.data.description || "",
        canonicalUrl,
        image: normalizeImage(post.data.image, post.data.coverImage),
        instagramImage: normalizeInstagramImage(
          post.data.instagramImage,
          post.data.image,
          post.data.coverImage,
        ),
        category: post.data.category || "",
        tags: Array.isArray(post.data.tags) ? post.data.tags : [],
        publishDate: post.data.publishDate
          ? new Date(String(post.data.publishDate)).toISOString()
          : "",
        updatedDate: post.data.updatedDate
          ? new Date(String(post.data.updatedDate)).toISOString()
          : "",
        effectiveDate: new Date(String(effectiveDate)).toISOString(),
        ageDays,
        contentClass: policy.contentClass,
        autopilotState,
        eligibleForAutomaticRepost: autopilotState === "eligible",
        freshnessDays: policy.freshnessDays,
        cooldownDays: policy.cooldownDays,
        maxRepostsSixMonths: policy.maxRepostsSixMonths,
        requiresFreshnessCheck: policy.requiresFreshnessCheck,
        allowedAngles: policy.allowedAngles,
        basePriorityScore: getBaseAutopilotScore(policy, effectiveDate, now),
      };
    })
    .sort((a, b) => {
      const stateRank = { eligible: 0, "review-required": 1, blocked: 2 } as const;
      const stateDiff = stateRank[a.autopilotState] - stateRank[b.autopilotState];
      if (stateDiff !== 0) return stateDiff;
      if (b.basePriorityScore !== a.basePriorityScore) {
        return b.basePriorityScore - a.basePriorityScore;
      }
      return a.title.localeCompare(b.title, "it");
    });

  return new Response(JSON.stringify(candidates), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
