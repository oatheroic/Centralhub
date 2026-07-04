import { useEffect, useState } from "react";

// Copy this file into a new app's src/lib/ and set APP_ID to match the
// app's id (the same id used for the app-<id> compose service and the
// gateway's /apps/<id>/ route, and that must also be added to
// services/auth-gateway/src/permissions.ts's KNOWN_APPS list — see README
// "Pillar 4" for the full wiring checklist).
const APP_ID = "_template";

export type PermissionSet = { read: boolean; write: boolean; edit: boolean; delete: boolean };
type Verb = keyof PermissionSet;

export function usePermissions(): { permissions: PermissionSet | null; loading: boolean } {
  const [permissions, setPermissions] = useState<PermissionSet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/auth/permissions?app=${APP_ID}`, { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<PermissionSet>) : null))
      .then(setPermissions)
      .finally(() => setLoading(false));
  }, []);

  return { permissions, loading };
}

// Wraps a mutating handler so it only runs if the current user holds the
// given permission for this app; otherwise it alerts and does nothing.
// This is a UX guard, not the security boundary — read access is already
// enforced server-side by Nginx before this app ever loads, but write/edit/
// delete are app-internal actions the gateway has no visibility into, so
// each app's own backend (once it has real mutating endpoints) must still
// re-check permissions server-side too.
export function useGuardedAction<Args extends unknown[]>(
  permissions: PermissionSet | null,
  verb: Verb,
  action: (...args: Args) => void | Promise<void>,
): (...args: Args) => void {
  return (...args: Args) => {
    if (!permissions?.[verb]) {
      window.alert(`You don't have "${verb}" permission for this app.`);
      return;
    }
    void action(...args);
  };
}

// Client-side defense-in-depth only. Nginx's auth_request already blocks
// this app entirely at the network layer if read is denied, before any of
// this code loads — this only covers an already-loaded tab whose
// permission was revoked mid-session. No auto-redirect: the caller should
// render a blocked state that sends the user back on click, not on a timer.
export function useReadGuard(permissions: PermissionSet | null, loading: boolean): boolean {
  return !loading && permissions !== null && !permissions.read;
}
