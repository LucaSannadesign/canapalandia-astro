// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";
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

  integrations: [
    mdx(),
    sitemap({
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