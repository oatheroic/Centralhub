import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, getStoredTheme } from "@centralhub/ui/theme";
import App from "./App";
import "./styles.css";

// Applied before the first render, not inside a component effect, so
// there's no flash of the (light) default tokens before dark applies.
// Uses the theme subpath (no React import) — this app runs React 19,
// packages/ui's React components target ^18.3.1, see AssetsNav.tsx.
applyTheme(getStoredTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
