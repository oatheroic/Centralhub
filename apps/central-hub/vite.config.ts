import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// DEVIATION FROM apps/_template PATTERN:
// Every other app sets base: "/apps/<name>/" because it's proxied under that
// path prefix. Central Hub is served at the gateway ROOT (location /), so
// its base must be "/" — do NOT copy the "/apps/<name>/" base here.
export default defineConfig({
  base: "/",
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
