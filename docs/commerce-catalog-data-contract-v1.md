# Commerce Catalog Data Contract V1

Status: internal, non-public documentation. No shop route, checkout, provider upload, or deployment is enabled by this contract.

## Purpose

Keep Canapalandia Commerce provider-neutral and prevent provisional product research from being represented as frozen provider data.

Current logical Drop 001 core:

- `tshirt`
- `tote`
- `beanie`

The legacy `poster` remains historical demand-test data only and is intentionally absent from the release catalog data layer.

## Implemented draft shape

`src/data/commerce-products.ts` currently implements the smallest safe shape needed before provider freeze:

```ts
export type CommerceProductId = "tshirt" | "tote" | "beanie";
export type CommerceProductStatus = "draft" | "frozen";

export type CommerceProduct = {
  id: CommerceProductId;
  name: string;
  status: CommerceProductStatus;
  targetPriceEur?: number;
  spreadshop: {
    productTypeId?: number;
    candidateProductTypeIds?: readonly number[];
    startToken?: string;
  };
  fourthwall: {
    slug?: string;
    candidateLabel?: string;
  };
};
```

### Semantics

- `status: "draft"` means the physical provider SKU is not frozen and the record is not sale-ready.
- `status: "frozen"` may be set only after Partner Area/provider verification.
- `targetPriceEur` is a planning target, never a provider-confirmed retail/base price.
- `candidateProductTypeIds` are research candidates, not usable provider IDs.
- `productTypeId` must remain unset until the real provider freeze.
- `fourthwall.slug` must remain unset until provider onboarding/freeze.

## Current draft records

### T-shirt

- logical id: `tshirt`
- working name: `Canapalandia Oversized Organic T-shirt`
- target retail: `34.90 EUR` — planning only
- Spreadshop candidates: `[2940]`
- Fourthwall candidate: `Stanley/Stella SATU020 Unisex Organic Oversized T-Shirt`
- status: `draft`

### Tote

- logical id: `tote`
- working name: `Canapalandia Recycled Tote`
- target retail: `26.90 EUR` — planning only
- Spreadshop candidates: `[4133, 56]`, with PT4133 currently preferred and PT56 fallback
- Fourthwall candidate: `BagBase W101 Tote`
- status: `draft`

### Beanie

- logical id: `beanie`
- working name: `Canapalandia Beanie`
- no target retail price until the provider economics are verified
- Spreadshop candidates, in current review order: `[2450, 3339, 1089]`
- Fisherman 2.0 / STAU296 remains a lifecycle candidate to check in Partner Area and is not represented as an available Spreadshop SKU yet
- Fourthwall candidate: `Atlantis B50 Organic Ribbed Beanie`
- status: `draft`

## Freeze rules

A record can move from `draft` to `frozen` only when all materially relevant provider facts are captured:

1. actual provider/product ID;
2. current base price and currency;
3. available colors/sizes;
4. print, patch, or embroidery technique;
5. usable decoration area and file constraints;
6. any mandatory setup/digitization cost;
7. lifecycle/availability confidence;
8. brand/compliance gate compatible with the intended artwork.

At freeze time:

- set `spreadshop.productTypeId` or `fourthwall.slug` only to the verified value;
- keep research alternatives in documentation, not as active IDs;
- recheck target retail price and margin from the current provider economics;
- do not infer public availability from `frozen`: publication remains a separate approval gate.

## Future enrichment after freeze

The following richer fields may be added only when backed by real provider data and when they are needed by the shop UI:

- logical SKU / slug;
- provider base price and verification timestamp;
- variants/materials;
- print method and decoration area;
- analytics key;
- explicit brand/compliance gate state;
- publicability flag.

Do not add fields merely to make the schema look complete before there is real data to populate them.

## Brand and compliance rule

The catalog must not imply that the full `C + leaf` logo is cleared for merchandise. Current prudent production path is the official `CANAPALANDIA` wordmark-only application; use of the full symbol remains a separate compliance gate.

No product becomes a release candidate until:

- Canapalandia is recognizable without relying only on a slogan;
- the real brand asset/wordmark is used;
- the design is legible for the real decoration method;
- product facts and price are verified;
- compliance review is closed for the chosen application.

## Adapter behavior

The commerce adapter remains fail-closed:

- `PUBLIC_COMMERCE_PROVIDER=disabled` renders nothing commerce-specific;
- Spreadshop requires provider + explicit enabled flag + shop name + prefix;
- no provider script loads with the default configuration;
- no `/shop/` route exists;
- draft catalog data must never be presented as purchasable inventory.

## Deployment rule

This contract and the current branch do **not** authorize:

- opening or configuring a provider account;
- accepting provider terms;
- creating/uploading products;
- enabling checkout;
- merging to `main`;
- deploying to Vercel;
- publishing a shop route.

Any eventual public implementation must be reviewed and released in one consolidated deploy after provider, fiscal, compliance, production, and approval gates are closed.
