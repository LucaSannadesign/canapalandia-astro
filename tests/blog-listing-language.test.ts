import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { searchablePosts } from "../src/lib/search.ts";

const now = new Date("2026-11-27T16:00:00Z");
const post = (id: string, language: "it" | "en", day: number, extra = {}): any => ({
  id,
  data: {
    slug: id, title: id, language,
    category: language === "it" ? "cannabis-news-it" : "cannabis-news",
    publishDate: new Date(Date.UTC(2026, 10, day)), status: "ready", ...extra,
  },
});

describe("Italian blog archive language regression (#124)", () => {
  it("filters before pagination and preserves all published Italian posts", () => {
    const entries = [
      ...Array.from({ length: 13 }, (_, i) => post("it-" + i, "it", i + 1)),
      ...Array.from({ length: 13 }, (_, i) => post("en-" + i, "en", i + 1)),
      post("en-explicit", "en", 25, { category: "cannabis-news-it" }),
      post("draft-it", "it", 26, { draft: true }),
      post("future-it", "it", 28),
      post("legacy-it", "it", 26, { editorialStatus: "legacy-review" }),
    ];
    const italian = searchablePosts(entries, "it", now);
    const english = searchablePosts(entries, "en", now);
    assert.equal(italian.length, 13);
    assert.equal(english.length, 14);
    assert.deepEqual(italian.slice(0, 10).map(p => p.id),
      Array.from({ length: 10 }, (_, i) => "it-" + (12 - i)));
    assert.deepEqual(italian.slice(10).map(p => p.id), ["it-2", "it-1", "it-0"]);
    assert.ok(italian.every(p => p.data.language === "it"));
    assert.ok(english.every(p => p.data.language === "en"));
  });

  it("all Italian listing paths use the shared selector, including getStaticPaths", () => {
    const routes = [
      ["../src/pages/blog/index.astro", 1],
      ["../src/pages/blog/page/[page].astro", 2],
      ["../src/pages/partials/blog-results.astro", 1],
    ] as const;
    for (const [path, count] of routes) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      assert.equal((source.match(/searchablePosts\(postsAll, "it"/g) || []).length, count, path);
      assert.doesNotMatch(source, /function isItalianPost/);
    }
  });
});
