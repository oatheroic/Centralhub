export type MockUser = { name: string; role: string };

export const mockUser: MockUser = { name: "Jordan Lee", role: "Operations Lead" };

const COOKIE_NAME = "chub_user";

/**
 * Same-origin cookie handoff instead of URL query params: every app is
 * served behind the same gateway origin, so a path=/ cookie reaches every
 * downstream app without ever putting identity data in a URL (which would
 * leak into browser history, server logs, and Referer headers).
 */
export function setHandoffCookie(user: MockUser): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(user))}; path=/; SameSite=Lax`;
}
