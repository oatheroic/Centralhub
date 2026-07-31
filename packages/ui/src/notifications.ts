// Framework-free fetch wrappers for the platform notification primitive
// (services/auth-gateway's /auth/notifications* routes) — same split as
// theme.ts: no React import, so NotificationBell.tsx's polling logic stays
// testable/reusable independent of the component. Same-origin behind the
// gateway means chub_session travels automatically; no per-app token
// wiring, unlike the data-token/RLS apps (README §10).

export type NotificationType = "info" | "success" | "warning" | "action_required";

export type NotificationItem = {
  id: number;
  sourceAppId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  actorSub: string | null;
  readAt: string | null;
  createdAt: string;
};

async function call<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/auth${path}`, { credentials: "same-origin", ...opts });
  if (!res.ok) throw new Error(`${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function fetchUnreadCount(): Promise<number> {
  const { unread } = await call<{ unread: number }>("/notifications/count");
  return unread;
}

export function fetchNotifications(limit = 50): Promise<NotificationItem[]> {
  return call<NotificationItem[]>(`/notifications?limit=${limit}`);
}

export function markNotificationRead(id: number): Promise<void> {
  return call<void>(`/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<void> {
  return call<void>("/notifications/read-all", { method: "POST" });
}
