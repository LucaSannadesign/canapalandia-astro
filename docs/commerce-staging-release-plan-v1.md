# Canapalandia Commerce — Staging Release Plan V3

Status: internal only / no deploy / no live shop.

## Release strategy

- Keep `main` unchanged until staging QA is complete and Luca approves go-live.
- Keep `internal-commerce-adapter-v1` as a technical laboratory, not the final release branch.
- When provider/fiscal/SKU gates are sufficiently closed, create a fresh branch from updated `main` named `internal-commerce-release-v1`.
- Selectively bring the approved commerce commits into that branch; do not blindly promote the whole laboratory branch.
- The `internal-*` prefix is intentional: current `vercel.json` disables automatic Git deployments for internal branches.
- Normal Git branches currently generate preview deployments on both the production Vercel project and `canapalandia-staging`, so a normal `release/*` branch would create duplicate previews.

## 2026 storefront constraint

Spreadshop's July 2026 migration FAQ states that Embedded Shops are **not currently available in the new Shop frontend**. New shops created in 2026 receive the new storefront automatically.

Therefore the V1 launch architecture is:

**Canapalandia `/shop/` branded gateway → hosted Spreadshop storefront**

The existing JavaScript embed adapter is retained only as a future/legacy capability and must not be the default launch path until Spreadshop explicitly restores embedded-Shop support and we re-QA it.

Safe configuration:

- `PUBLIC_COMMERCE_PROVIDER=spreadshop`
- `PUBLIC_SPREADSHOP_ENABLED=true`
- `PUBLIC_SPREADSHOP_STOREFRONT_URL=<approved hosted storefront URL>`
- `PUBLIC_SPREADSHOP_EMBED_ENABLED=false`
- `PUBLIC_COMMERCE_INDEXABLE=false` during all staging/QA work

Legacy/future embed additionally requires explicit `PUBLIC_SPREADSHOP_EMBED_ENABLED=true`, a valid `PUBLIC_SPREADSHOP_SHOP_NAME`, and `PUBLIC_SPREADSHOP_PREFIX`.

## `/shop/` routing gate

Production currently treats `/shop/` as a legacy WooCommerce URL:

- `/shop/` -> 301 `/blog/`
- `/shop/...` -> 410 Gone

The commerce release must preserve that behavior while commerce is disabled/incomplete. The new `/shop/` page is enabled only after the provider and hosted storefront URL are approved.

The internal middleware already contains a fail-closed reservation for the future shop route. At release assembly, align its readiness condition with the hosted storefront URL rather than relying on the legacy embed identifiers.

## Single staging batch

The future staging release must contain one coherent batch:

1. commerce config with hosted-storefront readiness;
2. real `/shop/` Canapalandia gateway route;
3. outbound transition to the approved hosted Spreadshop storefront;
4. frozen T-shirt + Tote + Beanie catalog data;
5. approved wordmark/artwork release candidates;
6. coordinated updates to About / Mission / Terms and any FAQ text that still says Canapalandia has no shop;
7. shop metadata and sitemap logic gated by the publication flag;
8. no unnecessary changes to the historical `/drop-001/` demand-test route.

## `/shop/` UX rule

The Canapalandia gateway should preserve brand continuity without pretending checkout happens on Canapalandia:

- explain that merchandise belongs to Canapalandia Editorial Series;
- show only the frozen core catalog and verified prices/status;
- clearly indicate that selecting/buying opens the external Spreadshop storefront;
- do not recreate cart, checkout, account or order-management UI locally;
- do not duplicate product claims or legal terms that belong to the provider checkout;
- keep the transition concise and visually coherent with canapalandia.com.

## Indexing gate — mandatory

Reachability for QA and search-engine indexability are two separate states.

**Before Luca explicitly approves publication:**

- `PUBLIC_COMMERCE_INDEXABLE=false`;
- `/shop/` must render `noindex,nofollow` on staging;
- staging responses retain `X-Robots-Tag: noindex, nofollow`;
- `/shop/` must be absent from both sitemap implementations;
- do not connect `shop.canapalandia.com` to the public storefront yet;
- do not add public navigation/CTA from production to the shop.

Only in the final publication batch may `PUBLIC_COMMERCE_INDEXABLE=true` be enabled. At that same point, and not before, the release may expose `/shop/` in production navigation, include it in sitemaps and connect the approved branded storefront domain.

## Sitemap requirements

Both sitemap implementations are now protected by `PUBLIC_COMMERCE_INDEXABLE`:

- `src/pages/sitemap.xml.ts` only includes `/shop/` when the flag is `true`;
- `scripts/generate-sitemap-pages.mjs` only includes `/shop/` when the flag is `true`.

Both implementations also verify that the route actually exists. Therefore a staging shop can be reachable for QA while remaining absent from search-engine discovery surfaces.

`public/robots.txt` currently has no shop-specific block and needs no change for this reason.

## Adapter fail-closed checks

The hosted storefront is the default 2026 path.

The legacy JavaScript embed may load only when the separate embed flag is explicitly enabled. Keep these embed settings unless a future provider requirement proves otherwise:

- `updateMetadata: false`
- `usePushState: false`

No secret may be placed in browser-exposed commerce configuration.

## Staging QA

Before production promotion:

- full Astro build passes;
- `PUBLIC_COMMERCE_INDEXABLE=false`;
- staging responses carry `X-Robots-Tag: noindex, nofollow`;
- shop page meta robots is `noindex,nofollow`;
- `/shop/` is absent from runtime and generated sitemaps;
- `/shop/` is reachable only with complete approved commerce configuration;
- disabled/incomplete commerce preserves legacy `/shop/` redirect behavior;
- `/shop/` does not load `shopclient.nocache.js` while `PUBLIC_SPREADSHOP_EMBED_ENABLED=false`;
- outbound storefront URL is HTTPS and matches the actual approved Spreadshop shop;
- legacy `/cart`, `/checkout`, `/my-account` remain 410; checkout remains provider-hosted;
- no poster remains in the core catalog;
- only frozen SKU/provider IDs and verified prices are displayed;
- brand recognition/compliance gates pass;
- legal/editorial pages correctly distinguish Canapalandia editorial activity from merchandise and sprd.net AG's contractual role;
- no real purchase or paid sample/digitization is performed without Luca's explicit approval.

## Deployment discipline

- Assembly phase: 0 deployments.
- First complete candidate: 1 controlled deployment to `canapalandia-staging`.
- Batch QA fixes before another deployment; do not deploy per micro-fix.
- Production: one merge/deploy only after staging QA, gate closure and Luca approval.
- Publication/indexing flag changes only in the final production batch.

## Known repository QA note

`package.json` currently exposes `npm run smoke` -> `node scripts/smoke.mjs`, but `scripts/smoke.mjs` is not present on the current branch. This is a general repository inconsistency, not a commerce-specific change; do not silently invent a replacement as part of the commerce release.
