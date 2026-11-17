import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("Make HTTP 200 is a handoff, not evidence of Facebook/Instagram/LinkedIn publication", async () => {
  let received = [];
  const created = new Date(Date.now() - 30 * 60 * 1000).toUTCString();
  const server = createServer((req, res) => {
    const origin = "http://127.0.0.1:" + server.address().port;
    if (req.url === "/rss.xml") {
      res.writeHead(200, { "content-type": "application/rss+xml" });
      res.end("<rss><channel><item><title>Test evidence only</title><link>" +
        origin + "/article</link><pubDate>" + created +
        "</pubDate><description>Local test, no real accounts</description></item></channel></rss>");
      return;
    }
    if (req.url === "/article") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><head><meta property=\"og:image\" content=\"" + origin +
        "/test-cover.webp\"></head><body><h1>Test evidence only</h1></body></html>");
      return;
    }
    if (req.url === "/make" && req.method === "POST") {
      let data = "";
      req.on("data", (chunk) => { data += chunk; });
      req.on("end", () => {
        received.push(JSON.parse(data));
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("Accepted");
      });
      return;
    }
    res.writeHead(404).end("Not found");
  });
  const folder = await mkdtemp(path.join(os.tmpdir(), "can-social-handoff-"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = "http://127.0.0.1:" + server.address().port;
    const stateFile = path.join(folder, "state.json");
    const env = {
      ...process.env,
      RSS_URL: origin + "/rss.xml",
      MAKE_WEBHOOK_URL: origin + "/make",
      SOCIAL_CHANNELS: "facebook,instagram,linkedin",
      STATE_FILE: stateFile,
      DRY_RUN: "false",
      MIN_HOURS_BETWEEN_ARTICLES: "36",
    };
    const run = () => execFileAsync(process.execPath, ["scripts/social-agent.mjs"], {
      cwd: process.cwd(), env, timeout: 14000,
    });
    const first = await run();
    assert.equal(received.length, 3, "one simulated handoff for each channel");
    assert.deepEqual(received.map((p) => p.channel).sort(), ["facebook", "instagram", "linkedin"]);
    assert.match(first.stdout, /Handoff accepted by Make/);
    assert.match(first.stdout, /platform publication NOT VERIFIED/);
    assert.doesNotMatch(first.stdout, /\[social-agent\] Completed on/);
    const state = JSON.parse(await readFile(stateFile, "utf8"));
    assert.equal(state.sentEvents.length, 3);
    assert.ok(state.sentEvents.every((event) =>
      event.makeHandoff === "accepted_unverified" &&
      event.platformPublicationVerified === false));
    assert.ok(state.completedArticles.every((item) => item.makeHandoff === "accepted_unverified"));

    const second = await run();
    assert.equal(received.length, 3, "deduplication must prevent a second Make handoff");
    assert.match(second.stdout, /no-op/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(folder, { recursive: true, force: true });
  }
});
