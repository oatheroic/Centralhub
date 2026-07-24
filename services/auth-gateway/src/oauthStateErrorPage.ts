// Rendered when /auth/callback's state check fails — most commonly not an
// actual CSRF attempt but chub_auth_state simply expiring (see login.ts's
// STATE_COOKIE maxAge) because the user idled on Keycloak's own login form
// before submitting it. Mirrors permissionDeniedPage.ts's shape (same
// layout/behavior, different icon/copy), but the recovery link restarts
// login (`retryTo`) rather than going to the dashboard, since the dashboard
// would just bounce an unauthenticated user straight back to /auth/login
// anyway — this skips that extra hop.
export function renderOAuthStateErrorPage(retryTo: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Login expired</title>
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
  <h1>Your login attempt took too long and expired</h1>
  <p>This is a routine security check, not an error with your account. Click anywhere to try logging in again.</p>
  <a href="${retryTo}">Try again</a>
  <script>
    document.body.style.cursor = "pointer";
    document.body.addEventListener("click", function () {
      window.location.href = ${JSON.stringify(retryTo)};
    });
  </script>
</body>
</html>`;
}
