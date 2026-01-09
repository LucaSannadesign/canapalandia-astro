// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import { fileURLToPath } from "node:url";

import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://canapalandia.com",
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

  integrations: [sitemap()],
});