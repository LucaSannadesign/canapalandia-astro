// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";

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
  ],
});