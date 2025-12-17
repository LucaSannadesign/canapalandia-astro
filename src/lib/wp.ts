---
const WP_HOST = "https://canapalandia.com";
const BLOG_INDEX_PATH = "blog";
const SITE_URL = "https://canapalandia.com"; // TODO: change when Astro goes live

function stripHtml(input) {
  if (!input) return "";
  return String(input).replace(/<[^>]*>/g, "");
}

function escapeXml(input) {
  const s = String(input ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function absUrl(p) {
  const path = String(p || "");
  if (!path) return SITE_URL;
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

function sortPostsDesc(a, b) {
  if (!a?.date && !b?.date) return 0;
  if (!a?.date) return 1;
  if (!b?.date) return -1;
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}

function buildRssXml(items) {
  const now = new Date().toUTCString();
  const channelTitle = "Canapalandia";
  const channelLink = absUrl("/");
  const channelDesc = "Aggiornamenti e articoli su canapa legale, CBD, normativa, salute.";
  const selfLink = absUrl("/rss.xml");

  const list = (items || []).slice(0, 50).map((p) => {
    const title = stripHtml(postTitle(p)) || "Articolo";
    const href = postHrefFromWp(p);
    const link = absUrl(href);
    const guid = link;
    const pubDate = new Date(p?.date || p?.modified || Date.now()).toUTCString();
    const desc = escapeXml(postExcerpt(p));

    return `\n    <item>\n      <title>${escapeXml(title)}</title>\n      <link>${escapeXml(link)}</link>\n      <guid isPermaLink=\"true\">${escapeXml(guid)}</guid>\n      <pubDate>${escapeXml(pubDate)}</pubDate>\n      <description>${desc}</description>\n    </item>`;
  });

  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\">\n  <channel>\n    <title>${escapeXml(channelTitle)}</title>\n    <link>${escapeXml(channelLink)}</link>\n    <description>${escapeXml(channelDesc)}</description>\n    <lastBuildDate>${escapeXml(now)}</lastBuildDate>\n    <atom:link href=\"${escapeXml(selfLink)}\" rel=\"self\" type=\"application/rss+xml\" />\n    ${list.join("\n")}\n  </channel>\n</rss>\n`;
}

export async function getStaticPaths() {
  const paths = [];

  // Existing paths push for blog index
  paths.push({
    params: { path: BLOG_INDEX_PATH },
    props: { entry: null, kind: "blog-index" },
  });

  paths.push({
    params: { path: "rss.xml" },
    props: { entry: null, kind: "rss" },
  });

  // ... other paths logic ...

  return paths;
}

const routePath = Astro.params.path || "";
const isBlogIndex = routePath === BLOG_INDEX_PATH;
const isRss = Astro.props?.kind === "rss" || routePath === "rss.xml";

// Assuming blogPosts is defined somewhere above
const latest = blogPosts.slice(0, 18);

const rssXml = isRss ? buildRssXml(blogPosts) : "";
if (isRss) {
  Astro.response.headers.set("Content-Type", "application/rss+xml; charset=utf-8");
}
{isRss ? (
  <Fragment set:html={rssXml} />
) : (
  <html lang="it">
<!-- rest of the html markup -->
</html>
)}