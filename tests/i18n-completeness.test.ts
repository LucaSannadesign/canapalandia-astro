import assert from "node:assert/strict";
import { test } from "node:test";
import { completenessErrors } from "../scripts/i18n-completeness.mjs";

const policy = { requiredFrom: "2026-11-28", legacyPaths: ["old.mdx", "draft-old.mdx"], exceptions: [] };
const entry = (path, language = "it", overrides = {}) => ({
  path, language, status: "ready", draft: false, editorialStatus: "current", publishDate: "2026-11-27", ...overrides,
});
const run = (items, pairs = [], p = policy, promoted = new Set()) => completenessErrors(new Map(items), pairs, p, promoted);
test("historical article remains available but new backdated article requires a pair", () => {
  assert.deepEqual(run([["old", entry("old.mdx")]]), []);
  assert.match(run([["new", entry("new.mdx")]])[0], /Missing IT\/EN/);
});
test("a ready bilingual pair passes, drafts, quarantine and same-language counterparts fail", () => {
  const it = entry("it.mdx"), en = entry("en.mdx", "en");
  const pair = [{ it: "a", en: "b" }];
  assert.deepEqual(run([["a", it], ["b", en]], pair), []);
  for (const wrong of [{ draft: true }, { status: "draft" }, { editorialStatus: "legacy-review" }, { language: "it" }, { publishDate: "2099-01-01" }]) {
    assert.ok(run([["a", it], ["b", { ...en, ...wrong }]], pair).length);
  }
});
test("new drafts may be prepared; historical drafts promoted in a PR and new dates need translation", () => {
  assert.deepEqual(run([["draft", entry("draft.mdx", "it", { status: "draft" })]]), []);
  assert.ok(run([["promoted", entry("draft-old.mdx")]], [], policy, new Set(["draft-old.mdx"])).length);
  assert.ok(run([["old", entry("old.mdx", "it", { publishDate: "2026-11-28" })]]).length);
});
test("a monolingual exception needs a documented reason and approval", () => {
  const items = [["a", entry("a.mdx")]];
  assert.ok(run(items, [], { ...policy, exceptions: [{ slug: "a", reason: "", approval: "" }] }).length);
  assert.deepEqual(run(items, [], { ...policy, exceptions: [{ slug: "a", reason: "Local notice only", approval: "Editorial decision #123" }] }), []);
});
