import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeMakeWebhookUrl } from "../scripts/make-webhook-url.mjs";

test("Make webhook absent means no optional notification", () => {
  assert.equal(normalizeMakeWebhookUrl(""), "");
  assert.equal(normalizeMakeWebhookUrl(undefined), "");
});

test("valid Make URL is accepted as-is", () => {
  assert.equal(
    normalizeMakeWebhookUrl("https://hook.eu1.make.com/AbC_123-xyz"),
    "https://hook.eu1.make.com/AbC_123-xyz",
  );
});

test("a Make URL can be recovered from quoted/pasted secret text", () => {
  assert.equal(
    normalizeMakeWebhookUrl('  URL: "https://hook.us1.make.com/test_123"\n'),
    "https://hook.us1.make.com/test_123",
  );
});

test("invalid endpoint is rejected and never used as a recipient", () => {
  for (const invalid of [
    "bad-credential-not-a-url",
    "https://example.com/secret",
    "http://hook.eu1.make.com/test",
    "https://hook.fake.make.com/test",
  ]) {
    assert.throws(() => normalizeMakeWebhookUrl(invalid), /MAKE_WEBHOOK_URL non valido/);
  }
});

test("multiple webhook links are ambiguous and rejected", () => {
  assert.throws(
    () => normalizeMakeWebhookUrl("https://hook.eu1.make.com/one https://hook.eu2.make.com/two"),
    /esattamente una URL/,
  );
});
