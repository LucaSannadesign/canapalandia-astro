import postsJson from "../../data/wp/out/posts.json";
import pagesJson from "../../data/wp/out/pages.json";

export const WP_HOST = "https://canapalandia.com";

export type WpKind = "post" | "page";

export type WpEntry = {
  kind: WpKind;
  id?: number;
  slug: string;
  path: string; // normalized, no leading/trailing slashes
  link?: string;

  title?: string;
  html?: string;
  excerpt?: string;

  date?: string;
  modified?: string;

  /** Featured image (best-effort) extracted from WP REST `_embedded` and/or Yoast. */
  featuredImage?: { src: string; alt: string };

  yoastHead?: string;
  yoastHeadJson?: any;

  raw?: any;
};

function pickFeaturedMediaFromEmbedded(raw: any): { src: string; alt: string } | undefined {
  const fm = raw?._embedded?.["wp:featuredmedia"]?.[0];
  if (!fm) return undefined;

  const src =
    fm?.media_details?.sizes?.medium_large?.source_url ||
    fm?.media_details?.sizes?.large?.source_url ||
    fm?.media_details?.sizes?.full?.source_url ||
    fm?.source_url;

  const alt = fm?.alt_text || fm?.title?.rendered || "";
  if (typeof src === "string" && src.trim().length) {
    return { src: src.trim(), alt: String(alt ?? "") };
  }
  return undefined;
}

function pickFeaturedMediaFromYoast(raw: any): { src: string; alt: string } | undefined {
  const src = raw?.yoast_head_json?.og_image?.[0]?.url || raw?.yoast_head_json?.og_image?.[0]?.src;
  if (typeof src === "string" && src.trim().length) return { src: src.trim(), alt: "" };
  return undefined;
}

function pickString(v: any): string | undefined {
  return typeof v === "string" && v.trim().length ? v : undefined;
}

function stripQueryHash(u: string): string {
  return u.split("#")[0].split("?")[0];
}

/**
 * Convert WP url/slug/object -> pathname without leading/trailing slashes.
 * Examples:
 *  - "https://canapalandia.com/foo/bar/" -> "foo/bar"
 *  - "/foo/bar/" -> "foo/bar"
 *  - "foo/bar" -> "foo/bar"
 */
export function toParams(input: any): string {
  let s = "";

  if (typeof input === "string") {
    s = input.trim();
  } else if (input && typeof input === "object") {
    const o: any = input;
    s = String(o.path ?? o.uri ?? o.slug ?? o.link ?? o.url ?? "").trim();
  }

  if (!s) return "";

  // If absolute URL, take pathname
  if (/^https?:\/\//i.test(s) || s.startsWith("//")) {
    try {
      const u = new URL(s.startsWith("//") ? `https:${s}` : s);
      s = u.pathname;
    } catch {
      // ignore
    }
  }

  s = stripQueryHash(s);
  return s.replace(/^\/+|\/+$/g, "");
}

/** Normalize any value into `string | undefined` suitable for Astro params. */
export function normalizePath(input: unknown): string | undefined {
  let v: any = input;

  if (Array.isArray(v)) v = v.join("/");
  if (v && typeof v === "object") {
    v = (v as any).path ?? (v as any).slug ?? (v as any).uri ?? (v as any).value ?? "";
    if (Array.isArray(v)) v = v.join("/");
  }

  const s = String(v ?? "")
    .split(/[?#]/)[0]
    .replace(/^\/+|\/+$/g, "")
    .trim();

  return s.length ? s : undefined;
}

function normalizeEntry(kind: WpKind, raw: any): WpEntry {
  const slug = pickString(raw?.slug) ?? "";
  const link = pickString(raw?.link);

  // Prefer canonical/link because they preserve the real URL structure
  // (e.g. multilingual paths like /en/... or custom permalink settings).
  const canonical =
    pickString(raw?.yoast_head_json?.canonical) ??
    pickString(raw?.yoastHeadJson?.canonical);

  const candidatePath = canonical ?? link ?? raw?.path ?? raw?.uri ?? slug;
  const path = toParams(candidatePath);

  const title = pickString(raw?.title?.rendered) ?? pickString(raw?.title);
  const html = pickString(raw?.content?.rendered) ?? pickString(raw?.html);
  const excerpt = pickString(raw?.excerpt?.rendered) ?? pickString(raw?.excerpt);

  return {
    kind,
    id: typeof raw?.id === "number" ? raw.id : undefined,
    slug,
    path,
    link,
    title,
    html,
    excerpt,
    date: pickString(raw?.date),
    modified: pickString(raw?.modified),
    featuredImage: pickFeaturedMediaFromEmbedded(raw) ?? pickFeaturedMediaFromYoast(raw),
    yoastHead: pickString(raw?.yoast_head) ?? pickString(raw?.yoastHead),
    yoastHeadJson: raw?.yoast_head_json ?? raw?.yoastHeadJson,
    raw,
  };
}

export async function loadWp(): Promise<{ entries: WpEntry[] }> {
  const posts = Array.isArray(postsJson) ? postsJson : [];
  const pages = Array.isArray(pagesJson) ? pagesJson : [];

  const entries: WpEntry[] = [];
  for (const p of posts) entries.push(normalizeEntry("post", p));
  for (const p of pages) entries.push(normalizeEntry("page", p));

  // Dedupe by path
  const seen = new Set<string>();
  const out: WpEntry[] = [];

  for (const e of entries) {
    if (!e.path) continue;
    if (seen.has(e.path)) continue;
    seen.add(e.path);
    out.push(e);
  }

  return { entries: out };
}