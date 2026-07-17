import { pool } from "./db.js";

// Append-only record of admin-initiated authorization changes (and the
// system's own role re-sync), so "who changed what, when" is answerable
// without direct DB access. Every write here is fail-soft: a lost log line
// must never block or roll back the real mutation it's describing, so
// callers fire-and-forget this rather than awaiting it into their own
// error path.

export type AuditAction =
  | "permission.update"
  | "permission.bulk_update"
  | "session.revoke"
  | "role.sync"
  | "attribute.update"
  | "role_rule.create"
  | "role_rule.delete"
  | "role_override.upsert"
  | "role_override.delete"
  | "attribute_value.rename"
  | "attribute_value.delete";

// sub is null for system-driven rows (login/role-sync-poller reconciling
// Keycloak realm roles) — there's no admin actor to attribute those to.
export type AuditActor = { sub: string | null; name: string };

export async function recordAudit(params: {
  actor: AuditActor;
  action: AuditAction;
  targetSub?: string | null;
  targetName?: string | null;
  appId?: string | null;
  detail?: unknown;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_sub, actor_name, action, target_sub, target_name, app_id, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        params.actor.sub,
        params.actor.name,
        params.action,
        params.targetSub ?? null,
        params.targetName ?? null,
        params.appId ?? null,
        JSON.stringify(params.detail ?? {}),
      ],
    );
  } catch (err) {
    console.error("auth-gateway: audit log write failed (non-fatal)", err);
  }
}

export type AuditRow = {
  id: number;
  at: string;
  actorSub: string | null;
  actorName: string;
  action: string;
  targetSub: string | null;
  targetName: string | null;
  appId: string | null;
  detail: unknown;
};

export async function listAudit(limit = 200): Promise<AuditRow[]> {
  const capped = Math.min(Math.max(Math.trunc(limit) || 200, 1), 500);
  const result = await pool.query<{
    id: number;
    at: Date;
    actor_sub: string | null;
    actor_name: string;
    action: string;
    target_sub: string | null;
    target_name: string | null;
    app_id: string | null;
    detail: unknown;
  }>(
    `SELECT id, at, actor_sub, actor_name, action, target_sub, target_name, app_id, detail
     FROM audit_log ORDER BY id DESC LIMIT $1`,
    [capped],
  );
  return result.rows.map((row) => ({
    id: row.id,
    at: row.at.toISOString(),
    actorSub: row.actor_sub,
    actorName: row.actor_name,
    action: row.action,
    targetSub: row.target_sub,
    targetName: row.target_name,
    appId: row.app_id,
    detail: row.detail,
  }));
}
