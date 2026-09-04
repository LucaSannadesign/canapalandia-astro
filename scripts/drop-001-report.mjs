#!/usr/bin/env node

import "dotenv/config";

/**
 * Drop 001 — aggregate Buttondown report.
 *
 * Read-only by design:
 * - GET requests only
 * - filters subscribers by metadata.campaign === "drop-001"
 * - prints aggregate counts only (no email addresses / subscriber IDs)
 * - uses the existing BUTTONDOWN_API_KEY environment variable
 */

const API_URL = "https://api.buttondown.com/v1/subscribers";
const CAMPAIGN = "drop-001";

const ACTIVE_CONFIRMED_TYPES = new Set([
  "regular",
  "premium",
  "gifted",
  "trialed",
  "churning",
]);

function fail(message) {
  console.error(`[drop-001-report] ${message}`);
  process.exit(1);
}

function percentage(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function increment(map, key) {
  const normalized = typeof key === "string" && key.trim() ? key.trim() : "unknown";
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function toSortedObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

async function fetchCampaignSubscribers(apiKey) {
  const subscribers = [];
  let nextUrl = new URL(API_URL);
  nextUrl.searchParams.set("metadata['campaign']", CAMPAIGN);

  while (nextUrl) {
    if (nextUrl.origin !== "https://api.buttondown.com") {
      fail(`Unexpected pagination origin: ${nextUrl.origin}`);
    }

    const response = await fetch(nextUrl, {
      method: "GET",
      headers: {
        Authorization: `Token ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      fail(`Buttondown returned ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload?.results)) {
      fail("Unexpected Buttondown response: missing results array.");
    }

    subscribers.push(...payload.results);
    nextUrl = payload.next ? new URL(payload.next) : null;
  }

  return subscribers;
}

function buildReport(subscribers) {
  const lifecycle = new Map();
  const preferencesAccepted = new Map();
  const preferencesConfirmed = new Map();
  const creativeVersions = new Map();

  let pendingConfirmation = 0;
  let activeConfirmed = 0;

  for (const subscriber of subscribers) {
    const type = typeof subscriber?.type === "string" ? subscriber.type : "unknown";
    const metadata = subscriber?.metadata && typeof subscriber.metadata === "object"
      ? subscriber.metadata
      : {};
    const preference = metadata.preference;
    const creativeVersion = metadata.creative_version;

    increment(lifecycle, type);
    increment(preferencesAccepted, preference);
    increment(creativeVersions, creativeVersion);

    if (type === "unactivated") pendingConfirmation += 1;

    if (ACTIVE_CONFIRMED_TYPES.has(type)) {
      activeConfirmed += 1;
      increment(preferencesConfirmed, preference);
    }
  }

  return {
    generated_at: new Date().toISOString(),
    campaign: CAMPAIGN,
    accepted_records: subscribers.length,
    pending_double_opt_in: pendingConfirmation,
    active_confirmed: activeConfirmed,
    active_confirmation_rate_pct: percentage(activeConfirmed, subscribers.length),
    lifecycle_types: toSortedObject(lifecycle),
    preference_share_accepted: toSortedObject(preferencesAccepted),
    preference_share_active_confirmed: toSortedObject(preferencesConfirmed),
    creative_versions: toSortedObject(creativeVersions),
    semantics: {
      accepted_records: "Buttondown records carrying metadata campaign=drop-001; not equivalent to confirmed double opt-in.",
      pending_double_opt_in: "Subscribers whose current Buttondown type is unactivated.",
      active_confirmed: "Subscribers whose current type is regular, premium, gifted, trialed, or churning.",
    },
  };
}

function printHuman(report) {
  console.log("Drop 001 — Buttondown aggregate report");
  console.log(`Generated: ${report.generated_at}`);
  console.log(`Accepted records: ${report.accepted_records}`);
  console.log(`Pending double opt-in: ${report.pending_double_opt_in}`);
  console.log(
    `Active confirmed: ${report.active_confirmed} (${report.active_confirmation_rate_pct}%)`,
  );
  console.log("\nLifecycle types:");
  console.log(JSON.stringify(report.lifecycle_types, null, 2));
  console.log("\nProduct preference — accepted:");
  console.log(JSON.stringify(report.preference_share_accepted, null, 2));
  console.log("\nProduct preference — active confirmed:");
  console.log(JSON.stringify(report.preference_share_active_confirmed, null, 2));
  console.log("\nCreative versions:");
  console.log(JSON.stringify(report.creative_versions, null, 2));
}

async function main() {
  const apiKey = process.env.BUTTONDOWN_API_KEY;
  if (!apiKey) {
    fail("BUTTONDOWN_API_KEY is not set. No request was made.");
  }

  const subscribers = await fetchCampaignSubscribers(apiKey);
  const report = buildReport(subscribers);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHuman(report);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
