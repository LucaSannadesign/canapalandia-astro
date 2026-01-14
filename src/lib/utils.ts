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

export function stripHtml(html: unknown): string {
    return textFromHtml(html);
}

/**
 * Converte qualsiasi input in testo pulito (stringa).
 * Gestisce stringhe, oggetti, null, undefined.
 * 
 * @param input - Qualsiasi valore (string, object, null, undefined, ecc.)
 * @returns Stringa pulita o stringa vuota
 */
export function toPlainText(input: unknown): string {
    // Se è già una stringa, ritorna trim
    if (typeof input === "string") {
        return input.trim();
    }
    
    // Se è null o undefined, ritorna vuoto
    if (input == null) {
        return "";
    }
    
    // Se è un oggetto, prova a estrarre testo da campi comuni
    if (typeof input === "object") {
        // Prova campi comuni in ordine di priorità
        const candidates = [
            (input as any)?.rendered,
            (input as any)?.value,
            (input as any)?.text,
            (input as any)?.content,
            (input as any)?.children,
            (input as any)?.description,
        ];
        
        for (const candidate of candidates) {
            if (typeof candidate === "string" && candidate.trim()) {
                return candidate.trim();
            }
            // Se candidate è un array, prova a unire
            if (Array.isArray(candidate) && candidate.length > 0) {
                const joined = candidate
                    .map((item) => toPlainText(item))
                    .filter(Boolean)
                    .join(" ");
                if (joined) return joined;
            }
        }
        
        // Se ha toString() e non è "[object Object]", prova quello
        try {
            const str = String(input);
            if (str && str !== "[object Object]" && str !== "[object Array]") {
                return str.trim();
            }
        } catch {
            // Ignora errori
        }
        
        // Ultimo fallback: ritorna vuoto (non JSON.stringify per evitare output verboso)
        return "";
    }
    
    // Per altri tipi (number, boolean, ecc.), converti a stringa
    try {
        return String(input).trim();
    } catch {
        return "";
    }
}

export function excerptFromHtml(html: unknown, max = 150): string {
    const t = textFromHtml(html);
    if (!t) return "";
    if (t.length <= max) return t;
    return t.slice(0, max).replace(/\s+\S*$/, "").trim() + "…";
}

/**
 * Estrae excerpt da qualsiasi sorgente con fallback a content.
 * 
 * @param excerpt - Excerpt originale (può essere string, object, null)
 * @param content - Content HTML per fallback (opzionale)
 * @param maxLength - Lunghezza massima excerpt (default 180)
 * @returns Excerpt pulito o fallback da content
 */
export function getExcerpt(
    excerpt: unknown,
    content?: unknown,
    maxLength = 180
): string {
    // Prova prima l'excerpt
    const excerptText = toPlainText(excerpt);
    if (excerptText) {
        const cleaned = textFromHtml(excerptText);
        if (cleaned) {
            return cleaned.length > maxLength
                ? cleaned.slice(0, maxLength).replace(/\s+\S*$/, "").trim() + "…"
                : cleaned;
        }
    }
    
    // Fallback: usa content se disponibile
    if (content) {
        const contentText = textFromHtml(content);
        if (contentText) {
            return contentText.length > maxLength
                ? contentText.slice(0, maxLength).replace(/\s+\S*$/, "").trim() + "…"
                : contentText;
        }
    }
    
    // Nessun fallback disponibile
    return "";
}

/**
 * Pulisce frasi ribaltate da caratteri escapati e normalizza spazi.
 * Converte:
 * - \\" → "
 * - \\n → spazio (o newline se preferibile)
 * - Spazi multipli → spazio singolo
 * 
 * @param phrase - Frase da pulire (può essere string o unknown)
 * @param preserveNewlines - Se true, converte \\n in newline reale invece di spazio (default: false)
 * @returns Frase pulita
 */
export function cleanPhrase(phrase: unknown, preserveNewlines = false): string {
    if (typeof phrase !== "string") {
        // Se non è stringa, prova toPlainText prima
        const plain = toPlainText(phrase);
        if (!plain) return "";
        phrase = plain;
    }
    
    let cleaned = phrase;
    
    // Converti \\" in " (escape doppio backslash + quote)
    cleaned = cleaned.replace(/\\"/g, '"');
    
    // Converti \\n in spazio o newline
    if (preserveNewlines) {
        cleaned = cleaned.replace(/\\n/g, '\n');
    } else {
        cleaned = cleaned.replace(/\\n/g, ' ');
    }
    
    // Converti altri escape comuni
    cleaned = cleaned.replace(/\\t/g, ' '); // tab → spazio
    cleaned = cleaned.replace(/\\r/g, '');  // carriage return → rimosso
    
    // Normalizza spazi multipli (ma preserva newline se preserveNewlines)
    if (preserveNewlines) {
        // Sostituisci 2+ spazi con uno solo, ma preserva newline
        cleaned = cleaned.replace(/[ \t]+/g, ' ');
        // Normalizza newline multiple (max 2 consecutive)
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    } else {
        // Sostituisci qualsiasi sequenza di whitespace con uno spazio
        cleaned = cleaned.replace(/\s+/g, ' ');
    }
    
    return cleaned.trim();
}

/**
 * Normalizza una frase per creare una chiave univoca per deduplicazione.
 * - lowercase
 * - trim
 * - collapse whitespace (spazi multipli → spazio singolo)
 * 
 * @param phrase - Frase da normalizzare
 * @returns Chiave normalizzata
 */
export function normalizeKey(phrase: string): string {
    if (!phrase || typeof phrase !== "string") return "";
    return phrase
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " "); // Collapse whitespace
}

/**
 * Verifica se una frase è indexable secondo criteri SEO.
 * Una frase è indexable se:
 * - >= 80 caratteri OR >= 12 parole
 * - Non vuota
 * - Non è un placeholder generico
 * 
 * @param phrase - Frase da verificare
 * @returns true se indexable, false altrimenti
 */
export function isIndexablePhrase(phrase: string): boolean {
    if (!phrase || typeof phrase !== "string") return false;
    
    const trimmed = phrase.trim();
    if (trimmed.length === 0) return false;
    
    // Criterio 1: >= 80 caratteri
    if (trimmed.length >= 80) return true;
    
    // Criterio 2: >= 12 parole
    const words = trimmed.split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 12) return true;
    
    // Filtra placeholder comuni (es. "test", "prova", "lorem ipsum", ecc.)
    const placeholderPatterns = [
        /^test\s*$/i,
        /^prova\s*$/i,
        /^lorem\s+ipsum/i,
        /^placeholder/i,
        /^esempio\s*$/i,
        /^sample\s*$/i,
        /^demo\s*$/i,
    ];
    
    if (placeholderPatterns.some(pattern => pattern.test(trimmed))) {
        return false;
    }
    
    // Se non soddisfa criteri minimi, non è indexable
    return false;
}

/* ---------------------------
   Routing / URL normalization
--------------------------- */

export function internalHref(link: unknown): string {
    if (typeof link !== "string") return "/";
    const s = link.trim();
    if (!s) return "/";

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
    const result = internalHref(raw);
    // Assicura che il risultato sia sempre assoluto (inizia con /)
    return result.startsWith("/") ? result : "/";
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
