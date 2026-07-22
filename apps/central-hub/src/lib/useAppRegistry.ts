import { useEffect, useState } from "react";
import type { AppRegistryEntry } from "../registry/apps";

// Replaces the old static apps/central-hub/src/registry/apps.ts array —
// fetches auth-gateway's apps table once on mount, same shape as
// lib/auth.ts's fetchSession(). `undefined` while loading, distinct from
// an empty array (a real, if unlikely, "no apps registered" state).
export function useAppRegistry(): { apps: AppRegistryEntry[] | undefined } {
  const [apps, setApps] = useState<AppRegistryEntry[] | undefined>(undefined);

  useEffect(() => {
    fetch("/auth/apps", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<AppRegistryEntry[]>) : []))
      .then(setApps)
      .catch(() => setApps([]));
  }, []);

  return { apps };
}
