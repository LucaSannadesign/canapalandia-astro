// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

export default defineConfig({
  site: "https://canapalandia.com",
  trailingSlash: "always",
  output: "server",
  adapter: vercel(),
});