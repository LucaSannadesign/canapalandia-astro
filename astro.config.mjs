// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";

const site = "https://canapalandia.com";

/** 301: slug blog evergreen, hub tag legacy, paginazione blog page/1, allineati a URL pubblici reali */
const evergreenRedirects = {
  "/blog/cannabis-laws-italy-2025/": "/blog/cannabis-laws-italy/",
  "/blog/top-hemp-strains-2025/": "/blog/top-hemp-strains/",
  "/blog/medical-cannabis-slovenia-albania-italy-2025/":
    "/blog/medical-cannabis-slovenia-albania-italy/",
  "/blog/italy-light-cannabis-ban-security-decree-2025/":
    "/blog/italy-light-cannabis-ban-security-decree/",
  "/blog/cannabis-light-italia-europa-luglio-novembre-2025/":
    "/blog/cannabis-light-italia-europa/",
  "/blog/cbd-legale-2025-decreto-sicurezza/": "/blog/cbd-legale-decreto-sicurezza/",
  "/blog/best-cbd-strains-2025/": "/blog/best-cbd-strains/",
  "/blog/cbd-per-la-cura-della-pelle-guida-2025-prodotti-nordic-oil/":
    "/blog/cbd-per-la-cura-della-pelle-prodotti-nordic-oil/",
  "/blog/decreto-sicurezza-cannabis-light-2025/":
    "/blog/decreto-sicurezza-cannabis-light/",
  "/blog/legalizzazione-cannabis-europa-2025-aggiornamenti/":
    "/blog/legalizzazione-cannabis-europa-aggiornamenti/",
  "/tag/": "/blog/",
  "/blog/page/1/": "/blog/",
  // Categorie WP thin → hub (allineato a middleware)
  "/categoria/cbd-sport-recupero/": "/categoria/salute-benessere/",
  "/categoria/cbd-animali/": "/categoria/salute-benessere/",
  "/categoria/stili-di-vita-testimonianze/": "/categoria/salute-benessere/",
  "/categoria/partner-e-affiliazioni/": "/blog/",
};

export default defineConfig({
  site,
  trailingSlash: "always",
  output: "server",
  redirects: evergreenRedirects,

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