#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const RSS_URL = process.env.RSS_URL || "https://canapalandia.com/rss.xml";
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const STATE_FILE = process.env.STATE_FILE || ".cache/social-agent-6m.json";
const RECENT_POSTS_WINDOW_MONTHS = Number(process.env.RECENT_POSTS_WINDOW_MONTHS || 6);
const MIN_HOURS_BETWEEN_POSTS = Number(process.env.MIN_HOURS_BETWEEN_POSTS || 47);
const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";

function decodeXml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value = "") {
  return decodeXml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDescription(value = "") {
  const text = stripHtml(value);
  return text.length > 260 ? `${text.slice(0, 257)}...` : text;
}

function slugFromLink(link) {
  try {
    const parts = new URL(link).pathname.split("/").filter(Boolean);
    return parts.at(-1) || "post";
  } catch {
    return "post";
  }
}

function safeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((match) => {
      const item = match[1];
      const title = decodeXml(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").trim();
      const link = decodeXml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
      const pubDate = decodeXml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "").trim();
      const description = decodeXml(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "").trim();
      const date = safeDate(pubDate);
      if (!title || !link || !date) return null;
      return {
        title,
        link,
        slug: slugFromLink(link),
        pubDate,
        dateISO: date.toISOString(),
        description,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
}

function defaultState() {
  return {
    version: 1,
    lastCompletedPostAt: "",
    sentEvents: {},
  };
}

function loadState() {
  try {
    const file = path.resolve(process.cwd(), STATE_FILE);
    if (!fs.existsSync(file)) return defaultState();
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      ...defaultState(),
      ...parsed,
      sentEvents: parsed?.sentEvents && typeof parsed.sentEvents === "object" ? parsed.sentEvents : {},
    };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  const file = path.resolve(process.cwd(), STATE_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  console.log(`[social-agent] State saved: ${file}`);
}

function eventId(post, channel) {
  return `SOC-${post.dateISO.slice(0, 10).replaceAll("-", "")}-${channel.toUpperCase()}-${post.slug}`;
}

function withUtm(link, channel) {
  const url = new URL(link);
  url.searchParams.set("utm_source", channel);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "auto_share_6m");
  return url.toString();
}

function buildCopy(post) {
  const description = cleanDescription(post.description);
  const facebookUrl = withUtm(post.link, "facebook");
  const instagramUrl = withUtm(post.link, "instagram");
  return {
    facebookCopy: [post.title, description, `Leggi l’articolo: ${facebookUrl}`].filter(Boolean).join("\n\n"),
    instagramCaption: [post.title, description, `Articolo completo: ${instagramUrl}`, "#Canapalandia #Canapa #Cannabis"].filter(Boolean).join("\n\n"),
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Canapalandia-Social-Agent/1.0" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

function extractOgImage(html, pageUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return new URL(decodeXml(match[1]), pageUrl).toString();
  }
  throw new Error(`og:image non trovata per ${pageUrl}`);
}

async function notifyMake(payload) {
  if (!MAKE_WEBHOOK_URL) throw new Error("MAKE_WEBHOOK_URL non configurato");
  const response = await fetch(MAKE_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Make webhook ${response.status}: ${text}`);
  console.log(`[social-agent] Make OK (${payload.channel}): ${response.status}`);
}

async function main() {
  console.log(`[social-agent] Start${DRY_RUN ? " (DRY RUN)" : ""}`);
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - RECENT_POSTS_WINDOW_MONTHS);

  const rss = await fetchText(RSS_URL);
  const posts = parseRss(rss).filter((post) => {
    const date = new Date(post.dateISO);
    return date >= sixMonthsAgo && date <= now;
  });
  console.log(`[social-agent] Articoli ultimi ${RECENT_POSTS_WINDOW_MONTHS} mesi: ${posts.length}`);

  if (!posts.length) {
    console.log("[social-agent] no-op: nessun articolo eleggibile");
    return;
  }

  const state = loadState();
  let selected = posts.find((post) => {
    const fb = eventId(post, "facebook");
    const ig = eventId(post, "instagram");
    return Boolean(state.sentEvents[fb]) !== Boolean(state.sentEvents[ig]);
  });

  const isPartialResume = Boolean(selected);
  if (!selected) {
    if (state.lastCompletedPostAt) {
      const last = safeDate(state.lastCompletedPostAt);
      if (last) {
        const hours = (now - last) / 36e5;
        if (hours < MIN_HOURS_BETWEEN_POSTS) {
          console.log(`[social-agent] no-op: ultimo post completo ${hours.toFixed(1)}h fa (< ${MIN_HOURS_BETWEEN_POSTS}h)`);
          return;
        }
      }
    }

    selected = posts.find((post) => {
      const fb = eventId(post, "facebook");
      const ig = eventId(post, "instagram");
      return !state.sentEvents[fb] && !state.sentEvents[ig];
    });
  }

  if (!selected) {
    console.log("[social-agent] no-op: tutti gli articoli recenti risultano già condivisi");
    return;
  }

  console.log(`[social-agent] ${isPartialResume ? "Riprendo" : "Selezionato"}: ${selected.title}`);
  const html = await fetchText(selected.link);
  const image = extractOgImage(html, selected.link);
  const copy = buildCopy(selected);

  const channels = ["facebook", "instagram"];
  const pending = channels.filter((channel) => !state.sentEvents[eventId(selected, channel)]);

  for (const channel of pending) {
    const id = eventId(selected, channel);
    const payload = {
      eventId: id,
      channel,
      title: selected.title,
      description: cleanDescription(selected.description),
      link: selected.link,
      slug: selected.slug,
      dateISO: selected.dateISO,
      pubDate: selected.pubDate,
      image,
      facebookCopy: copy.facebookCopy,
      instagramCaption: copy.instagramCaption,
      source: "github-actions-social-agent-6m",
      site: "canapalandia",
    };

    if (DRY_RUN) {
      console.log(`[social-agent] DRY RUN ${channel}: ${JSON.stringify(payload, null, 2)}`);
      continue;
    }

    await notifyMake(payload);
    state.sentEvents[id] = new Date().toISOString();
    saveState(state);
  }

  if (!DRY_RUN) {
    const fbDone = state.sentEvents[eventId(selected, "facebook")];
    const igDone = state.sentEvents[eventId(selected, "instagram")];
    if (fbDone && igDone) {
      state.lastCompletedPostAt = new Date().toISOString();
      saveState(state);
      console.log("[social-agent] Post completato su Facebook + Instagram");
    }
  }
}

main().catch((error) => {
  console.error(`[social-agent] ERROR: ${error?.message || error}`);
  process.exit(1);
});
