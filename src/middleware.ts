import type { MiddlewareHandler } from "astro";

/**
 * Redirect/cleanup middleware:
 * - handles legacy e-commerce URLs with semantic 301 where possible
 * - serves 410 for obsolete/junk/bot-like endpoints without replacements
 * - keeps noindex on preview/localhost environments
 * - keeps the Drop 001 demand test private unless explicitly enabled
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

  /**
   * Normalizza l'identità editoriale nelle pagine pubbliche senza dover migrare
   * immediatamente tutti i frontmatter legacy.
   *
   * Regole:
   * - byline visibile: sempre "Canapalandia";
   * - BlogPosting JSON-LD: author sempre Organization/Canapalandia;
   * - dateModified non può precedere datePublished.
   */
  const normalizeEditorialHtml = (html: string): string => {
    let normalized = html
      .replace(
        /(<p[^>]*class=["'][^"']*\bpost-author\b[^"']*["'][^>]*>\s*Di\s*<strong[^>]*>)[\s\S]*?(<\/strong>\s*<\/p>)/gi,
        "$1Canapalandia$2",
      )
      .replace(
        /(<span[^>]*class=["'][^"']*\bcl-byline\b[^"']*["'][^>]*>\s*di\s*)[^<]*(<\/span>)/gi,
        "$1Canapalandia$2",
      );

    const normalizeJsonLdNode = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(normalizeJsonLdNode);
      if (!node || typeof node !== "object") return node;

      const data = node as Record<string, unknown>;
      const rawType = data["@type"];
      const isBlogPosting = Array.isArray(rawType)
        ? rawType.includes("BlogPosting")
        : rawType === "BlogPosting";

      if (isBlogPosting) {
        data.author = {
          "@type": "Organization",
          name: "Canapalandia",
        };

        const publishedRaw = data.datePublished;
        const modifiedRaw = data.dateModified;
        const published =
          typeof publishedRaw === "string" ? Date.parse(publishedRaw) : Number.NaN;
        const modified =
          typeof modifiedRaw === "string" ? Date.parse(modifiedRaw) : Number.NaN;

        if (
          Number.isFinite(published) &&
          (!Number.isFinite(modified) || modified < published)
        ) {
          data.dateModified = publishedRaw;
        }
      }

      Object.keys(data).forEach((key) => {
        data[key] = normalizeJsonLdNode(data[key]);
      });

      return data;
    };

    normalized = normalized.replace(
      /<script([^>]*type=["']application\/ld\+json["'][^>]*)>([\s\S]*?)<\/script>/gi,
      (match, attrs, jsonText) => {
        try {
          const parsed = JSON.parse(jsonText);
          const cleaned = normalizeJsonLdNode(parsed);
          return `<script${attrs}>${JSON.stringify(cleaned)}</script>`;
        } catch {
          return match;
        }
      },
    );

    return normalized;
  };

  const rebuildHtmlResponse = (source: Response, html: string): Response => {
    const headers = new Headers(source.headers);
    headers.delete("content-length");
    return new Response(html, {
      status: source.status,
      statusText: source.statusText,
      headers,
    });
  };

  /**
   * SiteLayout crea il landmark <main id="contenuto">. Alcune route legacy
   * contengono ancora un secondo <main> nel proprio template. Il browser lo
   * tollera, ma l'HTML non è semanticamente corretto. Normalizziamo l'output
   * rendendo eventuali <main> interni semplici <div>, senza alterare il landmark
   * principale del layout.
   */
  const normalizeNestedMainLandmarks = (html: string): string => {
    let normalized = html;

    while (true) {
      const outerMatch = /<main\b[^>]*id=["']contenuto["'][^>]*>/i.exec(normalized);
      if (!outerMatch || outerMatch.index === undefined) break;

      const searchFrom = outerMatch.index + outerMatch[0].length;
      const tail = normalized.slice(searchFrom);
      const innerMatch = /<main\b([^>]*)>/i.exec(tail);
      if (!innerMatch || innerMatch.index === undefined) break;

      const innerStart = searchFrom + innerMatch.index;
      const innerOpenEnd = innerStart + innerMatch[0].length;
      const innerClose = normalized.indexOf("</main>", innerOpenEnd);
      if (innerClose === -1) break;

      normalized =
        normalized.slice(0, innerStart) +
        `<div${innerMatch[1]}>` +
        normalized.slice(innerOpenEnd, innerClose) +
        "</div>" +
        normalized.slice(innerClose + "</main>".length);
    }

    return normalized;
  };

  /**
   * La pagina Sostienici dedicata pubblica solo i dati necessari al bonifico.
   * Se in futuro il catch-all legacy dovesse tornare a servire lo stesso slug,
   * rimuoviamo comunque i dettagli bancari accessori rimasti nel vecchio markup.
   */
  const minimizeLegacySupportHtml = (html: string): string =>
    html
      .replace(/<li><strong>Banca:<\/strong>[\s\S]*?<\/li>/gi, "")
      .replace(/<li><strong>Sede:<\/strong>[\s\S]*?<\/li>/gi, "");

  /**
   * Drop 001 is a private demand-test prototype.
   * It must never become reachable just because the branch is previewed/deployed.
   * Explicit opt-in only: DROP_001_TEST_ENABLED=true.
   */
  if (
    pathNoSlash.toLowerCase() === "drop-001" &&
    import.meta.env.DROP_001_TEST_ENABLED !== "true"
  ) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }

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

  /**
   * Consolidamento SEO esplicito per la vecchia guida inglese che in produzione
   * veniva ancora servita con HTTP 200 nonostante il redirect in vercel.json.
   * Il middleware è la fonte effettiva per questa route legacy.
   */
  if (pathNoSlash.toLowerCase() === "en/cannabis-laws-italy-2025") {
    return redirect301("/blog/cannabis-laws-italy/");
  }

  /**
   * EN legacy `/en/tag/...` → hub IT `/tag/[slug]/` (slug identico).
   * Prima della normalizzazione trailing-slash sotto: così anche richieste senza `/` finale
   * possono 301 direttamente a `/tag/.../` in un solo hop (Vercel aggiunge spesso uno 308
   * slash, ma non dipendiamo dall’ordine).
   * Se in produzione vedi ancora 200 su queste URL, la build deployata non include questo blocco.
   */
  const enTagLegacy = pathNoSlash.match(/^en\/tag\/([^/]+)(?:\/page\/\d+)?$/);
  if (enTagLegacy?.[1]) {
    return redirect301(`/tag/${enTagLegacy[1]}/`);
  }

  /**
   * Categorie legacy “thin” (WP): 301 verso hub utile. Non usare /partner-selezionati/ qui:
   * quel path è 410 in gonePrefixPatterns sotto.
   * In produzione le URL canoniche hanno sempre `/` finale: i redirect Astro in build Vercel
   * matchano spesso solo la variante senza slash → `vercel.json` duplica le regole con slash e /page/.
   */
  const thinCategoryRedirects: Record<string, string> = {
    "cbd-sport-recupero": "/categoria/salute-benessere/",
    "cbd-animali": "/categoria/salute-benessere/",
    "stili-di-vita-testimonianze": "/categoria/salute-benessere/",
    "partner-e-affiliazioni": "/blog/",
  };
  const thinCatLegacy = pathNoSlash.match(
    /^categoria\/(cbd-sport-recupero|cbd-animali|stili-di-vita-testimonianze|partner-e-affiliazioni)(?:\/page\/\d+)?$/,
  );
  if (thinCatLegacy?.[1] && thinCategoryRedirects[thinCatLegacy[1]]) {
    return redirect301(thinCategoryRedirects[thinCatLegacy[1]]);
  }

  // Trailing slash redirect per pagine HTML:
  // - /contatti -> /contatti/
  // - esclude file con estensione e route tecniche
  const isFileLikePath = /\.[a-z0-9]+$/i.test(pathNoSlash);
  const shouldRedirectToTrailingSlash =
    pathname !== "/" &&
    !pathname.endsWith("/") &&
    !isFileLikePath &&
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_astro/") &&
    !pathname.startsWith("/wp-content/plugins/") &&
    !pathname.startsWith("/wp-content/themes/") &&
    !pathname.startsWith("/wp-content/uploads/") &&
    !pathname.startsWith("/blocks/");

  if (shouldRedirectToTrailingSlash) {
    return redirect301(pathname);
  }

  const gonePrefixPatterns = [
    /^wp-content\/plugins(?:\/|$)/i,
    /^wp-content\/themes(?:\/|$)/i,
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

  // Legacy Italian tag pagination: Astro serves the full tag list on /tag/[slug]/ only.
  if (
    first === "tag" &&
    segments.length === 4 &&
    segments[2]?.toLowerCase() === "page" &&
    /^\d+$/.test(segments[3] || "")
  ) {
    const tagSlug = segments[1] || "";
    if (tagSlug) return redirect301(`/tag/${tagSlug}/`);
  }

  // Legacy monthly archives (WordPress /YYYY/MM/) — no month view; blog hub is the closest hub.
  if (segments.length === 2) {
    const y = parseInt(segments[0] || "", 10);
    const m = parseInt(segments[1] || "", 10);
    if (
      /^\d{4}$/.test(segments[0] || "") &&
      m >= 1 &&
      m <= 12 &&
      y >= 1990 &&
      y <= 2100
    ) {
      return redirect301("/blog/");
    }
  }

  // Legacy feed endpoints (WordPress-style) should be gone, not 404.
  const isLegacyFeedPath =
    segments.length >= 2 &&
    segments[segments.length - 1]?.toLowerCase() === "feed";
  if (isLegacyFeedPath) {
    return gone410();
  }

  let response = await next();

  // Corregge semanticamente eventuali landmark <main> annidati rimasti nei template legacy.
  const initialContentType = response.headers.get("content-type") || "";
  if (response.status === 200 && initialContentType.includes("text/html")) {
    const html = await response.text();
    let normalizedHtml = normalizeNestedMainLandmarks(html);

    if (pathNoSlash.toLowerCase() === "sostieni-la-nostra-causa") {
      normalizedHtml = minimizeLegacySupportHtml(normalizedHtml);
    }

    response = rebuildHtmlResponse(response, normalizedHtml);
  }

  // Identità editoriale: byline e BlogPosting coerenti su homepage e blog.
  const contentType = response.headers.get("content-type") || "";
  const shouldNormalizeEditorialHtml =
    response.status === 200 &&
    contentType.includes("text/html") &&
    (pathNoSlash === "" || pathNoSlash === "blog" || pathNoSlash.startsWith("blog/"));

  if (shouldNormalizeEditorialHtml) {
    const html = await response.text();
    response = rebuildHtmlResponse(response, normalizeEditorialHtml(html));
  }

  // Lab-only enhancement: load the final PDF report polisher without touching the core COA parser.
  if (
    pathNoSlash.toLowerCase() === "lab" &&
    response.status === 200 &&
    (response.headers.get("content-type") || "").includes("text/html")
  ) {
    const html = await response.text();
    const scriptTag = '<script src="/scripts/lab-report-final-polish.js" defer></script>';
    const enhancedHtml = html.includes(scriptTag)
      ? html
      : html.includes("</body>")
        ? html.replace("</body>", `${scriptTag}</body>`)
        : `${html}${scriptTag}`;

    response = rebuildHtmlResponse(response, enhancedHtml);
  }

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