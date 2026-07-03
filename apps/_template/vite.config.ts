import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path MUST match this app's location block in gateway/conf.d/default.conf
// so built asset URLs resolve correctly behind the reverse proxy.
export default defineConfig({
  base: "/apps/_template/",
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
