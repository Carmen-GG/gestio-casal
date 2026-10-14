import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// El plugin de Cloudflare executa el Worker (API) dins de workerd durant `vite dev`
// i genera la configuració de desplegament a `vite build`.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
