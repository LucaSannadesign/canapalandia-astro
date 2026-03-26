import type { MiddlewareHandler } from "astro";

/**
 * Redirect/cleanup middleware:
 * - handles legacy e-commerce URLs with semantic 301 where possible
 * - serves 410 for obsolete/junk/bot-like endpoints without replacements
 * - keeps noindex on preview/localhost environments
 */
export const onRequest: MiddlewareHandler = async (context, next) => {
  const { url } = context;
  const pathname = url.pathname.replace(/\/{2,}/g, "/");
  const pathNoSlash = pathname.replace(/^\/+|\/+$/g, "");
  const segments = pathNoSlash ? pathNoSlash.split("/") : [];
  const first = (segments[0] || "").toLowerCase();
  const second = (segments[1] || "").toLowerCase();

  const withTrailingSlash = (path: string): string => {
    if (path === "/") return "/";
    return path.endsWith("/") ? path : `${path}/`;
  };

  const redirect301 = (targetPath: string): Response => {
    const cleanTarget = withTrailingSlash(targetPath);
    const destination = new URL(cleanTarget, url.origin);

    // Preserve query string when useful for analytics/campaign continuity
    destination.search = url.search;

    return Response.redirect(destination.toString(), 301);
  };

  const gone410 = (): Response =>
    new Response("Gone", {
      status: 410,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });

  const exactGonePaths = new Set([
    "wp-login.php",
    "xmlrpc.php",
    ".env",
    ".git/config",
    "phpmyadmin",
    "administrator",
  ]);

  if (exactGonePaths.has(pathNoSlash.toLowerCase())) {
    return gone410();
  }

  const gonePrefixPatterns = [
    /^wp-admin(?:\/|$)/i,
    /^wp-includes(?:\/|$)/i,
    /^wp-json\/wc\//i,
    /^wc-api(?:\/|$)/i,
    /^cart(?:\/|$)/i,
    /^checkout(?:\/|$)/i,
    /^my-account(?:\/|$)/i,
    /^wishlist(?:\/|$)/i,
    /^product-tag(?:\/|$)/i,
    /^product-category(?:\/|$)/i,
    /^go(?:\/|$)/i,
    /^partner(?:\/|$)/i,
    /^partner-selezionati(?:\/|$)/i,
    /^cgi-bin(?:\/|$)/i,
    /^vendor\/phpunit(?:\/|$)/i,
  ];

  if (gonePrefixPatterns.some((re) => re.test(pathNoSlash))) {
    return gone410();
  }

  // Legacy archive-like sections with a clear informational equivalent.
  const archiveLikeSections = new Set([
    "shop",
    "products",
    "prodotti",
    "negozio",
    "store",
  ]);

  if (archiveLikeSections.has(first) && segments.length <= 1) {
    return redirect301("/blog/");
  }

  // Product detail URLs typically have no 1:1 informational equivalent.
  const productLikeSections = new Set([
    "product",
    "prodotto",
    "shop",
    "products",
    "prodotti",
    "negozio",
    "store",
  ]);

  if (productLikeSections.has(first) && segments.length > 1) {
    return gone410();
  }

  // Legacy WooCommerce categories -> best matching blog categories.
  if (first === "categoria-prodotto") {
    const categoryMap: Record<string, string> = {
      cbd: "/categoria/cbd-alimentazione/",
      "cbd-oil": "/categoria/cbd-alimentazione/",
      "olio-cbd": "/categoria/cbd-alimentazione/",
      "olio-di-cbd": "/categoria/cbd-alimentazione/",
      cannabis: "/categoria/cannabis-news-it/",
      "cannabis-light": "/categoria/cannabis-news-it/",
      canapa: "/categoria/canapa-e-ambiente/",
      alimentazione: "/categoria/cbd-alimentazione/",
      benessere: "/categoria/salute-benessere/",
      salute: "/categoria/salute-benessere/",
      cosmetici: "/categoria/cbd-bellezza-cura-pelle/",
      legale: "/categoria/cannabis-legalization/",
      "aspetti-legali": "/categoria/cannabis-legalization/",
      normativa: "/categoria/cannabis-news-it/",
      "novita-cannabis": "/categoria/cannabis-news-it/",
      "cannabis-news": "/categoria/cannabis-news-it/",
      "uso-terapeutico": "/categoria/salute-benessere/",
    };

    if (!second) return redirect301("/blog/");
    return redirect301(categoryMap[second] || "/blog/");
  }

  // Legacy product tags are disabled by default until a validated whitelist is ready.
  if (first === "tag-prodotto") {
    if (!second) return redirect301("/blog/");
    return gone410();
  }

  // Legacy feed endpoints (WordPress-style) should be gone, not 404.
  const isLegacyFeedPath =
    segments.length >= 2 &&
    segments[segments.length - 1]?.toLowerCase() === "feed";
  if (isLegacyFeedPath) {
    return gone410();
  }

  const response = await next();

  const hostname = context.url.hostname;
  const isPreviewOrLocalhost =
    hostname === "localhost" ||
    hostname.startsWith("127.0.0.1") ||
    hostname.endsWith(".vercel.app") ||
    hostname.includes("vercel.app");

  if (isPreviewOrLocalhost) {
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    newResponse.headers.set("X-Robots-Tag", "noindex, nofollow");

    return newResponse;
  }

  return response;
};