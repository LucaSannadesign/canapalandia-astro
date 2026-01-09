import { WP_HOST } from "./consts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function ensureNoTrailingSlash(s: string): string {
    return s.endsWith("/") ? s.slice(0, -1) : s;
}

export function ensureLeadingSlash(s: string): string {
    if (!s) return "/";
    return s.startsWith("/") ? s : `/${s}`;
}

export function normalizeSlugLikePath(pathLike: string): string {
    return pathLike.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

export function getLastSegment(slugOrPath: string): string {
    const s = normalizeSlugLikePath(slugOrPath);
    return s.includes("/") ? s.split("/").filter(Boolean).pop()! : s;
}


/* ---------------------------
   Helpers: HTML → clean text
--------------------------- */

export function decodeHtmlEntities(input: string): string {
    return input
        .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
            const cp = parseInt(hex, 16);
            return Number.isFinite(cp) ? String.fromCodePoint(cp) : _m;
        })
        .replace(/&#(\d+);/g, (_m, num) => {
            const cp = parseInt(num, 10);
            return Number.isFinite(cp) ? String.fromCodePoint(cp) : _m;
        })
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

export function textFromHtml(html: unknown): string {
    if (typeof html !== "string") return "";
    const decoded = decodeHtmlEntities(html);
    return decoded
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function stripHtml(html: string): string {
    return textFromHtml(html);
}

export function excerptFromHtml(html: unknown, max = 150): string {
    const t = textFromHtml(html);
    if (!t) return "";
    if (t.length <= max) return t;
    return t.slice(0, max).replace(/\s+\S*$/, "").trim() + "…";
}

/* ---------------------------
   Routing / URL normalization
--------------------------- */

export function internalHref(link: unknown): string {
    if (typeof link !== "string") return "#";
    const s = link.trim();
    if (!s) return "#";

    if (s.startsWith("/")) return s.endsWith("/") ? s : s + "/";

    try {
        const u = new URL(s, WP_HOST);
        const host = u.hostname.replace(/^www\./i, "");

        if (host && host !== new URL(WP_HOST).hostname.replace(/^www\./i, "")) return s;

        const p = u.pathname || "/";
        return p.endsWith("/") ? p : p + "/";
    } catch {
        const stripped = s.replace(/^https?:\/\/[^/]+/i, "");
        const p = stripped.startsWith("/") ? stripped : "/" + stripped;
        return p.endsWith("/") ? p : p + "/";
    }
}

export function entryHref(p: any): string {
    const raw = p?.path ?? p?.uri ?? p?.slug ?? p?.link ?? "";
    return internalHref(raw);
}

/* ---------------------------
   Media resolution
--------------------------- */

// Approximation of PUBLIC_DIR based on where this file is running (server-side)
// Adjust if needed, or pass it in. In Astro build structure this might be tricky if not standardized.
// For now, assuming standard proj structure: src/lib -> ../../public
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

export function resolveWpMediaSrc(src: unknown): string {
    if (typeof src !== "string") return "";
    let s = src.trim();
    if (!s) return "";

    if (s.startsWith("//")) s = `https:${s}`;

    // relative
    if (s.startsWith("/")) {
        const local = path.join(PUBLIC_DIR, s.replace(/^\//, ""));
        return fs.existsSync(local) ? s : `${WP_HOST}${s}`;
    }

    // absolute
    try {
        const u = new URL(s);
        const host = u.hostname.replace(/^www\./i, "");
        const pathname = u.pathname || "/";

        // Check if it matches our WP host
        const wpHostName = new URL(WP_HOST).hostname.replace(/^www\./i, "");

        if (host === wpHostName) {
            const local = path.join(PUBLIC_DIR, pathname.replace(/^\//, ""));
            return fs.existsSync(local) ? pathname : s;
        }

        return s;
    } catch {
        return s;
    }
}
