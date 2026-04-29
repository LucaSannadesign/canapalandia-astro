#!/usr/bin/env node
/**
 * Auto-share script per Telegram
 * 
 * Legge RSS/Atom feed, verifica se ci sono nuovi post e li condivide su Telegram.
 * Usa GitHub Actions cache per deduplicazione.
 */

import fs from "node:fs";
import path from "node:path";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const RSS_URL = process.env.RSS_URL; // Se fornito, usa solo questo
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

// URL RSS da provare in ordine (se RSS_URL non è fornito)
// Primo candidato: /rss.xml (definito in src/pages/rss.xml.ts)
const RSS_CANDIDATES = [
  "https://canapalandia.com/rss.xml",
  "https://canapalandia.com/feed.xml",
  "https://canapalandia.com/rss/",
  "https://canapalandia.com/atom.xml",
];

// Path per state file (usato con GitHub Actions cache)
const STATE_FILE = process.env.STATE_FILE || ".cache/telegram-share.json";
const SHARE_MODE = process.env.SHARE_MODE || "repost";
const NEW_POST_WINDOW_HOURS = Number(process.env.NEW_POST_WINDOW_HOURS || 48);
const MIN_HOURS_BETWEEN_SHARES = Number(process.env.MIN_HOURS_BETWEEN_SHARES || 22);
const RECENT_POSTS_WINDOW_MONTHS = 6;
const TEMPORARY_EXCLUDED_SLUGS = {
  "25-aprile-canapa-liberazione-proibizionismo": "2026-05-12",
  "20-aprile-420-canapa-cannabis-italia-2026": "2026-05-12",
  "usa-riclassificano-cannabis-medica-schedule-iii": "2026-05-12",
};

/**
 * Prova a scaricare un feed e verifica che sia valido (contiene <rss o <feed)
 * Verifica anche che il content-type contenga "xml"
 */
async function tryFetchFeed(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Canapalandia-AutoShare/1.0",
      },
    });

    if (!response.ok) {
      return null;
    }

    // Verifica content-type (deve contenere "xml")
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("xml")) {
      return null;
    }

    const text = await response.text();
    
    // Verifica che contenga RSS o Atom feed
    if (!text.includes("<rss") && !text.includes("<feed")) {
      return null;
    }

    return text;
  } catch (error) {
    return null;
  }
}

/**
 * Trova il primo feed RSS/Atom valido
 */
async function findFeedUrl() {
  // Se RSS_URL è fornito, usa solo quello
  if (RSS_URL) {
    const xml = await tryFetchFeed(RSS_URL);
    if (xml) {
      return { url: RSS_URL, xml };
    }
    throw new Error(`RSS_URL provided but not accessible: ${RSS_URL}`);
  }

  // Altrimenti prova i candidati in ordine
  for (const url of RSS_CANDIDATES) {
    const xml = await tryFetchFeed(url);
    if (xml) {
      return { url, xml };
    }
  }

  throw new Error("No valid RSS/Atom feed found");
}

/**
 * Estrae slug da URL post
 */
function extractSlug(link) {
  try {
    const url = new URL(link);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  } catch {
    return "";
  }
}

/**
 * Normalizza data in ISO se possibile
 */
function toISODate(raw) {
  if (!raw) return "";
  try {
    const date = new Date(String(raw));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  } catch {
    return "";
  }
}

/**
 * Verifica se il post è pubblicabile in base a segnali presenti nel feed.
 * Esclude esplicitamente draft/non pubblicati quando questi campi compaiono.
 */
function isPublishedPost(post) {
  const haystack = `${post.title || ""} ${post.description || ""}`.toLowerCase();
  const hasDraftSignal = /\bdraft\b/.test(haystack) || /\bstatus:\s*draft\b/.test(haystack) || /\bstatus:\s*test\b/.test(haystack);
  return !hasDraftSignal;
}

/**
 * Ordina i post dal più recente al meno recente
 */
function sortByDateDesc(a, b) {
  const da = a.dateISO ? new Date(a.dateISO).getTime() : 0;
  const db = b.dateISO ? new Date(b.dateISO).getTime() : 0;
  return db - da;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function isTemporarilyExcluded(post, now) {
  if (!post?.slug) return false;
  const untilDay = TEMPORARY_EXCLUDED_SLUGS[post.slug];
  if (!untilDay) return false;
  return isoDay(now) <= untilDay;
}

/**
 * Parse RSS XML e estrae tutti i post
 */
function parseRSS(xml) {
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  if (!itemMatches.length) {
    throw new Error("RSS format: no <item> found");
  }

  const posts = itemMatches
    .map((match) => {
      const item = match[1];
      const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/) || item.match(/<updated>(.*?)<\/updated>/);
      const descMatch = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/) ||
                        item.match(/<content:encoded>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content:encoded>/);

      const title = titleMatch?.[1]?.trim() || "";
      const link = linkMatch?.[1]?.trim() || "";
      const pubDate = pubDateMatch?.[1]?.trim() || "";
      const description = descMatch?.[1]?.trim() || "";
      const dateISO = toISODate(pubDate);
      const slug = extractSlug(link);

      if (!title || !link) return null;
      return { title, link, pubDate, dateISO, description, slug };
    })
    .filter(Boolean);

  if (!posts.length) {
    throw new Error("RSS format: no valid post entries found");
  }

  return posts;
}

