export function renderPermissionDeniedPage(redirectTo: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Access denied</title>
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
  .lock {
    width: 48px;
    height: 48px;
    border-radius: 9999px;
    background: rgba(244, 63, 94, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pop 0.35s ease-out;
  }
  .lock svg {
    width: 22px;
    height: 22px;
    stroke: #fb7185;
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
  <div class="lock">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="10" width="16" height="10" rx="2"></rect>
      <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
    </svg>
  </div>
  <h1>You don't have access to this app</h1>
  <p>Ask an administrator to grant you permission.</p>
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
