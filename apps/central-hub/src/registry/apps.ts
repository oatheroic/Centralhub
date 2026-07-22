// Data now lives in auth-gateway's `apps` table (see
// services/auth-gateway/src/apps.ts) and is fetched at runtime by
// ../lib/useAppRegistry — this file keeps only the shared shape. `icon` is
// a string key (Lucide icon name), resolved to a component via
// ../lib/icons; `path` isn't part of the wire shape — see
// AppCard.tsx's appPath().
export type AppRegistryEntry = {
  /** Matches apps/<id> and the app-<id> compose service name. */
  id: string;
  name: string;
  department: string;
  icon: string;
  description?: string | null;
  /** Excludes this entry from the hub's own grid (used for central-hub itself). */
  hidden?: boolean;
  /**
   * Only shows this entry to users whose session includes this Keycloak
   * role. Purely a discoverability affordance — the actual access gate is
   * always enforced server-side (Nginx role check), unaffected by this.
   */
  requiresRole?: string | null;
};
