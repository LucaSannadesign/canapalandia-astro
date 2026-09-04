import { readFile } from "node:fs/promises";

const files = {
  shop: "src/pages/shop.astro",
  middleware: "src/middleware.ts",
  navigation: "src/config/navigation.ts",
  products: "src/data/commerce-products.ts",
  faq: "src/pages/faq-domande-frequenti.astro",
};

const [shop, middleware, navigation, products, faq] = await Promise.all(
  Object.values(files).map((path) => readFile(path, "utf8")),
);

const errors = [];
const notes = [];

function requireCheck(condition, message) {
  if (!condition) errors.push(message);
}

requireCheck(
  shop.includes('"noindex,nofollow,noarchive"'),
  "shop.astro must keep the explicit noindex,nofollow,noarchive staging/release guard.",
);
requireCheck(
  !shop.includes('<main class="shop-shell"'),
  "shop.astro must not create a nested <main>; SiteLayout already owns the document main landmark.",
);

const layoutClose = shop.lastIndexOf("</SiteLayout>");
const analyticsScript = shop.indexOf("commerce_shop_view");
requireCheck(
  analyticsScript >= 0 && layoutClose >= 0 && analyticsScript < layoutClose,
  "Commerce analytics script must remain inside SiteLayout, before </SiteLayout>.",
);

requireCheck(
  middleware.includes('"X-Robots-Tag"') &&
    middleware.includes("PUBLIC_COMMERCE_INDEXABLE") &&
    middleware.includes("noindex, nofollow, noarchive"),
  "Middleware must preserve the HTTP X-Robots-Tag noindex guard for commerce.",
);
requireCheck(
  middleware.includes("isDedicatedStagingHost"),
  "Middleware must keep the dedicated staging-host exception for visual QA.",
);
requireCheck(
  navigation.includes('{ label: "Shop", href: "/shop/" }'),
  "Staging navigation must expose Shop for end-to-end QA.",
);
requireCheck(
  !products.includes('status: "frozen"'),
  "No commerce product may be marked frozen before the Partner Area freeze gate is completed.",
);
requireCheck(
  !faq.includes("Non vendiamo nulla"),
  "The staged FAQ must not repeat the obsolete 'Non vendiamo nulla' statement.",
);
requireCheck(
  faq.includes("sprd.net AG") && faq.includes("merchandise"),
  "The staged FAQ must keep the merchandise/provider distinction and identify sprd.net AG for Spreadshop orders.",
);

notes.push("Shop page source keeps explicit noindex policy.");
notes.push("Commerce products remain draft-only.");
notes.push("Shop is reachable in staging navigation for QA.");
notes.push("Legacy FAQ contradiction is overridden by a commerce-aware static FAQ.");
notes.push("Production publication/indexing is not performed by this audit.");

for (const note of notes) console.log(`[commerce-staging-audit] ${note}`);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[commerce-staging-audit] ERROR: ${error}`);
  }
  process.exit(1);
}

console.log("[commerce-staging-audit] PASS");
