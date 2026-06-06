import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";

export default defineConfig({
  site: "https://spielsignal.de",
  output: "static",
  adapter: vercel(),
  integrations: [sitemap()],
  build: {
    format: "directory"
  }
});
