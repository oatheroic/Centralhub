import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path MUST match this app's URL prefix (/apps/<name>/). The gateway's
// dynamic regex route derives the upstream/prefix from the URL itself, so
// no matching Nginx edit is needed — just keep this in sync with the folder
// name under apps/.
export default defineConfig({
  base: "/apps/finance/",
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
