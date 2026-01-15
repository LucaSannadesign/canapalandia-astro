// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import { fileURLToPath } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

const site = "https://canapalandia.com";

// Aggiunge anche i post blog (content collections) alla sitemap.
const now = new Date();
const BLOG_DIR = fileURLToPath(new URL("./src/content/blog", import.meta.url));

const listFilesRecursive = async (dir) => {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full)));
    } else {
      out.push(full);
    }
  }
  return out;
};

const parseFrontmatter = (raw) => {
  // Estrai solo il primo blocco frontmatter YAML: --- ... ---
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/m);
  const fm = m?.[1] || "";
  const get = (key) => {
    const mm = fm.match(new RegExp(`^${key}:\\s*(.+)\\s*$`, "m"));
    return mm?.[1]?.trim();
  };
  return {
    draft: get("draft"),
    publishDate: get("publishDate"),
  };
};

const blogFiles = (await listFilesRecursive(BLOG_DIR)).filter(
  (p) => p.endsWith(".md") || p.endsWith(".mdx"),
);

const blogPostPages = [];
for (const filePath of blogFiles) {
  const fileName = filePath.split("/").pop() || "";
  const slug = fileName.replace(/\.(md|mdx)$/i, "");
  if (!slug || slug === "undefined") continue;

  const raw = await readFile(filePath, "utf8");
  const fm = parseFrontmatter(raw);

  if ((fm.draft || "").toLowerCase() === "true") continue;

  if (fm.publishDate) {
    const d = new Date(fm.publishDate);
    if (!Number.isNaN(d.getTime()) && d.getTime() > now.getTime()) continue;
  }

  blogPostPages.push(new URL(`/blog/${slug}/`, site).href);
}

export default defineConfig({
  site,
  trailingSlash: "always",
  output: "server",

  // Alias stabile per import tipo: "@/layouts/SiteLayout.astro"
  vite: {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },

  // Vercel adapter (server output)
  adapter: vercel({
    // puoi cambiare in "edge" se vuoi Edge Functions
    // ma "serverless" è la scelta più compatibile
    runtime: "serverless",
  }),

  image: {
    domains: ["canapalandia.com"],
    remotePatterns: [{ protocol: "https" }],
  },

  integrations: [
    mdx(),
    sitemap({
      customPages: blogPostPages,
      filter: (page) => {
        // page è una stringa URL completo (es. "https://canapalandia.com/tag/slug/")
        if (typeof page !== "string") return true;

        // Estrai pathname dall'URL
        try {
          const url = new URL(page);
          const pathname = url.pathname;

          // Escludi endpoint tecnici
          if (pathname.startsWith("/partials/")) return false;
          // Escludi pagine EN (legacy, noindex)
          if (pathname.startsWith("/en/")) return false;
          // Escludi pagine tag (noindex per evitare bloat)
          if (pathname.startsWith("/tag/")) return false;
          if (pathname.startsWith("/en/tag/")) return false;
        } catch {
          // Se URL non valido, includi per sicurezza
          return true;
        }

        return true;
      },
    }),
  ],
});