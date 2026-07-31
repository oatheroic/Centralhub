import { useCallback, useEffect, useRef, useState } from "react";
import * as RadixPopover from "@radix-ui/react-popover";
import { Bell } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  type NotificationType,
} from "../notifications";

// Self-contained, no props needed — same posture as ThemeToggle (reads/
// writes its own state) rather than the "app owns the fetch" split used
// for things like usePermissions.ts. There's nothing app-specific to
// inject here (every app hits the identical same-origin /auth/notifications*
// routes), so duplicating the fetch/poll logic per app the way
// usePermissions.ts is duplicated (which genuinely needs a per-app APP_ID)
// would just be copy-paste with no variation.
const POLL_MS = 30_000;

const TYPE_BORDER: Record<NotificationType, string> = {
  info: "border-l-accent",
  success: "border-l-success",
  warning: "border-l-accent",
  action_required: "border-l-danger",
};

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCount = useCallback(() => {
    fetchUnreadCount()
      .then(setUnread)
      .catch(() => {
        // Count polling is best-effort UI chrome, not a security boundary —
        // a transient failure (e.g. a revoked session between polls) just
        // leaves the badge stale until the next successful poll rather than
        // surfacing an error to the whole header.
      });
  }, []);

  // Polls while the tab is visible, pauses while hidden (and refetches
  // immediately on becoming visible again) — avoids needless load and a
  // stale badge on a backgrounded tab.
  useEffect(() => {
    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    function startPolling() {
      if (pollRef.current) return;
      pollRef.current = setInterval(refreshCount, POLL_MS);
    }
    function onVisibilityChange() {
      if (document.hidden) {
        stopPolling();
      } else {
        refreshCount();
        startPolling();
      }
    }
    refreshCount();
    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshCount]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Lazy-load: history is only fetched the first time the panel opens,
    // not on every poll tick.
    if (next && items === null) {
      fetchNotifications()
        .then(setItems)
        .catch((err) => setLoadError((err as Error).message));
    }
  }

  function handleItemClick(item: NotificationItem) {
    if (!item.readAt) {
      const readAt = new Date().toISOString();
      setItems((prev) => prev?.map((n) => (n.id === item.id ? { ...n, readAt } : n)) ?? prev);
      setUnread((prev) => Math.max(0, prev - 1));
      // Best-effort: a failed mark-read just leaves it unread server-side;
      // the next count poll will self-correct the badge either way.
      markNotificationRead(item.id).catch(() => refreshCount());
    }
    if (item.link) {
      window.location.href = item.link;
    }
  }

  function handleMarkAllRead() {
    const readAt = new Date().toISOString();
    setItems((prev) => prev?.map((n) => (n.readAt ? n : { ...n, readAt })) ?? prev);
    setUnread(0);
    markAllNotificationsRead().catch(() => refreshCount());
  }

  const hasUnreadInList = items?.some((n) => !n.readAt) ?? false;

  return (
    <RadixPopover.Root open={open} onOpenChange={handleOpenChange}>
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition hover:bg-border hover:text-text [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10 ${className}`}
        >
          <Bell size={16} />
          {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />}
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-2 shadow-lg"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-semibold text-text">Notifications</span>
            {hasUnreadInList && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-accent hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {loadError && <p className="px-3 py-6 text-center text-sm text-danger">Couldn't load notifications.</p>}
            {!loadError && items === null && (
              <div className="space-y-2 p-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}
            {!loadError && items?.length === 0 && (
              <EmptyState title="No notifications" description="You're all caught up." />
            )}
            {!loadError &&
              items?.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`block w-full rounded-lg border-l-2 px-3 py-2 text-left transition hover:bg-bg ${TYPE_BORDER[item.type]} ${item.readAt ? "opacity-60" : ""}`}
                >
                  <p className="text-sm font-medium text-text">{item.title}</p>
                  {item.body && <p className="mt-0.5 text-xs text-text-muted">{item.body}</p>}
                  <p className="mt-1 text-[11px] text-text-muted">{timeAgo(item.createdAt)}</p>
                </button>
              ))}
          </div>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
