import { pool } from "./db.js";

// Absence of a row = never revoked (default open). A session is rejected
// if its JWT was issued before the stored revoked_before timestamp — this
// is deliberately per-user, not per-session/jti: nothing in this system
// tracks or lists individual concurrent sessions, so "kill this user's
// session" in practice means "kill all of that user's current sessions."
// See README "Pillar 4c" for why a jti-keyed table was rejected as
// over-engineered for the actual requirement.

export async function isRevoked(userSub: string, issuedAt: Date): Promise<boolean> {
  const result = await pool.query<{ revoked_before: Date }>(
    "SELECT revoked_before FROM session_revocations WHERE user_sub = $1",
    [userSub],
  );
  const row = result.rows[0];
  if (!row) return false;
  // Compare at whole-second granularity: a JWT's `iat` is floored to the
  // second, while `revoked_before` is a microsecond `now()`. Without the
  // truncation, a session legitimately issued a few hundred ms AFTER the
  // revocation — in the same wall-clock second — has an `iat` that still
  // sorts before it, and the user's fresh re-login is rejected as revoked
  // (found live: scripts/test-stack.mjs's revoke-then-relogin got fast
  // enough to hit this). The cost is a sub-second window in which a
  // session issued just BEFORE the revocation survives — unavoidable with
  // second-granular `iat`, and irrelevant to the actual use case.
  const revokedBeforeSec = Math.floor(new Date(row.revoked_before).getTime() / 1000);
  return Math.floor(issuedAt.getTime() / 1000) < revokedBeforeSec;
}

export async function revokeUser(userSub: string): Promise<void> {
  await pool.query(
    `INSERT INTO session_revocations (user_sub, revoked_before)
     VALUES ($1, now())
     ON CONFLICT (user_sub) DO UPDATE SET revoked_before = now()`,
    [userSub],
  );
}
