export type SessionUser = {
  sub: string;
  name: string;
  email: string;
  roles: string[];
};

export async function fetchSession(): Promise<SessionUser | null> {
  const res = await fetch("/auth/me", { credentials: "same-origin" });
  if (!res.ok) return null;
  return (await res.json()) as SessionUser;
}
