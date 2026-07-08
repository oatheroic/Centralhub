import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Plain Vite SPA config, replacing @lovable.dev/vite-tanstack-config's
// TanStack Start/Cloudflare Workers preset — see README's third-party app
// ingestion section for why (RLS already enforced nothing server-side, so
// there was no privileged SSR logic worth preserving; the app now ships as
// a static build behind Nginx, matching every other app in this repo).
export default defineConfig({
  base: "/apps/assets/",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: "dist",
  },
});
