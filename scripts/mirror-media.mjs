import fs from "node:fs/promises";
import path from "node:path";

const SITE = "https://canapalandia.com";
const ALLOWED_HOSTS = new Set(["canapalandia.com", "www.canapalandia.com"]);

const OUT_DIR = path.join(process.cwd(), "public");
const DATA_DIR = path.join(process.cwd(), "data", "wp", "out");

const readJson = async (name) =>
  JSON.parse(await fs.readFile(path.join(DATA_DIR, name), "utf8"));

const stripQueryHash = (u) => String(u).split("#")[0].split("?")[0];

const normalizeToUrl = (u) => {
  const s = stripQueryHash(u);
  if (!s) return null;

  if (s.startsWith("/")) return new URL(s, SITE); // relativo
  if (s.startsWith("//")) return new URL(`https:${s}`); // protocol-relative
  if (s.startsWith("http://") || s.startsWith("https://")) return new URL(s); // assoluto

  return null;
};

const isUploadsUrl = (u) => {
  if (typeof u !== "string" || !u.trim()) return false;

  // relativo diretto
  if (
    u.startsWith(`${new URL(SITE).pathname}wp-content/uploads/`) ||
    u.startsWith("/wp-content/uploads/")
  )
    return true;

  const parsed = normalizeToUrl(u);
  if (!parsed) return false;

  const host = parsed.hostname.toLowerCase();
  return ALLOWED_HOSTS.has(host) && parsed.pathname.startsWith("/wp-content/uploads/");
};

const toLocalPath = (u) => {
  const parsed = normalizeToUrl(u);

  if (!parsed) {
    const clean = stripQueryHash(u);
    return path.join(OUT_DIR, clean.replace(/^\/+/, ""));
  }

  return path.join(OUT_DIR, parsed.pathname.replace(/^\/+/, ""));
};

const extractFromHtml = (html) => {
  if (!html || typeof html !== "string") return [];
  const out = new Set();

  const reAttr = /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = reAttr.exec(html))) {
    const u = (m[1] || "").trim();
    const uu = u.startsWith("//") ? `https:${u}` : u;
    if (isUploadsUrl(uu)) out.add(uu);
  }

  const reSrcset = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
  while ((m = reSrcset.exec(html))) {
    const parts = (m[1] || "")
      .split(",")
      .map((s) => s.trim().split(/\s+/)[0])
      .filter(Boolean);
    for (const u of parts) {
      const uu = u.startsWith("//") ? `https:${u}` : u;
      if (isUploadsUrl(uu)) out.add(uu);
    }
  }

  const reCssUrl = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  while ((m = reCssUrl.exec(html))) {
    const u = (m[1] || "").trim();
    const uu = u.startsWith("//") ? `https:${u}` : u;
    if (isUploadsUrl(uu)) out.add(uu);
  }

  return [...out];
};

const extractFromAny = (obj) => {
  const out = new Set();
  const walk = (v) => {
    if (!v) return;
    if (typeof v === "string") {
      if (isUploadsUrl(v)) out.add(v);
      return;
    }
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === "object") return Object.values(v).forEach(walk);
  };
  walk(obj);
  return [...out];
};

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function download(url, localPath) {
  await ensureDir(localPath);

  const ext = path.extname(localPath).toLowerCase();

  const readHead = async (p, n = 512) => {
    try {
      const fh = await fs.open(p, "r");
      const buf = Buffer.alloc(n);
      const { bytesRead } = await fh.read(buf, 0, n, 0);
      await fh.close();
      return buf.slice(0, bytesRead);
    } catch {
      return null;
    }
  };

  const looksHtml = (buf) => {
    if (!buf || buf.length === 0) return false;
    const s = buf.toString("utf8").toLowerCase();
    return s.includes("<!doctype html") || s.includes("<html");
  };

  const looksSvg = (buf) => {
    if (!buf || buf.length === 0) return false;
    const s = buf.toString("utf8").toLowerCase().trimStart();
    return s.startsWith("<svg") || s.includes("<svg");
  };

  const matchesMagic = (fileExt, buf) => {
    if (!buf || buf.length < 12) return false;

    if (fileExt === ".jpg" || fileExt === ".jpeg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

    if (fileExt === ".png")
      return (
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a
      );

    if (fileExt === ".webp")
      return (
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50
      );

    if (fileExt === ".gif") return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;

    if (fileExt === ".svg") return looksSvg(buf) && !looksHtml(buf);

    return true;
  };

  // se già presente e valido → skip
  const head = await readHead(localPath);
  if (head && !looksHtml(head) && matchesMagic(ext, head)) {
    return { url, ok: true, skipped: true };
  }

  const abs =
    url.startsWith("http")
      ? url
      : url.startsWith("//")
        ? `https:${url}`
        : `${SITE}${url.startsWith("/") ? "" : "/"}${url}`;

  const res = await fetch(abs, {
    headers: { "User-Agent": "canapalandia-media-mirror/1.0" },
  });

  if (!res.ok) return { url: abs, ok: false, status: res.status };

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/html")) {
    return { url: abs, ok: false, status: 422, reason: `Unexpected content-type: ${ct}` };
  }

  const buf = Buffer.from(await res.arrayBuffer());

  if (looksHtml(buf)) return { url: abs, ok: false, status: 422, reason: "HTML payload (soft-404)" };
  if (!matchesMagic(ext, buf))
    return { url: abs, ok: false, status: 422, reason: `Unexpected payload for ${ext} (${ct || "no content-type"})` };

  await fs.writeFile(localPath, buf);
  return { url: abs, ok: true, skipped: false };
}

async function main() {
  const posts = await readJson("posts.json");
  const pages = await readJson("pages.json");

  const urls = new Set();

  for (const p of posts) {
    extractFromHtml(p?.content?.rendered).forEach((u) => urls.add(u));
    extractFromAny(p?.yoast_head_json).forEach((u) => urls.add(u));
  }

  for (const p of pages) {
    extractFromHtml(p?.content?.rendered).forEach((u) => urls.add(u));
    extractFromAny(p?.yoast_head_json).forEach((u) => urls.add(u));
  }

  const list = [...urls];
  console.log(`Trovate ${list.length} URL media da mirrorare`);

  const concurrency = 8;
  let i = 0;
  let ok = 0,
    fail = 0,
    skip = 0;

  const worker = async () => {
    while (i < list.length) {
      const idx = i++;
      const u = list[idx];
      const local = toLocalPath(u);
      const r = await download(u, local);

      if (r.ok) {
        ok++;
        if (r.skipped) skip++;
      } else {
        fail++;
        console.log("FAIL", r.status, r.url, r.reason ? `(${r.reason})` : "");
      }

      if ((idx + 1) % 50 === 0) {
        console.log(`Progress ${idx + 1}/${list.length} (ok:${ok} fail:${fail} skip:${skip})`);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log("DONE", { total: list.length, ok, fail, skip });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});