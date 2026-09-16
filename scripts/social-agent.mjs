#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const RSS_URL = process.env.RSS_URL || "https://canapalandia.com/rss.xml";
const STATE_FILE = process.env.STATE_FILE || ".cache/social-share.json";
const RECENT_POSTS_WINDOW_MONTHS = Number(process.env.RECENT_POSTS_WINDOW_MONTHS || 6);
const MIN_HOURS_BETWEEN_ARTICLES = Number(process.env.MIN_HOURS_BETWEEN_ARTICLES || 47);
const DRY_RUN = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
const SUPPORTED_CHANNELS = new Set(["facebook", "instagram", "linkedin"]);
const CHANNELS = String(process.env.SOCIAL_CHANNELS || "facebook,instagram,linkedin")
  .split(",")
  .map((channel) => channel.trim().toLowerCase())
  .filter(Boolean);

if (!CHANNELS.length) throw new Error("SOCIAL_CHANNELS must contain at least one channel");
for (const channel of CHANNELS) {
  if (!SUPPORTED_CHANNELS.has(channel)) throw new Error(`Unsupported social channel: ${channel}`);
}

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

function extractTagAttribute(tag, attribute) {
  const re = new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, "i");
  return decodeXml(tag.match(re)?.[2]?.trim() || "");
}

function extractAlternateHref(html, hreflang) {
  const tags = String(html).match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const rel = extractTagAttribute(tag, "rel").toLowerCase().split(/\s+/);
    if (!rel.includes("alternate")) continue;
    const lang = extractTagAttribute(tag, "hreflang").toLowerCase();
    if (lang !== hreflang.toLowerCase()) continue;
    const href = extractTagAttribute(tag, "href");
    if (href) return href;
  }
  return "";
}

