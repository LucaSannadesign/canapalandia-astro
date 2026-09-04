export const COMMERCE_PROVIDERS = ["disabled", "spreadshop", "fourthwall"] as const;

export type CommerceProvider = (typeof COMMERCE_PROVIDERS)[number];

function normalizeProvider(value: string | undefined): CommerceProvider {
  return COMMERCE_PROVIDERS.includes(value as CommerceProvider)
    ? (value as CommerceProvider)
    : "disabled";
}

function normalizeHttpsUrl(value: string | undefined): string {
  const candidate = value?.trim() || "";
  if (!candidate) return "";

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

const provider = normalizeProvider(import.meta.env.PUBLIC_COMMERCE_PROVIDER);
const storefrontUrl = normalizeHttpsUrl(import.meta.env.PUBLIC_SPREADSHOP_STOREFRONT_URL);
const shopName = import.meta.env.PUBLIC_SPREADSHOP_SHOP_NAME?.trim() || "";
const prefix = import.meta.env.PUBLIC_SPREADSHOP_PREFIX?.trim() || "";
const locale = import.meta.env.PUBLIC_SPREADSHOP_LOCALE?.trim() || "it_IT";
const spreadshopEnabled = import.meta.env.PUBLIC_SPREADSHOP_ENABLED === "true";
const spreadshopEmbedEnabled =
  import.meta.env.PUBLIC_SPREADSHOP_EMBED_ENABLED === "true";

export const commerceConfig = Object.freeze({
  provider,
  spreadshop: Object.freeze({
    enabled: spreadshopEnabled,
    storefrontUrl,
    embedEnabled: spreadshopEmbedEnabled,
    shopName,
    prefix,
    locale,
    baseId: "spreadshop-root",
  }),
});

export const isCommerceEnabled = commerceConfig.provider !== "disabled";

/**
 * Launch path for the 2026 new Spreadshop storefront.
 * New storefronts currently do not support embedded shops, so a real hosted
 * HTTPS storefront URL is the minimum readiness signal for the branded `/shop/` gateway.
 */
export const isSpreadshopHostedReady =
  commerceConfig.provider === "spreadshop" &&
  commerceConfig.spreadshop.enabled &&
  Boolean(commerceConfig.spreadshop.storefrontUrl);

/**
 * Legacy/future embed path. It is deliberately gated by a separate opt-in so
 * PUBLIC_SPREADSHOP_ENABLED alone can never load the old JS embed accidentally.
 */
export const isSpreadshopEmbedReady =
  isSpreadshopHostedReady &&
  commerceConfig.spreadshop.embedEnabled &&
  Boolean(commerceConfig.spreadshop.shopName && commerceConfig.spreadshop.prefix);
