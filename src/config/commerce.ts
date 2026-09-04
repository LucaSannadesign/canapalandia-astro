export const COMMERCE_PROVIDERS = ["disabled", "spreadshop", "fourthwall"] as const;

export type CommerceProvider = (typeof COMMERCE_PROVIDERS)[number];

function normalizeProvider(value: string | undefined): CommerceProvider {
  return COMMERCE_PROVIDERS.includes(value as CommerceProvider)
    ? (value as CommerceProvider)
    : "disabled";
}

const provider = normalizeProvider(import.meta.env.PUBLIC_COMMERCE_PROVIDER);
const shopName = import.meta.env.PUBLIC_SPREADSHOP_SHOP_NAME?.trim() || "";
const prefix = import.meta.env.PUBLIC_SPREADSHOP_PREFIX?.trim() || "";
const locale = import.meta.env.PUBLIC_SPREADSHOP_LOCALE?.trim() || "it_IT";
const spreadshopEnabled = import.meta.env.PUBLIC_SPREADSHOP_ENABLED === "true";

export const commerceConfig = Object.freeze({
  provider,
  spreadshop: Object.freeze({
    enabled: spreadshopEnabled,
    shopName,
    prefix,
    locale,
    baseId: "spreadshop-root",
  }),
});

export const isCommerceEnabled = commerceConfig.provider !== "disabled";

export const isSpreadshopReady =
  commerceConfig.provider === "spreadshop" &&
  commerceConfig.spreadshop.enabled &&
  Boolean(commerceConfig.spreadshop.shopName && commerceConfig.spreadshop.prefix);