function extractHeading(html) {
  const h1 = String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
  return cleanText(decodeXml(h1), 300);
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

async function postFromPage(link, html = "", fallback = {}) {
  const pageHtml = html || await fetchText(link, "text/html,application/xhtml+xml");
  const title = extractHeading(pageHtml) || cleanText(extractMetaContent(pageHtml, "og:title"), 300);
  const description = cleanText(
    extractMetaContent(pageHtml, "og:description") || extractMetaContent(pageHtml, "description"),
  );
  const publishedRaw = extractMetaContent(pageHtml, "article:published_time");

  return {
    title: title || fallback.title || "Articolo",
    description: description || fallback.description || "",
    link,
    slug: extractSlug(link),
    pubDate: publishedRaw || fallback.pubDate || "",
    dateISO: toISODate(publishedRaw) || fallback.dateISO || "",
  };
}

async function resolveSocialContext(post, posts) {
  const selectedHtml = await fetchText(post.link, "text/html,application/xhtml+xml");
  const italianAlternate = extractAlternateHref(selectedHtml, "it");
  const englishAlternate = extractAlternateHref(selectedHtml, "en");

  let primaryPost = post;
  let englishPost = null;
  let primaryHtml = selectedHtml;

  if (italianAlternate && englishAlternate) {
    const italianLink = new URL(italianAlternate, post.link).toString();
    const englishLink = new URL(englishAlternate, post.link).toString();
    const italianSlug = extractSlug(italianLink);
    const englishSlug = extractSlug(englishLink);

    if (italianSlug && englishSlug && italianSlug !== englishSlug) {
      const italianFromFeed = posts.find((item) => item.slug === italianSlug);
      const englishFromFeed = posts.find((item) => item.slug === englishSlug);

      if (post.slug === italianSlug) {
        primaryPost = italianFromFeed || post;
        primaryHtml = selectedHtml;
      } else {
        primaryPost = italianFromFeed || await postFromPage(italianLink, "", post);
        primaryHtml = await fetchText(italianLink, "text/html,application/xhtml+xml");
      }

      if (post.slug === englishSlug) {
        englishPost = englishFromFeed || post;
      } else {
        englishPost = englishFromFeed || await postFromPage(englishLink);
      }
    }
  }

  const image = extractMetaContent(primaryHtml, "og:image");
  if (!image) throw new Error(`No og:image found for ${primaryPost.link}`);

  return {
    primaryPost,
    englishPost,
    image: new URL(image, primaryPost.link).toString(),
  };
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

function wasCompletedArticle(state, post) {
  return state.completedArticles.some((item) => item.slug === post.slug);
}

function hasRecordedChannelEvent(state, post, channel) {
  if (!post) return false;
  return state.sentEvents.some(
    (event) => event.channel === channel && (event.slug === post.slug || event.eventId === eventId(post, channel)),
  );
}

function pairedChannelComplete(state, primaryPost, englishPost, channel) {
  return hasRecordedChannelEvent(state, primaryPost, channel) || hasRecordedChannelEvent(state, englishPost, channel);
}

function pairedArticleComplete(state, primaryPost, englishPost) {
  return CHANNELS.every((channel) => pairedChannelComplete(state, primaryPost, englishPost, channel));
}

function knownComplete(state, post) {
  return (
    Boolean(post) &&
    (wasCompletedArticle(state, post) || CHANNELS.every((channel) => hasRecordedChannelEvent(state, post, channel)))
  );
}

function markCompletedAliases(state, primaryPost, englishPost, completedAt) {
  let changed = false;
  for (const item of [primaryPost, englishPost].filter(Boolean)) {
    if (state.completedArticles.some((entry) => entry.slug === item.slug)) continue;
    state.completedArticles.push({ slug: item.slug, link: item.link, completedAt });
    changed = true;
  }
  return changed;
}

function withUtm(link, channel) {
  const url = new URL(link);
  url.searchParams.set("utm_source", channel);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "auto_share_6m");
  return url.toString();
}

function normalizeTopicText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HASHTAG_RULES = [
  { re: /bioplastic|biocomposit/, tags: ["#Bioplastiche", "#Biocompositi"] },
  { re: /sostenibil|ecolog|economia circolare|ambiente/, tags: ["#Sostenibilita"] },
  { re: /cbd|cannabidiolo/, tags: ["#CBD", "#Cannabidiolo"] },
  { re: /olio di semi|semi di canapa|aliment|nutriz|proteine|omega/, tags: ["#SemiDiCanapa", "#CanapaAlimentare"] },
  { re: /cannabis medica|cannabis terapeut|farmac|medic/, tags: ["#CannabisMedica"] },
  { re: /germania|tedesc/, tags: ["#Germania"] },
  { re: /italia|italian/, tags: ["#Italia"] },
  { re: /unione europea|cgue|corte ue|europa/, tags: ["#UnioneEuropea"] },
  { re: /legge|normativ|decreto|sentenza|tribunal|consiglio di stato|legal/, tags: ["#NormativaCannabis"] },
  { re: /coltiv|agricolt|canapa industriale/, tags: ["#CanapaIndustriale", "#AgricolturaSostenibile"] },
  { re: /tessil|fibra|moda/, tags: ["#TessileSostenibile"] },
  { re: /cosmetic|pelle|crema/, tags: ["#CosmesiNaturale"] },
  { re: /mercat|import|export|tonnellate|vendite/, tags: ["#MercatoCannabis"] },
  { re: /controll|etichett|claim|responsabilita consumatore/, tags: ["#ConsumatoriConsapevoli"] },
];

function dynamicHashtags(post) {
  const text = normalizeTopicText(`${post.title} ${post.description} ${post.slug}`);
  const topics = [];

  for (const rule of HASHTAG_RULES) {
    if (!rule.re.test(text)) continue;
    for (const tag of rule.tags) {
      if (!topics.includes(tag)) topics.push(tag);
      if (topics.length >= 4) break;
    }
    if (topics.length >= 4) break;
  }

  if (topics.length < 2 && /canapa|hemp/.test(text) && !topics.includes("#Canapa")) topics.push("#Canapa");
  if (topics.length < 2 && /cannabis/.test(text) && !topics.includes("#Cannabis")) topics.push("#Cannabis");
  if (topics.length < 2 && !topics.includes("#Canapa")) topics.push("#Canapa");

  return ["#Canapalandia", ...topics.slice(0, 4)].join(" ");
}

function buildPayload(post, image, channel, englishPost = null) {
  const description = cleanText(post.description);
  const englishDescription = cleanText(englishPost?.description);
  const hashtags = dynamicHashtags(post);

  const italianFacebook = [
    "🇮🇹 Italiano",
    post.title,
    description,
    `Leggi l’articolo: ${withUtm(post.link, "facebook")}`,
  ].filter(Boolean);
  const italianInstagram = [
    "🇮🇹 Italiano",
    post.title,
    description,
    "Articolo completo su Canapalandia:",
    withUtm(post.link, "instagram"),
  ].filter(Boolean);
  const italianLinkedIn = [
    "🇮🇹 Italiano",
    post.title,
    description,
    `Approfondisci su Canapalandia: ${withUtm(post.link, "linkedin")}`,
  ].filter(Boolean);

  const englishFacebook = englishPost
    ? [
        "🇬🇧 English",
        englishPost.title,
        englishDescription,
        `Read the article: ${withUtm(englishPost.link, "facebook")}`,
      ].filter(Boolean)
    : [];
  const englishInstagram = englishPost
    ? [
        "🇬🇧 English",
        englishPost.title,
        englishDescription,
        "Full article on Canapalandia:",
        withUtm(englishPost.link, "instagram"),
      ].filter(Boolean)
    : [];
  const englishLinkedIn = englishPost
    ? [
        "🇬🇧 English",
        englishPost.title,
        englishDescription,
        `Read more on Canapalandia: ${withUtm(englishPost.link, "linkedin")}`,
      ].filter(Boolean)
    : [];

  const facebookCopy = englishPost
    ? [italianFacebook.join("\n\n"), englishFacebook.join("\n\n")].join("\n\n")
    : [post.title, description, `Leggi l’articolo: ${withUtm(post.link, "facebook")}`]
        .filter(Boolean)
        .join("\n\n");

  const instagramCaption = englishPost
    ? [italianInstagram.join("\n\n"), englishInstagram.join("\n\n"), hashtags].join("\n\n")
    : [
        post.title,
        description,
        "Articolo completo su Canapalandia:",
        withUtm(post.link, "instagram"),
        hashtags,
      ].filter(Boolean).join("\n\n");

  const linkedinCopy = englishPost
    ? [italianLinkedIn.join("\n\n"), englishLinkedIn.join("\n\n"), hashtags].join("\n\n")
    : [
        post.title,
        description,
        `Approfondisci su Canapalandia: ${withUtm(post.link, "linkedin")}`,
        hashtags,
      ].filter(Boolean).join("\n\n");

  const contentByChannel = {
    facebook: facebookCopy,
    instagram: instagramCaption,
    linkedin: linkedinCopy,
  };
  const content = contentByChannel[channel];
  if (!content?.trim()) throw new Error(`Empty social content for ${channel}`);

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
    hashtags,
    content,
    facebookCopy,
    instagramCaption,
    linkedinCopy,
    languageMode: englishPost ? "it-en" : "it",
    englishLink: englishPost?.link || "",
    englishSlug: englishPost?.slug || "",
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

  const incomplete = recent.find(
    (post) => trackedArticle(state, post) && !articleComplete(state, post) && !wasCompletedArticle(state, post),
  );
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

  const next = recent.find(
    (post) => !wasCompletedArticle(state, post) && !articleComplete(state, post) && !trackedArticle(state, post),
  );
  return { post: next || null, retry: false };
}

async function main() {
  console.log(`[social-agent] Starting${DRY_RUN ? " (dry-run)" : ""}...`);
  console.log(`[social-agent] Channels: ${CHANNELS.join(", ")}`);
  const xml = await fetchText(RSS_URL, "application/rss+xml,application/xml,text/xml");
  const posts = parseFeed(xml);
  console.log(`[social-agent] Feed posts loaded: ${posts.length}`);

  const state = loadState();
  const now = new Date();
  let context = null;

  for (let attempt = 0; attempt < posts.length; attempt += 1) {
    const { post: selectedPost } = choosePost(posts, state, now);
    if (!selectedPost) {
      console.log("[social-agent] no-op: no article ready for social publishing");
      return;
    }

    const resolved = await resolveSocialContext(selectedPost, posts);
    const { primaryPost, englishPost } = resolved;

    if (englishPost && (knownComplete(state, primaryPost) || knownComplete(state, englishPost))) {
      const completedAt =
        state.completedArticles.find((item) => item.slug === primaryPost.slug || item.slug === englishPost.slug)
          ?.completedAt || new Date().toISOString();
      const changed = markCompletedAliases(state, primaryPost, englishPost, completedAt);
      if (changed) saveState(state);
      console.log(
        `[social-agent] Skipping translated duplicate already completed: ${primaryPost.slug} + ${englishPost.slug}`,
      );
      continue;
    }

    context = resolved;
    break;
  }

  if (!context) {
    console.log("[social-agent] no-op: only completed translation aliases remained");
    return;
  }

  const { primaryPost: post, englishPost, image } = context;
  console.log(`[social-agent] Selected: ${post.title}`);
  console.log(`[social-agent] Image: ${image}`);
  console.log(
    englishPost
      ? `[social-agent] Bilingual pair: ${post.slug} + ${englishPost.slug}`
      : `[social-agent] No verified English alternate for ${post.slug}; publishing Italian only`,
  );

  const pendingChannels = CHANNELS.filter(
    (channel) => !pairedChannelComplete(state, post, englishPost, channel),
  );
  console.log(`[social-agent] Pending channels: ${pendingChannels.join(", ")}`);

  if (DRY_RUN) {
    for (const channel of pendingChannels) {
      const payload = buildPayload(post, image, channel, englishPost);
      console.log(`[social-agent] DRY RUN ${channel}: ${JSON.stringify(payload)}`);
    }
    return;
  }

  for (const channel of pendingChannels) {
    const payload = buildPayload(post, image, channel, englishPost);
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

  if (pairedArticleComplete(state, post, englishPost)) {
    const completedAt = new Date().toISOString();
    state.lastCompletedAt = completedAt;
    markCompletedAliases(state, post, englishPost, completedAt);
    saveState(state);
    console.log(
      `[social-agent] Completed on ${CHANNELS.join(" + ")}: ${post.slug}${englishPost ? ` + ${englishPost.slug}` : ""}`,
    );
  }
}

main().catch((error) => {
  console.error(`[social-agent] ERROR: ${error?.message || error}`);
  process.exit(1);
});
