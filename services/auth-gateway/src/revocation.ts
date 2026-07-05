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
  return issuedAt < new Date(row.revoked_before);
}

export async function revokeUser(userSub: string): Promise<void> {
  await pool.query(
    `INSERT INTO session_revocations (user_sub, revoked_before)
     VALUES ($1, now())
     ON CONFLICT (user_sub) DO UPDATE SET revoked_before = now()`,
    [userSub],
  );
}
