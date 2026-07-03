/**
 * Only allow same-origin relative paths as a post-login redirect target.
 * Without this, an attacker-controlled ?redirect= could send a
 * successfully-authenticated user to an external phishing page (open
 * redirect) — the check must reject absolute URLs, protocol-relative
 * "//host" paths, and backslash tricks, not just require a leading "/".
 */
export function safeRedirectPath(candidate: string | undefined | null): string {
  const fallback = "/";
  if (!candidate) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//")) return fallback;
  if (candidate.includes("\\")) return fallback;
  if (candidate.includes(":")) return fallback;
  return candidate;
}
