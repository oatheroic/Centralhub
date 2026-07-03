export type HandoffUser = { name: string; role: string };

export function readHandoffCookie(): HandoffUser | null {
  const match = document.cookie.match(/(?:^|;\s*)chub_user=([^;]*)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as HandoffUser;
  } catch {
    return null;
  }
}
