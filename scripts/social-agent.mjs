#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const RSS_URL = process.env.RSS_URL || "https://canapalandia.com/rss.xml";
const STATE_FILE = process.env.STATE_FILE || ".cache/social-share.json";
const RECENT_POSTS_WINDOW_MONTHS = Number(process.env.RECENT_POSTS_WINDOW_MONTHS || 6);
const MIN_HOURS_BETWEEN_ARTICLES = Number(process.env.MIN_HOURS_BETWEEN_ARTICLES || 47);
const DRY_RUN = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
const CHANNELS = ["facebook", "instagram"];

function cleanText(value, max = 240) {
  const text = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'");
}

function toISODate(raw) {
  const date = new Date(String(raw || ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function extractSlug(link) {
  try {
    const url = new URL(link);
    return url.pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return "";
  }
}

function parseFeed(xml) {
  const items = [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  if (!items.length) throw new Error("RSS feed has no <item> entries");

  return items
    .map((match) => {
      const item = match[1];
      const pick = (re) => decodeXml(item.match(re)?.[1]?.trim() || "");
      const title = pick(/<title>([\s\S]*?)<\/title>/i);
      const link = pick(/<link>([\s\S]*?)<\/link>/i);
      const pubDate = pick(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      const description = pick(/<description>([\s\S]*?)<\/description>/i);
      if (!title || !link) return null;
      return {
        title: cleanText(title, 300),
        link,
        pubDate,
        dateISO: toISODate(pubDate),
        description: cleanText(description),
        slug: extractSlug(link),
      };
    })
    .filter(Boolean);
}

function extractMetaContent(html, key) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const property = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (property?.toLowerCase() !== key.toLowerCase()) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
    if (content) return decodeXml(content.trim());
  }
  return "";
}

async function fetchText(url, accept) {
  const response = await fetch(url, {
    headers: {
      Accept: accept,
      "User-Agent": "Canapalandia-SocialAgent/1.0",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
  return response.text();
}

async function resolveImage(post) {
  const html = await fetchText(post.link, "text/html,application/xhtml+xml");
  const image = extractMetaContent(html, "og:image");
  if (!image) throw new Error(`No og:image found for ${post.link}`);
  return new URL(image, post.link).toString();
}

function statePath() {
  return path.resolve(process.cwd(), STATE_FILE);
}

function loadState() {
  try {
    const raw = fs.readFileSync(statePath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      lastCompletedAt: parsed.lastCompletedAt || "",
      sentEvents: Array.isArray(parsed.sentEvents) ? parsed.sentEvents : [],
      completedArticles: Array.isArray(parsed.completedArticles) ? parsed.completedArticles : [],
    };
  } catch {
    return { version: 1, lastCompletedAt: "", sentEvents: [], completedArticles: [] };
  }
}

function saveState(state) {
  const target = statePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(state, null, 2), "utf8");
  console.log(`[social-agent] State saved: ${target}`);
}

function dayStamp(post) {
  const date = post.dateISO ? new Date(post.dateISO) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10).replaceAll("-", "")
    : date.toISOString().slice(0, 10).replaceAll("-", "");
}

function eventId(post, channel) {
  const slug = (post.slug || "post").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `SOCIAL-${dayStamp(post)}-${channel.toUpperCase()}-${slug}`;
}

function hasEvent(state, post, channel) {
  const id = eventId(post, channel);
  return state.sentEvents.some((event) => event.eventId === id);
}

function articleComplete(state, post) {
  return CHANNELS.every((channel) => hasEvent(state, post, channel));
}

function trackedArticle(state, post) {
  return CHANNELS.some((channel) => hasEvent(state, post, channel));
}

function withUtm(link, channel) {
  const url = new URL(link);
  url.searchParams.set("utm_source", channel);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "auto_share_6m");
  return url.toString();
}

function buildPayload(post, image, channel) {
  const description = cleanText(post.description);
  const facebookCopy = [
    post.title,
    description,
    `Leggi l’articolo: ${withUtm(post.link, "facebook")}`,
  ].filter(Boolean).join("\n\n");

  const instagramCaption = [
    post.title,
    description,
    "Articolo completo su Canapalandia:",
    withUtm(post.link, "instagram"),
    "#Canapalandia #Canapa #Cannabis",
  ].filter(Boolean).join("\n\n");

  // `content` is the canonical text field consumed by downstream Make modules.
  // Keep the channel-specific fields for backward compatibility with the
  // existing Facebook/Instagram routes.
  const content = channel === "instagram" ? instagramCaption : facebookCopy;
  if (!content.trim()) throw new Error(`Empty social content for ${channel}`);

  return {
    eventId: eventId(post, channel),
    channel,
    title: post.title,
    description,
    link: post.link,
    slug: post.slug,
    dateISO: post.dateISO,
    pubDate: post.pubDate,
    image,
    content,
    facebookCopy,
    instagramCaption,
    source: "github-actions-social-agent",
    site: "canapalandia",
  };
}

async function notifyMake(payload) {
  if (!MAKE_WEBHOOK_URL) throw new Error("MAKE_WEBHOOK_URL is not set");
  const response = await fetch(MAKE_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Make webhook error ${response.status}: ${text.slice(0, 300)}`);
  console.log(`[social-agent] Make accepted ${payload.eventId}: HTTP ${response.status}`);
}

function choosePost(posts, state, now) {
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - RECENT_POSTS_WINDOW_MONTHS);

  const recent = posts
    .filter((post) => {
      if (!post.dateISO) return false;
      const date = new Date(post.dateISO);
      return !Number.isNaN(date.getTime()) && date >= sixMonthsAgo && date <= now;
    })
    .sort((a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime());

  console.log(`[social-agent] Recent posts in ${RECENT_POSTS_WINDOW_MONTHS} months: ${recent.length}`);

  const incomplete = recent.find((post) => trackedArticle(state, post) && !articleComplete(state, post));
  if (incomplete) {
    console.log(`[social-agent] Resuming partially published article: ${incomplete.slug}`);
    return { post: incomplete, retry: true };
  }

  if (state.lastCompletedAt) {
    const last = new Date(state.lastCompletedAt);
    if (!Number.isNaN(last.getTime())) {
      const hours = (now.getTime() - last.getTime()) / 3_600_000;
      if (hours < MIN_HOURS_BETWEEN_ARTICLES) {
        console.log(`[social-agent] no-op: only ${hours.toFixed(1)}h since last completed article`);
        return { post: null, retry: false };
      }
    }
  }

  const next = recent.find((post) => !articleComplete(state, post) && !trackedArticle(state, post));
  return { post: next || null, retry: false };
}

async function main() {
  console.log(`[social-agent] Starting${DRY_RUN ? " (dry-run)" : ""}...`);
  const xml = await fetchText(RSS_URL, "application/rss+xml,application/xml,text/xml");
  const posts = parseFeed(xml);
  console.log(`[social-agent] Feed posts loaded: ${posts.length}`);

  const state = loadState();
  const now = new Date();
  const { post } = choosePost(posts, state, now);
  if (!post) {
    console.log("[social-agent] no-op: no article ready for social publishing");
    return;
  }

  const image = await resolveImage(post);
  console.log(`[social-agent] Selected: ${post.title}`);
  console.log(`[social-agent] Image: ${image}`);

  const pendingChannels = CHANNELS.filter((channel) => !hasEvent(state, post, channel));
  console.log(`[social-agent] Pending channels: ${pendingChannels.join(", ")}`);

  if (DRY_RUN) {
    for (const channel of pendingChannels) {
      const payload = buildPayload(post, image, channel);
      console.log(`[social-agent] DRY RUN ${channel}: ${JSON.stringify(payload)}`);
    }
    return;
  }

  for (const channel of pendingChannels) {
    const payload = buildPayload(post, image, channel);
    await notifyMake(payload);
    state.sentEvents.push({
      eventId: payload.eventId,
      channel,
      slug: post.slug,
      link: post.link,
      sentAt: new Date().toISOString(),
    });
    saveState(state);
  }

  if (articleComplete(state, post)) {
    const completedAt = new Date().toISOString();
    state.lastCompletedAt = completedAt;
    if (!state.completedArticles.some((item) => item.slug === post.slug)) {
      state.completedArticles.push({ slug: post.slug, link: post.link, completedAt });
    }
    saveState(state);
    console.log(`[social-agent] Completed on Facebook + Instagram: ${post.slug}`);
  }
}

main().catch((error) => {
  console.error(`[social-agent] ERROR: ${error?.message || error}`);
  process.exit(1);
});
