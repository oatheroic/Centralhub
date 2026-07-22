// Rendered when Nginx's upstream proxy_pass to app-<id> fails (502/504) —
// e.g. an app registered in the apps table (§12b's dynamic registry) with
// no matching compose service/container yet. Mirrors
// permissionDeniedPage.ts's shape exactly (same layout/behavior, different
// icon/copy) so a real end user gets a styled page instead of a raw Nginx
// error, and so the admin Apps tab's reachability check can tell "denied"
// apart from "unavailable" by matching each page's own marker text — see
// AppsPanel.tsx.
export function renderAppUnavailablePage(redirectTo: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>App unavailable</title>
<style>
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    background: #020617;
    color: #f1f5f9;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .icon {
    width: 48px;
    height: 48px;
    border-radius: 9999px;
    background: rgba(251, 191, 36, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pop 0.35s ease-out;
  }
  .icon svg {
    width: 22px;
    height: 22px;
    stroke: #fbbf24;
  }
  @keyframes pop {
    from { transform: scale(0.6); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  h1 { font-size: 1.125rem; font-weight: 600; margin: 0; }
  p { color: #64748b; font-size: 0.875rem; margin: 0; text-align: center; max-width: 320px; }
  a { color: #818cf8; text-decoration: none; font-size: 0.75rem; }
  a:hover { color: #a5b4fc; }
</style>
</head>
<body>
  <div class="icon">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 9v4"></path>
      <path d="M12 17h.01"></path>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path>
    </svg>
  </div>
  <h1>This app isn't available right now</h1>
  <p>It may not be deployed yet, or is temporarily down. Try again shortly, or ask an administrator.</p>
  <p>Click anywhere to go back to the dashboard.</p>
  <a href="${redirectTo}">Continue now</a>
  <script>
    document.body.style.cursor = "pointer";
    document.body.addEventListener("click", function () {
      window.location.href = ${JSON.stringify(redirectTo)};
    });
  </script>
</body>
</html>`;
}
