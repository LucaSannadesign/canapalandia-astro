// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import sitemapPages from "./src/data/sitemap-pages.json" assert { type: "json" };

const site = "https://canapalandia.com";

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

  server: {
    watch: {
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/.astro/**",
        "**/.vercel/**",
        "**/coverage/**",
      ],
      usePolling: false,
    },
  },

  optimizeDeps: {
    exclude: ["fs", "path"],
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },

  // Vercel adapter (server output)
  adapter: vercel({
    runtime: "serverless",
  }),

  image: {
    domains: ["canapalandia.com"],
    remotePatterns: [{ protocol: "https" }],
  },

  integrations: [
    mdx(),
    sitemap({
      customPages: sitemapPages,
      filter: (page) => {
        if (typeof page !== "string") return true;

        try {
          const url = new URL(page);
          const pathname = url.pathname;

          if (pathname.startsWith("/partials/")) return false;
          if (pathname.startsWith("/en/")) return false;

          if (pathname.startsWith("/tag/")) return false;
          if (pathname.startsWith("/categoria/")) return false;
          if (pathname.startsWith("/autore/")) return false;

          if (pathname.startsWith("/en/tag/")) return false;
          if (pathname.startsWith("/en/categoria/")) return false;
          if (pathname.startsWith("/en/autore/")) return false;
          if (pathname.startsWith("/en/author/")) return false;

          if (pathname.startsWith("/partner-selezionati")) return false;
          if (pathname.startsWith("/go/")) return false;
        } catch {
          return true;
        }

        return true;
      },
    }),
  ],
});