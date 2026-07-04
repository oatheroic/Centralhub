import { useEffect, useState } from "react";

// Copied from apps/_template/src/lib/usePermissions.ts — see that file's
// header comment for the wiring checklist when scaffolding a new app.
const APP_ID = "finance";

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

// No auto-redirect: the caller should render a blocked state that sends
// the user back on click, not on a timer.
export function useReadGuard(permissions: PermissionSet | null, loading: boolean): boolean {
  return !loading && permissions !== null && !permissions.read;
}