/**
 * Parse Atom XML e estrae tutti i post
 */
function parseAtom(xml) {
  const entryMatches = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
  if (!entryMatches.length) {
    throw new Error("Atom format: no <entry> found");
  }

  const posts = entryMatches
    .map((match) => {
      const entry = match[1];
      const titleMatch = entry.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
      const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/) || entry.match(/<link[^>]*>[\s\S]*?href=["']([^"']+)["']/);
      const updatedMatch = entry.match(/<updated>(.*?)<\/updated>/) || entry.match(/<published>(.*?)<\/published>/);
      const summaryMatch = entry.match(/<summary[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/summary>/) ||
                           entry.match(/<content[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content>/);

      const title = titleMatch?.[1]?.trim() || "";
      const link = linkMatch?.[1]?.trim() || "";
      const updated = updatedMatch?.[1]?.trim() || "";
      const summary = summaryMatch?.[1]?.trim() || "";
      const dateISO = toISODate(updated);
      const slug = extractSlug(link);

      if (!title || !link) return null;
      return { title, link, pubDate: updated, dateISO, description: summary, slug };
    })
    .filter(Boolean);

  if (!posts.length) {
    throw new Error("Atom format: no valid post entries found");
  }

  return posts;
}

/**
 * Parse feed RSS/Atom e estrae tutti i post
 */
async function fetchFeedPosts() {
  try {
    const { url, xml } = await findFeedUrl();
    
    console.log(`[auto-share] Found feed at: ${url}`);

    // Determina formato (RSS o Atom)
    const isRSS = xml.includes("<rss");
    const isAtom = xml.includes("<feed") && !isRSS;

    if (isRSS) {
      return parseRSS(xml);
    } else if (isAtom) {
      return parseAtom(xml);
    } else {
      throw new Error("Feed format not recognized (neither RSS nor Atom)");
    }
  } catch (error) {
    console.error(`[auto-share] Error fetching feed: ${error.message}`);
    throw error;
  }
}

/**
 * Carica stato precedente (ultimo post condiviso)
 */
function loadState() {
  try {
    const statePath = path.resolve(process.cwd(), STATE_FILE);
    
    if (!fs.existsSync(statePath)) {
      return null;
    }

    const content = fs.readFileSync(statePath, "utf8");
    const state = JSON.parse(content);
    
    // Backward compatibility: stato legacy con solo lastLink
    if (!Array.isArray(state.sentPosts)) {
      state.sentPosts = [];
      if (state.lastLink) {
        state.sentPosts.push({
          slug: extractSlug(state.lastLink),
          link: state.lastLink,
          title: state.title || "",
          sentAt: state.sharedAt || state.lastDate || new Date().toISOString(),
        });
      }
    }
    return state;
  } catch (error) {
    // Se il file non esiste o è corrotto, ritorna null (prima esecuzione)
    return null;
  }
}

/**
 * Salva stato (ultimo post condiviso)
 */
function saveState(post, previousState = null) {
  try {
    const statePath = path.resolve(process.cwd(), STATE_FILE);
    const stateDir = path.dirname(statePath);
    
    // Crea directory se non esiste
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    const sentAt = new Date().toISOString();
    const today = sentAt.slice(0, 10);
    const baseSentPosts = Array.isArray(previousState?.sentPosts) ? previousState.sentPosts : [];
    const alreadyExists = baseSentPosts.some((p) => p.link === post.link || (p.slug && p.slug === post.slug));
    const sentPosts = alreadyExists
      ? baseSentPosts
      : [
          ...baseSentPosts,
          {
            slug: post.slug || extractSlug(post.link),
            link: post.link,
            title: post.title,
            sentAt,
          },
        ];

    const state = {
      lastLink: post.link,
      lastDate: post.dateISO || post.pubDate || sentAt,
      title: post.title,
      sharedAt: sentAt,
      lastSentDay: today,
      sentPosts,
    };

    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
    console.log(`[auto-share] State saved: ${statePath}`);
  } catch (error) {
    console.error(`[auto-share] Error saving state: ${error.message}`);
    // Non bloccare se il salvataggio fallisce
  }
}

/**
 * Inizializza file di stato vuoto (warm-up) se assente
 */
function initializeEmptyState() {
  try {
    const statePath = path.resolve(process.cwd(), STATE_FILE);
    const stateDir = path.dirname(statePath);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    const state = {
      lastLink: "",
      lastDate: "",
      title: "",
      sharedAt: "",
      lastSentDay: "",
      sentPosts: [],
    };

    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
    console.log(`[auto-share] State initialized: ${statePath}`);
    return true;
  } catch (error) {
    console.error(`[auto-share] Error initializing state: ${error.message}`);
    return false;
  }
}

/**
 * Pulisci e tronca description (max 240 char, strip HTML)
 */
function cleanDescription(html) {
  if (!html) return "";
  
  let cleaned = String(html)
    .replace(/<[^>]*>/g, "") // Rimuovi tag HTML
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ") // Normalizza spazi
    .trim();

  // Limita a 240 caratteri
  if (cleaned.length > 240) {
    cleaned = cleaned.slice(0, 237) + "...";
  }

  return cleaned;
}

/**
 * Invia messaggio Telegram
 */
async function sendTelegramMessage(post) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set");
  }

  const shortDescription = cleanDescription(post.description);

  // Aggiungi UTM parameters al link
  const separator = post.link.includes("?") ? "&" : "?";
  const linkWithUtm = `${post.link}${separator}utm_source=telegram&utm_medium=social&utm_campaign=auto_share`;

  // Template messaggio HTML
  const text = `<b>${escapeHtml(post.title)}</b>\n${shortDescription ? shortDescription + "\n" : ""}\nLeggi: ${linkWithUtm}`;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Non loggare token o chat_id
    const safeError = errorText.replace(new RegExp(TELEGRAM_BOT_TOKEN, "g"), "***").replace(new RegExp(TELEGRAM_CHAT_ID, "g"), "***");
    throw new Error(`Telegram API error ${response.status}: ${safeError}`);
  }

  const data = await response.json();
  
  if (!data.ok) {
    throw new Error(`Telegram API returned error: ${data.description || "Unknown error"}`);
  }

  console.log(`[auto-share] Message sent successfully to Telegram`);
  return data;
}

