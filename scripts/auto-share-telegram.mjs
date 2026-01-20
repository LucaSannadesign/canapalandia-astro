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

// URL RSS da provare in ordine (se RSS_URL non è fornito)
// Primo candidato: /rss.xml (definito in src/pages/rss.xml.ts)
const RSS_CANDIDATES = [
  "https://canapalandia.com/rss.xml",
  "https://canapalandia.com/feed.xml",
  "https://canapalandia.com/feed/",
  "https://canapalandia.com/rss/",
  "https://canapalandia.com/atom.xml",
];

// Path per state file (usato con GitHub Actions cache)
const STATE_FILE = process.env.STATE_FILE || ".cache/telegram-share.json";

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
 * Parse RSS XML e estrae il post più recente
 */
function parseRSS(xml) {
  // Estrai il primo <item>
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) {
    throw new Error("RSS format: no <item> found");
  }

  const item = itemMatch[1];

  // Estrai campi (supporta sia CDATA che testo normale)
  const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
  const linkMatch = item.match(/<link>(.*?)<\/link>/);
  const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/) || item.match(/<updated>(.*?)<\/updated>/);
  const descMatch = item.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/) ||
                     item.match(/<content:encoded>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content:encoded>/);

  if (!titleMatch || !linkMatch) {
    throw new Error("RSS format: missing title or link");
  }

  const title = titleMatch[1]?.trim() || "";
  const link = linkMatch[1]?.trim() || "";
  const pubDate = pubDateMatch?.[1]?.trim() || "";
  const description = descMatch?.[1]?.trim() || "";

  if (!title || !link) {
    throw new Error("RSS format: empty title or link");
  }

  // Normalizza data in ISO
  let dateISO = "";
  if (pubDate) {
    try {
      const date = new Date(pubDate);
      if (!isNaN(date.getTime())) {
        dateISO = date.toISOString();
      }
    } catch {
      // Ignora errori di parsing data
    }
  }

  return {
    title,
    link,
    pubDate,
    dateISO,
    description,
  };
}

/**
 * Parse Atom XML e estrae il post più recente
 */
function parseAtom(xml) {
  // Estrai il primo <entry>
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entryMatch) {
    throw new Error("Atom format: no <entry> found");
  }

  const entry = entryMatch[1];

  // Estrai campi
  const titleMatch = entry.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
  const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/) || entry.match(/<link[^>]*>[\s\S]*?href=["']([^"']+)["']/);
  const updatedMatch = entry.match(/<updated>(.*?)<\/updated>/) || entry.match(/<published>(.*?)<\/published>/);
  const summaryMatch = entry.match(/<summary[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/summary>/) ||
                        entry.match(/<content[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content>/);

  if (!titleMatch || !linkMatch) {
    throw new Error("Atom format: missing title or link");
  }

  const title = titleMatch[1]?.trim() || "";
  const link = linkMatch[1]?.trim() || "";
  const updated = updatedMatch?.[1]?.trim() || "";
  const summary = summaryMatch?.[1]?.trim() || "";

  if (!title || !link) {
    throw new Error("Atom format: empty title or link");
  }

  // Normalizza data in ISO
  let dateISO = "";
  if (updated) {
    try {
      const date = new Date(updated);
      if (!isNaN(date.getTime())) {
        dateISO = date.toISOString();
      }
    } catch {
      // Ignora errori di parsing data
    }
  }

  return {
    title,
    link,
    pubDate: updated,
    dateISO,
    description: summary,
  };
}

/**
 * Parse feed RSS/Atom e estrae il post più recente
 */
async function fetchLatestPost() {
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
    
    return state;
  } catch (error) {
    // Se il file non esiste o è corrotto, ritorna null (prima esecuzione)
    return null;
  }
}

/**
 * Salva stato (ultimo post condiviso)
 */
function saveState(post) {
  try {
    const statePath = path.resolve(process.cwd(), STATE_FILE);
    const stateDir = path.dirname(statePath);
    
    // Crea directory se non esiste
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    const state = {
      lastLink: post.link,
      lastDate: post.dateISO || post.pubDate || new Date().toISOString(),
      title: post.title,
      sharedAt: new Date().toISOString(),
    };

    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
    console.log(`[auto-share] State saved: ${statePath}`);
  } catch (error) {
    console.error(`[auto-share] Error saving state: ${error.message}`);
    // Non bloccare se il salvataggio fallisce
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

  // Verifica secrets (solo se non dry-run)
  if (!dryRun && (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID)) {
    console.error("[auto-share] ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set");
    process.exit(1);
  }

  try {
    // 1. Fetch feed e ottieni ultimo post
    console.log("[auto-share] Fetching feed...");
    const latestPost = await fetchLatestPost();
    console.log(`[auto-share] Latest post: "${latestPost.title}" (${latestPost.link})`);

    // 2. Carica stato precedente
    const previousState = loadState();
    
    // CASO 1: Warm-up (prima esecuzione - stato non esiste)
    if (!previousState) {
      console.log("[auto-share] warm-up: state initialized, not sending");
      saveState(latestPost);
      process.exit(0);
    }
    
    // CASO 2: No-op (stesso post già condiviso)
    if (previousState.lastLink === latestPost.link) {
      console.log("[auto-share] no-op: No new posts");
      process.exit(0);
    }
    
    // CASO 3: Nuovo post rilevato (link diverso)
    console.log(`[auto-share] Last shared: "${previousState.title}" (${previousState.lastLink})`);
    console.log(`[auto-share] New post detected: "${latestPost.title}" (${latestPost.link})`);
    
    if (dryRun) {
      console.log("[auto-share] DRY RUN: Would send message:");
      console.log(`  Title: ${latestPost.title}`);
      console.log(`  Link: ${latestPost.link}`);
      console.log(`  Description: ${cleanDescription(latestPost.description)}`);
    } else {
      await sendTelegramMessage(latestPost);
      console.log("[auto-share] message sent: Telegram notification delivered");
      saveState(latestPost);
      console.log("[auto-share] state saved: Latest post state persisted");
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
