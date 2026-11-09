import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runAgent(bilingual) {
  const published = new Date(Date.now() - 24 * 60 * 60 * 1000).toUTCString();
  const server = createServer((request, response) => {
    const origin = "http://127.0.0.1:" + server.address().port;
    if (request.url === "/rss.xml") {
      response.setHeader("content-type", "application/rss+xml");
      response.end("<rss><channel><item><title>Prova italiana</title><link>" + origin + "/it</link><pubDate>" + published + "</pubDate><description>Descrizione italiana</description></item></channel></rss>");
      return;
    }
    if (request.url === "/it" || request.url === "/en") {
      const english = request.url === "/en";
      const alternates = bilingual
        ? '<link rel="alternate" hreflang="it" href="' + origin + '/it"><link rel="alternate" hreflang="en" href="' + origin + '/en">'
        : "";
      response.setHeader("content-type", "text/html");
      response.end('<html><head>' + alternates + '<meta property="og:image" content="' + origin + '/cover.jpg"><meta name="description" content="' + (english ? "English description" : "Descrizione italiana") + '"></head><body><h1>' + (english ? "English title" : "Prova italiana") + '</h1></body></html>');
      return;
    }
    response.writeHead(404).end();
  });
  const temp = await mkdtemp(path.join(os.tmpdir(), "canapalandia-social-test-"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = "http://127.0.0.1:" + server.address().port;
    const { stdout } = await execFileAsync(process.execPath, ["scripts/social-agent.mjs", "--dry-run"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RSS_URL: origin + "/rss.xml",
        STATE_FILE: path.join(temp, "state.json"),
        SOCIAL_CHANNELS: "facebook,instagram,linkedin",
        DRY_RUN: "true",
        MAKE_WEBHOOK_URL: ""
      },
      timeout: 10000
    });
    const payloads = {};
    for (const line of stdout.split("\n")) {
      const match = line.match(/\[social-agent\] DRY RUN (facebook|instagram|linkedin): (\{.*\})$/);
      if (match) payloads[match[1]] = JSON.parse(match[2]);
    }
    assert.deepEqual(Object.keys(payloads).sort(), ["facebook", "instagram", "linkedin"]);
    return payloads;
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
}

for (const bilingual of [true, false]) {
  test("Instagram caption without raw links; tracking preserved elsewhere (" + (bilingual ? "IT/EN" : "IT") + ")", async () => {
    const posts = await runAgent(bilingual);
    const caption = posts.instagram.content;
    assert.match(caption, /link in bio/i);
    assert.doesNotMatch(caption, /https?:\/\//i);
    assert.doesNotMatch(caption, /utm_(source|medium|campaign)/i);
    assert.match(caption, /Prova italiana/);
    assert.equal(posts.instagram.languageMode, bilingual ? "it-en" : "it");
    assert.equal(caption.includes("English title"), bilingual);
    assert.match(posts.facebook.content, /utm_source=facebook/);
    assert.match(posts.facebook.content, /utm_campaign=auto_share_6m/);
    assert.match(posts.linkedin.content, /utm_source=linkedin/);
    assert.ok(posts.instagram.link.endsWith("/it"));
  });
}
