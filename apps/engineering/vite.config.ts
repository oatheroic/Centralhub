import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Plain Vite SPA config, replacing @lovable.dev/vite-tanstack-config's
// TanStack Start/Cloudflare Workers preset — see README's third-party app
// ingestion section for why (real RLS survives, but there was no
// privileged SSR logic worth preserving here either — CentralHub is the
// only login, and every server function this app had was either dropped
// or rewritten as a Postgres RPC behind PostgREST). Ships as a static
// build behind Nginx, matching every other app in this repo.
export default defineConfig({
  base: "/apps/engineering/",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: "dist",
  },
});
