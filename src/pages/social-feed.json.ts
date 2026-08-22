import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { isPublishedBlogEntry } from "../lib/blogVisibility";
import { buildSocialHashtags, formatSocialHashtags } from "../lib/socialHashtags";

const siteUrl = "https://canapalandia.com";

function toAbsoluteUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.startsWith("/") ? value : `/${value}`;
  return `${siteUrl}${normalized}`;
}

function normalizeImage(image?: unknown, coverImage?: unknown): string {
  const candidate =
    (typeof image === "string" && image.trim()) ||
    (typeof coverImage === "string" && coverImage.trim()) ||
    "";
  if (!candidate) return "";
  return toAbsoluteUrl(candidate);
}

function normalizePostUrl(slug: string): string {
  const clean = slug.trim().replace(/^\/+|\/+$/g, "");
  return `${siteUrl}/${clean}/`;
}

export const GET: APIRoute = async () => {
  const posts = await getCollection("blog");
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const items = posts
    .filter((post) => {
      if (!isPublishedBlogEntry(post, now)) return false;
      if (post.data.socialShare !== true) return false;
      const publishTs = new Date(String(post.data.publishDate)).getTime();
      return !Number.isNaN(publishTs) && publishTs >= sevenDaysAgo.getTime();
    })
    .sort((a, b) => {
      const da = new Date(String(a.data.publishDate || 0)).getTime();
      const db = new Date(String(b.data.publishDate || 0)).getTime();
      return db - da;
    })
    .slice(0, 1)
    .map((post) => {
      const slug = post.data.slug || post.id;
      const socialHashtags = buildSocialHashtags(post.data.socialHashtags, post.data.tags);
      return {
        title: post.data.title || "",
        description: post.data.description || "",
        url: normalizePostUrl(String(slug || "")),
        image: normalizeImage(post.data.image, post.data.coverImage),
        category: post.data.category || "",
        tags: Array.isArray(post.data.tags) ? post.data.tags : [],
        socialHashtags,
        socialHashtagsText: formatSocialHashtags(socialHashtags),
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
