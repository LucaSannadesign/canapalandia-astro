#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const STATE_FILE = process.env.STATE_FILE || ".cache/social-share.json";
const REQUIRED_CHANNELS = ["facebook", "instagram", "linkedin"];
const MULTICHANNEL_CUTOVER_AT = Date.parse(
  process.env.SOCIAL_MULTICHANNEL_CUTOVER_AT || "2026-09-01T20:00:00.000Z",
);

function statePath() {
  return path.resolve(process.cwd(), STATE_FILE);
}

function validDate(value) {
  const time = Date.parse(String(value || ""));
  return Number.isNaN(time) ? null : time;
}

function main() {
  const target = statePath();
  if (!fs.existsSync(target)) {
    console.log("[social-state-repair] no state file; nothing to repair");
    return;
  }

  const state = JSON.parse(fs.readFileSync(target, "utf8"));
  const completedArticles = Array.isArray(state.completedArticles) ? state.completedArticles : [];
  const sentEvents = Array.isArray(state.sentEvents) ? state.sentEvents : [];

  const removed = [];
  const kept = completedArticles.filter((item) => {
    const completedAt = validDate(item?.completedAt);
    if (completedAt === null || completedAt < MULTICHANNEL_CUTOVER_AT) return true;

    const channels = new Set(
      sentEvents
        .filter((event) => event?.slug === item?.slug)
        .map((event) => String(event?.channel || "").toLowerCase()),
    );
    const complete = REQUIRED_CHANNELS.every((channel) => channels.has(channel));
    if (!complete) removed.push(item);
    return complete;
  });

  if (!removed.length) {
    console.log("[social-state-repair] state is consistent; no repair needed");
    return;
  }

  state.completedArticles = kept;
  const latestValidCompletion = kept
    .map((item) => validDate(item?.completedAt))
    .filter((value) => value !== null)
    .sort((a, b) => b - a)[0];
  state.lastCompletedAt = latestValidCompletion ? new Date(latestValidCompletion).toISOString() : "";

  fs.writeFileSync(target, JSON.stringify(state, null, 2), "utf8");
  console.log(
    `[social-state-repair] removed ${removed.length} partial completion(s): ${removed
      .map((item) => item.slug)
      .join(", ")}`,
  );
  console.log(`[social-state-repair] lastCompletedAt reset to ${state.lastCompletedAt || "empty"}`);
}

main();
