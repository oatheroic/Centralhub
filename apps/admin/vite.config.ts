import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path MUST match this app's URL prefix (/apps/admin/). The gateway's
// dynamic regex route derives the upstream/prefix from the URL itself, so
// no matching Nginx edit is needed — just keep this in sync with the folder
// name under apps/. (The admin-role gate in gateway/conf.d/default.conf is
// a SEPARATE, more specific location block that already targets this exact
// path — it doesn't depend on this base value.)
export default defineConfig({
  base: "/apps/admin/",
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
