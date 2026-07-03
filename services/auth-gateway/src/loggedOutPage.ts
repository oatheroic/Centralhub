export function renderLoggedOutPage(redirectTo: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Logged out</title>
<meta http-equiv="refresh" content="1.2;url=${redirectTo}">
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
  .check {
    width: 48px;
    height: 48px;
    border-radius: 9999px;
    background: rgba(16, 185, 129, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pop 0.35s ease-out;
  }
  .check svg {
    width: 24px;
    height: 24px;
    stroke: #34d399;
  }
  .check path {
    stroke-dasharray: 24;
    stroke-dashoffset: 24;
    animation: draw 0.4s 0.15s ease-out forwards;
  }
  @keyframes pop {
    from { transform: scale(0.6); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  @keyframes draw {
    to { stroke-dashoffset: 0; }
  }
  h1 { font-size: 1.125rem; font-weight: 600; margin: 0; }
  p { color: #64748b; font-size: 0.875rem; margin: 0; }
  a { color: #818cf8; text-decoration: none; font-size: 0.75rem; }
  a:hover { color: #a5b4fc; }
</style>
</head>
<body>
  <div class="check">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 6 9 17l-5-5"></path>
    </svg>
  </div>
  <h1>Logged out</h1>
  <p>Redirecting to login&hellip;</p>
  <a href="${redirectTo}">Continue now</a>
  <script>
    setTimeout(function () { window.location.href = ${JSON.stringify(redirectTo)}; }, 900);
  </script>
</body>
</html>`;
}
