import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";

export default defineConfig({
  site: "https://spielsignal.de",
  output: "static",
  adapter: vercel(),
  integrations: [sitemap({
    filter: (page) => !page.includes("/redaktion/")
  })],
  build: {
    format: "directory"
  }
});
