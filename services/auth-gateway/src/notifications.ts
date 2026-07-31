import { pool } from "./db.js";

// Platform notification primitive — see db.ts's migrate() for the table
// shape and why it's one row per recipient (including fanned-out
// announcements) rather than a broadcast row.

export type NotificationType = "info" | "success" | "warning" | "action_required";

export type Notification = {
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

export type NotificationInput = {
  sourceAppId: string;
  type?: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  actorSub?: string | null;
  dedupeKey?: string | null;
};

// Fire-and-forget by every caller (permission grants, session revoke, admin
// announcements) — same fail-soft posture as audit.ts's recordAudit(): a
// lost notification must never block or roll back the real mutation it's
// describing. Handles both the single-recipient and fan-out (announcement)
// case with one transaction; a 1-element array is the single case.
export async function fanOutNotification(recipientSubs: string[], input: NotificationInput): Promise<void> {
  if (recipientSubs.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const recipientSub of recipientSubs) {
      await client.query(
        `INSERT INTO notifications (recipient_sub, source_app_id, type, title, body, link, actor_sub, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (recipient_sub, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
        [
          recipientSub,
          input.sourceAppId,
          input.type ?? "info",
          input.title,
          input.body ?? null,
          input.link ?? null,
          input.actorSub ?? null,
          input.dedupeKey ?? null,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("auth-gateway: notification write failed (non-fatal)", err);
  } finally {
    client.release();
  }
}

export async function createNotification(recipientSub: string, input: NotificationInput): Promise<void> {
  await fanOutNotification([recipientSub], input);
}

export async function listNotifications(recipientSub: string, limit = 50): Promise<Notification[]> {
  const capped = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
  // `id DESC` tiebreak matters, not just style: fanOutNotification() inserts
  // a whole batch inside one transaction, and Postgres's now() is pinned to
  // transaction start — every row in an announcement fan-out shares the
  // exact same created_at, so created_at alone leaves their relative order
  // undefined.
  const result = await pool.query<{
    id: number;
    source_app_id: string;
    type: NotificationType;
    title: string;
    body: string | null;
    link: string | null;
    actor_sub: string | null;
    read_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, source_app_id, type, title, body, link, actor_sub, read_at, created_at
     FROM notifications WHERE recipient_sub = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [recipientSub, capped],
  );
  return result.rows.map((row) => ({
    id: row.id,
    sourceAppId: row.source_app_id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    actorSub: row.actor_sub,
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function getUnreadCount(recipientSub: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM notifications WHERE recipient_sub = $1 AND read_at IS NULL`,
    [recipientSub],
  );
  return Number(result.rows[0]?.count ?? 0);
}

// Returns false if the id doesn't exist or belongs to someone else — the
// caller responds 404 either way, never leaking which, so a user can't
// probe for other users' notification ids.
export async function markRead(id: number, recipientSub: string): Promise<boolean> {
  const updated = await pool.query(
    `UPDATE notifications SET read_at = now()
     WHERE id = $1 AND recipient_sub = $2 AND read_at IS NULL`,
    [id, recipientSub],
  );
  if ((updated.rowCount ?? 0) > 0) return true;
  // Already read is still "found" (idempotent success), just distinct from
  // "doesn't exist / not yours" — check ownership separately.
  const owned = await pool.query(
    `SELECT 1 FROM notifications WHERE id = $1 AND recipient_sub = $2`,
    [id, recipientSub],
  );
  return (owned.rowCount ?? 0) > 0;
}

export async function markAllRead(recipientSub: string): Promise<void> {
  await pool.query(
    `UPDATE notifications SET read_at = now() WHERE recipient_sub = $1 AND read_at IS NULL`,
    [recipientSub],
  );
}
