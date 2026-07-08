import { listUsers } from "./keycloakAdmin.js";
import { syncRolesFromKeycloak } from "./roles.js";

// Shrinks the §8 gap where a role change made directly in Keycloak's
// console (no accompanying force-logout) sits stale in user_roles until
// that user's session naturally expires or an admin manually revokes it.
// Since hasRole()/getRoles() already treat user_roles as the live source of
// truth (see roles.ts), simply re-running the same sync this service does
// at login — on a timer, for every user — is enough to self-correct within
// one interval; no session revocation or force-logout is needed on top of
// it.
//
// listUsers() already round-trips Keycloak's Admin API once per user for
// role-mappings, so this is deliberately low-frequency (default 60s) — see
// README §13 for why a sub-second poll was rejected as unnecessary load for
// a low-frequency edge case that also has a manual remedy.

const DEFAULT_INTERVAL_MS = 60_000;

export function startRoleSyncPoller(intervalMs = Number(process.env.ROLE_SYNC_INTERVAL_MS ?? DEFAULT_INTERVAL_MS)): NodeJS.Timeout {
  const tick = async () => {
    try {
      const users = await listUsers();
      for (const user of users) {
        await syncRolesFromKeycloak(user.id, user.roles);
      }
    } catch (err) {
      // Keycloak being briefly unreachable (restart, network blip) must not
      // crash the gateway or stop future ticks — same fail-soft posture as
      // seedDevPermissions()/seedDevAttributes() at boot.
      console.warn(`auth-gateway: role re-sync tick failed (non-fatal): ${(err as Error).message}`);
    }
  };

  void tick();
  return setInterval(tick, intervalMs);
}
