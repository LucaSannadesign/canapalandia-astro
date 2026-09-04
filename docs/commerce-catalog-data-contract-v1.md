# Commerce Catalog Data Contract V1

Status: internal documentation only. No public route, checkout, provider upload, or deployment is enabled by this document.

## Purpose

Define the provider-neutral catalog shape for Canapalandia Commerce so that provisional SKU, pricing, fulfillment, and compliance data are never hardcoded as if they were final.

Current logical Drop 001 core:

- `tshirt`
- `tote`
- `beanie`

The legacy `poster` entry remains historical demand-test data and must not be silently reused as a live catalog product.

## Design rules

1. Logical product identity is independent from provider SKU.
2. Unknown provider facts stay `null` / `TBD`, never guessed.
3. Publicability is explicit and defaults to `false`.
4. Pricing snapshots are not treated as guaranteed provider prices.
5. Compliance and brand gates are first-class data.
6. A provider switch must not require rewriting customer-facing naming or analytics keys.

## Proposed TypeScript shape

```ts
export type CommerceLogicalProductId = "tshirt" | "tote" | "beanie";
export type CommerceProductStatus = "draft" | "provisional" | "ready" | "archived";
export type CommerceGateStatus = "open" | "provisional-resolved" | "resolved";

export type ProviderCatalogRef = {
  providerSku: string | number | null;
  productName: string | null;
  productUrl: string | null;
  basePriceEur: number | null;
  currency: "EUR" | "USD" | null;
  startToken?: string | null;
  lastVerifiedAt: string | null;
};

export type CommerceProduct = {
  id: CommerceLogicalProductId;
  logicalSku: string;
  slug: string;
  name: string;
  shortName: string;
  collection: "Drop 001";
  series: "Editorial Series";
  productType: "t-shirt" | "tote-bag" | "beanie";
  status: CommerceProductStatus;
  public: false;

  referencePriceEur: number | null;
  candidateRetailPriceEur: number | null;

  brandAsset: "/images/logo-canapalandia.svg";
  brandGateStatus: CommerceGateStatus;
  complianceStatus: CommerceGateStatus;

  variants: readonly string[];
  materials: readonly string[];
  printMethod: string | null;
  analyticsKey: string;

  spreadshop: ProviderCatalogRef;
  fourthwall: ProviderCatalogRef;
};
```

## Current logical records

### T-shirt

- `id`: `tshirt`
- `logicalSku`: `CAN-D001-TEE-01`
- `slug`: `canapalandia-editorial-tee-drop-001`
- working name: `Canapalandia — Editorial Tee / Drop 001`
- preferred provisional product direction: Unisex Premium Oversized Organic T-Shirt
- public Spreadshop base-price snapshot observed 2026-09-04: `22.49 EUR`
- candidate retail price: `34.90 EUR`
- fallback benchmark: Men's T-Shirt, public base-price snapshot `17.49 EUR`
- provider SKU: `null` until Partner Area freeze
- public: `false`

### Tote

- `id`: `tote`
- `logicalSku`: `CAN-D001-TOTE-01`
- `slug`: `canapalandia-editorial-tote-drop-001`
- working name: `Canapalandia — Editorial Tote / Drop 001`
- historical Spreadshop candidate: Tote Bag ID 56
- historical base-price snapshot: `11.49 EUR` — must be reverified
- candidate retail price: `24.90 EUR` — provisional
- premium alternative: not frozen; Stanley/Stella Shopping Bag 2.0 is not usable until actually available and priced
- public: `false`

### Beanie

- `id`: `beanie`
- `logicalSku`: `CAN-D001-BEANIE-01`
- `slug`: `canapalandia-fisherman-beanie-drop-001`
- working name: `Canapalandia — Fisherman Beanie / Drop 001`
- current operational candidate: Fisherman Beanie 2450
- upgrade candidate: Fisherman Beanie 2.0 AW26 if it appears in Spreadshop Partner Area
- base price: `null`
- candidate retail price: `null`
- public: `false`

## Null / TBD rules

Use `null` when any of these are not verified in the provider environment:

- provider SKU
- base price
- retail price when it depends on unknown base price
- product URL
- fulfillment geography
- available colors
- exact print / embroidery area
- material composition if candidate model is not frozen
- shipping eligibility / country restrictions

Do not carry forward stale values from the demand-test landing as if they were current catalog facts.

## Brand gate

Every product must reference the real asset:

`/images/logo-canapalandia.svg`

A product cannot become `ready` unless:

- Canapalandia is recognizable without relying on the main claim;
- logo/wordmark is a real brand asset;
- the design is technically legible for the actual print/embroidery method;
- product facts and variants are verified;
- compliance review is closed;
- final pricing is verified.

## Adapter behavior

The existing commerce adapter must remain safe by default:

- `PUBLIC_COMMERCE_PROVIDER=disabled` -> render nothing commerce-specific;
- Spreadshop requires provider + enabled flag + shop name + prefix;
- no provider script loads when commerce is disabled;
- no catalog record may imply purchasability while `public=false`;
- no `/shop/` route should be created until onboarding and approval gates are complete.

## Migration from current scaffold

The current `src/data/commerce-products.ts` still contains:

- `tshirt`
- `poster`
- `tote`

and hardcoded waitlist/reference prices from the old demand test.

Do **not** patch this file yet. Apply the migration only in one consolidated future batch after:

1. provider is confirmed;
2. t-shirt physical SKU is frozen;
3. tote physical SKU is frozen;
4. beanie 2450 vs 2.0 is resolved;
5. current base prices and variants are verified;
6. demand-test / live-copy transition is intentionally planned.

## Approval / deployment rule

This document does not authorize:

- opening a provider account;
- accepting provider terms;
- uploading products;
- creating checkout;
- merging to `main`;
- deploying to Vercel;
- publishing a shop route.

Any future implementation should be batched and reviewed before a single deploy.
