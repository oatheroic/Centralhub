import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, getStoredTheme } from "@centralhub/ui/theme";
import App from "./App";
import "./index.css";

// Applied before the first render, not inside a component effect, so
// there's no flash of the (light) default tokens before dark applies.
applyTheme(getStoredTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
