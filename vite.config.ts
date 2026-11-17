import { defineConfig } from "vite";

export default defineConfig({
  // Unterpfad für GitHub Pages (z. B. /ROMify/), lokal "/".
  base: process.env.BASE_PATH ?? "/",
  server: { host: true },
});
