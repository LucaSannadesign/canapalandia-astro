export type CommerceProductId = "tshirt" | "tote" | "beanie";

export type CommerceProductStatus = "draft" | "frozen";

export type CommerceProduct = {
  id: CommerceProductId;
  name: string;
  status: CommerceProductStatus;
  /** Working retail target only. Never treat as a provider-confirmed price. */
  targetPriceEur?: number;
  spreadshop: {
    /** Set only after the Partner Area freeze. */
    productTypeId?: number;
    /** Publicly researched candidates, not frozen provider data. */
    candidateProductTypeIds?: readonly number[];
    startToken?: string;
  };
  fourthwall: {
    /** Set only after provider onboarding/freeze. */
    slug?: string;
    candidateLabel?: string;
  };
};

/**
 * Provider-neutral draft catalog for Canapalandia Drop 001.
 *
 * Rules:
 * - no checkout or publication is implied by this file;
 * - provider IDs remain candidates until verified in the real Partner Area;
 * - target prices are planning values, not live/provider prices;
 * - the legacy poster is intentionally excluded from the release core.
 */
export const commerceProducts: readonly CommerceProduct[] = [
  {
    id: "tshirt",
    name: "Canapalandia Oversized Organic T-shirt",
    status: "draft",
    targetPriceEur: 34.9,
    spreadshop: {
      candidateProductTypeIds: [2940],
    },
    fourthwall: {
      candidateLabel: "Stanley/Stella SATU020 Unisex Organic Oversized T-Shirt",
    },
  },
  {
    id: "tote",
    name: "Canapalandia Recycled Tote",
    status: "draft",
    targetPriceEur: 26.9,
    spreadshop: {
      candidateProductTypeIds: [4133, 56],
    },
    fourthwall: {
      candidateLabel: "BagBase W101 Tote",
    },
  },
  {
    id: "beanie",
    name: "Canapalandia Beanie",
    status: "draft",
    spreadshop: {
      candidateProductTypeIds: [2450, 3339, 1089],
    },
    fourthwall: {
      candidateLabel: "Atlantis B50 Organic Ribbed Beanie",
    },
  },
] as const;

export function getCommerceProduct(id: CommerceProductId) {
  return commerceProducts.find((product) => product.id === id);
}