/**
 * Invia payload post selezionato al webhook Make (opzionale)
 */
async function sendMakeWebhook(post) {
  if (!MAKE_WEBHOOK_URL) {
    console.log("[auto-share] Make webhook skipped: MAKE_WEBHOOK_URL not set");
    return;
  }

  const payload = {
    title: post.title || "",
    description: cleanDescription(post.description),
    link: post.link || "",
    slug: post.slug || extractSlug(post.link),
    dateISO: post.dateISO || "",
    pubDate: post.pubDate || "",
    source: "github-actions",
    site: "canapalandia",
  };

  const response = await fetch(MAKE_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Make webhook error ${response.status}: ${errorText}`);
  }

  console.log("[auto-share] Make webhook notified successfully");
}

/**
 * Escape HTML per Telegram
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Main function
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`[auto-share] Starting...`);
  console.log(`[auto-share] Mode: ${SHARE_MODE}`);

  // Verifica secrets (solo se non dry-run)
  if (!dryRun && (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID)) {
    console.error("[auto-share] ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set");
    process.exit(1);
  }

  try {
    // 1. Fetch feed e ottieni post
    console.log("[auto-share] Fetching feed...");
    const allPosts = await fetchFeedPosts();
    console.log(`[auto-share] Feed posts loaded: ${allPosts.length}`);

    // 2. Carica stato precedente
    const previousState = loadState();
    if (!previousState) {
      console.log("[auto-share] state: missing");
      const initialized = initializeEmptyState();
      if (!initialized) {
        console.error("[auto-share] ERROR: warm-up failed, state not initialized");
        process.exit(1);
      }
      console.log("[auto-share] warm-up: state missing, initialized without sending");
      process.exit(0);
    }
    console.log("[auto-share] state: loaded");

    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - RECENT_POSTS_WINDOW_MONTHS);

    const sentPosts = Array.isArray(previousState?.sentPosts) ? previousState.sentPosts : [];
    const sentLinks = new Set(sentPosts.map((p) => p.link).filter(Boolean));
    const sentSlugs = new Set(sentPosts.map((p) => p.slug).filter(Boolean));
    console.log(`[auto-share] Already shared posts in state: ${sentPosts.length}`);

    // 2. Escludi draft/non pubblicati (se segnali presenti)
    const publishablePosts = allPosts.filter(isPublishedPost);
    console.log(`[auto-share] Publishable posts after draft filter: ${publishablePosts.length}`);
    let selectedPost = null;

    if (SHARE_MODE === "new") {
      const newPostWindowStart = new Date(now.getTime() - NEW_POST_WINDOW_HOURS * 60 * 60 * 1000);
      console.log(`[auto-share] New post window hours: ${NEW_POST_WINDOW_HOURS}`);

      const newPosts = publishablePosts.filter((post) => {
        if (!post.dateISO) return false;
        const postDate = new Date(post.dateISO);
        return !Number.isNaN(postDate.getTime()) && postDate >= newPostWindowStart && postDate <= now;
      });

      const availableNewPosts = newPosts.filter((post) => {
        if (post.slug) return !sentSlugs.has(post.slug);
        return !sentLinks.has(post.link);
      });

      if (!availableNewPosts.length) {
        console.log("[auto-share] no-op: No new unsent posts found");
        process.exit(0);
      }

      selectedPost = availableNewPosts.slice().sort(sortByDateDesc)[0];
    } else {
      // Modalita repost (default): ultimi 6 mesi + esclusioni + frequenza minima
      console.log(`[auto-share] Recent post window months: ${RECENT_POSTS_WINDOW_MONTHS}`);

      const lastSharedRaw = previousState?.sharedAt || previousState?.lastDate || "";
      if (lastSharedRaw) {
        const lastSharedAt = new Date(String(lastSharedRaw));
        if (!Number.isNaN(lastSharedAt.getTime())) {
          const hoursSinceLastShare = (now.getTime() - lastSharedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastShare < MIN_HOURS_BETWEEN_SHARES) {
            console.log(`[auto-share] no-op: Last share was less than ${MIN_HOURS_BETWEEN_SHARES} hours ago`);
            process.exit(0);
          }
        }
      }

      const recentPosts = publishablePosts.filter((post) => {
        if (!post.dateISO) return false;
        const postDate = new Date(post.dateISO);
        return !Number.isNaN(postDate.getTime()) && postDate >= sixMonthsAgo && postDate <= now;
      });
      console.log(`[auto-share] Recent posts last 6 months: ${recentPosts.length}`);

      const unsentPosts = recentPosts.filter((post) => {
        if (post.slug) return !sentSlugs.has(post.slug);
        return !sentLinks.has(post.link);
      });

      let temporaryExcludedSkipped = 0;
      const repostCandidates = unsentPosts.filter((post) => {
        const excluded = isTemporarilyExcluded(post, now);
        if (excluded) temporaryExcludedSkipped += 1;
        return !excluded;
      });

      console.log(`[auto-share] Temporary excluded posts skipped: ${temporaryExcludedSkipped}`);
      console.log(`[auto-share] Available unsent posts: ${repostCandidates.length}`);

      if (!repostCandidates.length) {
        console.log("[auto-share] no-op: No repost candidates available");
        process.exit(0);
      }

      selectedPost = repostCandidates.slice().sort(sortByDateDesc)[0];
    }

    console.log(`[auto-share] Selected post: "${selectedPost.title}"`);

    if (dryRun) {
      console.log("[auto-share] DRY RUN: post selection successful, not sending");
      console.log(`  Title: ${selectedPost.title}`);
      console.log(`  Link: ${selectedPost.link}`);
      console.log(`  Slug: ${selectedPost.slug || "(none)"}`);
      console.log(`  Date: ${selectedPost.dateISO || selectedPost.pubDate || "(none)"}`);
      console.log(`  Description: ${cleanDescription(selectedPost.description)}`);
      console.log("[auto-share] DRY RUN: would notify Make webhook if configured");
    } else {
      // 7. Invia messaggio
      await sendTelegramMessage(selectedPost);
      console.log("[auto-share] message sent: Telegram notification delivered");
      // 8. Salva stato subito dopo Telegram riuscito (anti-duplicato)
      saveState(selectedPost, previousState);
      console.log("[auto-share] state saved: Post marked as sent");
      // 9. Notifica Make webhook (se configurato), senza bloccare il flusso
      try {
        await sendMakeWebhook(selectedPost);
      } catch (err) {
        console.warn(`[auto-share] WARN: Make webhook failed after Telegram success: ${err?.message || err}`);
      }
    }

    console.log("[auto-share] Done.");
    process.exit(0);
  } catch (error) {
    // Fail-safe: se RSS non raggiungibile o parse fallisce -> exit 0 con log "no-op"
    if (error.message.includes("feed") || error.message.includes("RSS") || error.message.includes("Atom") || error.message.includes("fetch") || error.message.includes("format")) {
      console.log(`[auto-share] no-op: ${error.message}`);
      process.exit(0);
    }
    
    // Per altri errori (es. Telegram API), esci con errore
    console.error(`[auto-share] ERROR: ${error.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[auto-share] Fatal error:", error);
  process.exit(1);
});
