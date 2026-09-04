export type CommerceProductId = "tshirt" | "poster" | "tote";

export type CommerceProduct = {
  id: CommerceProductId;
  name: string;
  referencePriceEur: number;
  waitlistPriceEur: number;
  spreadshop: {
    productTypeId: number;
    startToken?: string;
  };
  fourthwall: {
    slug?: string;
  };
};

export const commerceProducts: readonly CommerceProduct[] = [
  {
    id: "tshirt",
    name: "T-shirt Bella+Canvas 3001",
    referencePriceEur: 29.9,
    waitlistPriceEur: 26.9,
    spreadshop: { productTypeId: 6 },
    fourthwall: {},
  },
  {
    id: "poster",
    name: "Poster 21 × 30 cm",
    referencePriceEur: 19.9,
    waitlistPriceEur: 17.9,
    spreadshop: { productTypeId: 1301 },
    fourthwall: {},
  },
  {
    id: "tote",
    name: "Tote BagBase W101",
    referencePriceEur: 24.9,
    waitlistPriceEur: 21.9,
    spreadshop: { productTypeId: 56 },
    fourthwall: {},
  },
] as const;

export function getCommerceProduct(id: CommerceProductId) {
  return commerceProducts.find((product) => product.id === id);
}
