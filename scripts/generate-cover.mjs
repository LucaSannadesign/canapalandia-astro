#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public", "images");

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function safeText(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapTitle(title, maxLen = 36) {
  const words = String(title).trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxLen && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3); // max 3 righe
}

function fileSize(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

async function main() {
  const slug = arg("--slug");
  const title = arg("--title") ?? slug ?? "Canapalandia";
  const category = arg("--category") ?? "Blog";

  if (!slug) {
    console.error("Missing --slug");
    process.exit(1);
  }

  ensureDir(OUT_DIR);

  const outFile = path.join(OUT_DIR, `${slug}.webp`);

  // se esiste ed è >0 byte => SKIP
  const size = fileSize(outFile);
  if (size > 0) {
    console.log(`[cover] SKIP (exists): ${path.relative(ROOT, outFile)} (${size} bytes)`);
    return;
  }

  // dimensioni 16:9
  const W = 1600;
  const H = 900;

  // safe area (testo lontano dai bordi)
  const PAD = 110;

  const lines = wrapTitle(title, 34);
  const titleSvg = lines
    .map((l, idx) => {
      const y = 0 + idx * 86;
      return `<text x="0" y="${y}" font-size="72" font-weight="800" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" fill="white">${safeText(l)}</text>`;
    })
    .join("\n");

  // Piccolo “watermark” simbolico (niente testo)
  const watermark = `
    <g opacity="0.55" transform="translate(${W - PAD - 54}, ${H - PAD - 54})">
      <circle cx="27" cy="27" r="26" fill="none" stroke="#9AE6B4" stroke-width="2"/>
      <path d="M27 10 C20 22, 20 33, 27 44 C34 33, 34 22, 27 10 Z" fill="#9AE6B4"/>
    </g>
  `;

  // Illustrazione semplice: foglia + “tribunale” + bandiera (senza asset esterni)
  const svg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#071A12"/>
        <stop offset="55%" stop-color="#0B2A1D"/>
        <stop offset="100%" stop-color="#06110C"/>
      </linearGradient>
      <linearGradient id="panel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(0,0,0,0.58)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.28)"/>
      </linearGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="rgba(0,0,0,0.45)"/>
      </filter>
    </defs>

    <rect width="${W}" height="${H}" fill="url(#bg)"/>

    <!-- bandiera IT (accento) -->
    <g opacity="0.85">
      <rect x="${PAD}" y="${PAD - 40}" width="90" height="12" fill="#2F855A"/>
      <rect x="${PAD + 94}" y="${PAD - 40}" width="90" height="12" fill="#F7FAFC"/>
      <rect x="${PAD + 188}" y="${PAD - 40}" width="90" height="12" fill="#C53030"/>
    </g>

    <!-- “card” testo -->
    <rect x="${PAD - 30}" y="${PAD + 60}" width="${W * 0.60}" height="${H * 0.56}"
          rx="34" fill="url(#panel)" filter="url(#softShadow)"/>

    <!-- categoria -->
    <g transform="translate(${PAD}, ${PAD + 150})" opacity="0.92">
      <rect x="-18" y="-46" rx="18" ry="18" width="260" height="60" fill="rgba(154,230,180,0.12)" stroke="rgba(154,230,180,0.35)"/>
      <text x="0" y="-8" font-size="28" font-weight="700" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial"
            fill="#9AE6B4" letter-spacing="1">${safeText(category).toUpperCase()}</text>
    </g>

    <!-- titolo -->
    <g transform="translate(${PAD}, ${PAD + 260})">
      ${titleSvg}
    </g>

    <!-- illustrazione a destra: foglia + “tribunale” -->
    <g transform="translate(${W * 0.68}, ${H * 0.18})" opacity="0.95">
      <!-- tribunale -->
      <g transform="translate(40, 190)">
        <rect x="0" y="230" width="440" height="40" rx="16" fill="rgba(255,255,255,0.10)"/>
        <rect x="40" y="100" width="360" height="140" rx="20" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.16)"/>
        <path d="M60 100 L220 20 L380 100 Z" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)"/>
        <!-- colonne -->
        ${[0,1,2,3].map(i=>`<rect x="${90+i*80}" y="120" width="34" height="110" rx="10" fill="rgba(255,255,255,0.10)"/>`).join("")}
      </g>

      <!-- foglia stilizzata -->
      <g transform="translate(0, 0)">
        <path d="M260 40
                 C160 120, 120 240, 180 360
                 C220 440, 320 440, 360 360
                 C420 240, 380 120, 260 40 Z"
              fill="rgba(154,230,180,0.18)" stroke="rgba(154,230,180,0.45)" stroke-width="6"/>
        <path d="M260 90 L260 430" stroke="rgba(154,230,180,0.55)" stroke-width="6" stroke-linecap="round"/>
        <path d="M260 140 C220 170, 200 210, 188 260" stroke="rgba(154,230,180,0.40)" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M260 140 C300 170, 320 210, 332 260" stroke="rgba(154,230,180,0.40)" stroke-width="5" fill="none" stroke-linecap="round"/>
      </g>
    </g>

    ${watermark}
  </svg>
  `;

  const buf = await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ quality: 86 })
    .toBuffer();

  fs.writeFileSync(outFile, buf);
  console.log(`[cover] WROTE: ${path.relative(ROOT, outFile)} (${buf.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});