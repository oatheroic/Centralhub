import { useEffect, useState } from "react";
import { useToast } from "@centralhub/ui";

// Copy of apps/_template/src/lib/usePermissions.ts with APP_ID set for this
// app — see README "Pillar 1"/"Pillar 4b" for why this file is duplicated
// per app rather than shared.
const APP_ID = "resource-booking";

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
  const toast = useToast();
  return (...args: Args) => {
    if (!permissions?.[verb]) {
      toast.show({
        title: "Permission denied",
        description: `You don't have "${verb}" permission for this app.`,
        tone: "danger",
      });
      return;
    }
    void action(...args);
  };
}

export function useReadGuard(permissions: PermissionSet | null, loading: boolean): boolean {
  return !loading && permissions !== null && !permissions.read;
}
