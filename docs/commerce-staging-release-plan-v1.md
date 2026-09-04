# Canapalandia Commerce — Staging Release Plan V1

Status: internal only / no deploy / no live shop.

## Release strategy

- Keep `main` unchanged until staging QA is complete and Luca approves go-live.
- Keep `internal-commerce-adapter-v1` as a technical laboratory, not the final release branch.
- When provider/fiscal/SKU gates are sufficiently closed, create a fresh branch from updated `main` named `internal-commerce-release-v1`.
- Selectively bring the approved commerce commits into that branch; do not blindly promote the whole laboratory branch.
- The `internal-*` prefix is intentional: current `vercel.json` disables automatic Git deployments for internal branches.
- Normal Git branches currently generate preview deployments on both the production Vercel project and `canapalandia-staging`, so a normal `release/*` branch would create duplicate previews.

## `/shop/` routing gate

Production currently treats `/shop/` as a legacy WooCommerce URL:

- `/shop/` -> 301 `/blog/`
- `/shop/...` -> 410 Gone

The internal middleware now preserves that behavior unless Spreadshop is fully configured.

`/shop/` is reserved for commerce only when all are true:

- `PUBLIC_COMMERCE_PROVIDER=spreadshop`
- `PUBLIC_SPREADSHOP_ENABLED=true`
- `PUBLIC_SPREADSHOP_SHOP_NAME` is non-empty
- `PUBLIC_SPREADSHOP_PREFIX` is non-empty

If any value is missing, legacy behavior stays active.

## Single staging batch

The future staging release must contain one coherent batch:

1. commerce adapter;
2. real `/shop/` route;
3. frozen T-shirt + Tote + Beanie catalog data;
4. approved wordmark/artwork release candidates;
5. coordinated updates to About / Mission / Terms and any FAQ text that still says Canapalandia has no shop;
6. shop metadata and sitemap updates;
7. no unnecessary changes to the historical `/drop-001/` demand-test route.

## Sitemap requirements

Creating `src/pages/shop.astro` is not enough.

At release time also add `/shop/` to:

- `src/pages/sitemap.xml.ts` -> `STRUCTURAL_ROUTES`;
- `scripts/generate-sitemap-pages.mjs` -> `fixedRoutes`.

Both implementations already verify route existence, so the route should only appear when the page exists.

`public/robots.txt` currently has no shop-specific block and needs no change for this reason.

## Adapter fail-closed checks

The current adapter loads the remote Spreadshop client only when `isSpreadshopReady` is true.

Keep these settings unless a later provider requirement proves otherwise:

- `updateMetadata: false`
- `usePushState: false`

No secret may be placed in browser-exposed commerce configuration.

## Staging QA

Before production promotion:

- full Astro build passes;
- staging responses carry `X-Robots-Tag: noindex, nofollow`;
- `/shop/` is reachable only with complete commerce configuration;
- disabled/incomplete commerce preserves legacy `/shop/` redirect behavior;
- legacy `/cart`, `/checkout`, `/my-account` remain 410 unless a reviewed architecture explicitly changes them;
- no poster remains in the core catalog;
- only frozen SKU/provider IDs and verified prices are displayed;
- brand recognition/compliance gates pass;
- legal/editorial pages correctly distinguish Canapalandia editorial activity from merchandise and the provider's contractual role;
- no real purchase or paid sample/digitization is performed without Luca's explicit approval.

## Deployment discipline

- Assembly phase: 0 deployments.
- First complete candidate: 1 controlled deployment to `canapalandia-staging`.
- Batch QA fixes before another deployment; do not deploy per micro-fix.
- Production: one merge/deploy only after staging QA, gate closure and Luca approval.

## Known repository QA note

`package.json` currently exposes `npm run smoke` -> `node scripts/smoke.mjs`, but `scripts/smoke.mjs` is not present on the current branch. This is a general repository inconsistency, not a commerce-specific change; do not silently invent a replacement as part of the commerce release.
