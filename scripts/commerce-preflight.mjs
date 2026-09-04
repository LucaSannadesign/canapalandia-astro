const provider = (process.env.PUBLIC_COMMERCE_PROVIDER || "disabled").trim();
const enabled = process.env.PUBLIC_SPREADSHOP_ENABLED === "true";
const indexable = process.env.PUBLIC_COMMERCE_INDEXABLE === "true";
const embedEnabled = process.env.PUBLIC_SPREADSHOP_EMBED_ENABLED === "true";
const storefrontUrl = (process.env.PUBLIC_SPREADSHOP_STOREFRONT_URL || "").trim();

const errors = [];
const notes = [];

function isHttpsUrl(value) {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const hostedReady =
  provider === "spreadshop" && enabled && isHttpsUrl(storefrontUrl);

if (embedEnabled) {
  errors.push(
    "PUBLIC_SPREADSHOP_EMBED_ENABLED=true is blocked for Commerce V1: the 2026 new Spreadshop storefront does not currently support Embedded Shops.",
  );
}

if (indexable && !hostedReady) {
  errors.push(
    "Commerce cannot be indexable without a complete Spreadshop hosted configuration (provider=spreadshop, enabled=true, HTTPS storefront URL).",
  );
}

if (indexable) {
  notes.push("INDEXABLE release mode requested: production approval gate must already be closed.");
} else {
  notes.push("NOINDEX mode: correct for internal/staging QA.");
}

if (!hostedReady) {
  notes.push("Hosted shop is not ready; /shop/ must remain fail-closed/legacy.");
} else {
  notes.push(`Hosted storefront configured: ${storefrontUrl}`);
}

for (const note of notes) console.log(`[commerce-preflight] ${note}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`[commerce-preflight] ERROR: ${error}`);
  process.exit(1);
}

console.log("[commerce-preflight] PASS");
