import { Router } from "express";
import { requireSession, requireAdmin, type AuthedRequest } from "../middleware/requireAdmin.js";
import {
  getMatrix,
  getPermission,
  upsertPermission,
  bulkUpsertPermission,
  KNOWN_APPS,
  type PermissionSet,
} from "../permissions.js";
import { recordAudit } from "../audit.js";

const VERBS: (keyof PermissionSet)[] = ["read", "write", "edit", "delete"];

export const adminPermissionsRouter = Router();

adminPermissionsRouter.get("/admin/permissions", requireSession, requireAdmin, async (_req, res) => {
  try {
    res.json(await getMatrix());
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

adminPermissionsRouter.put(
  "/admin/permissions/:userSub/:appId",
  requireSession,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    const userSub = req.params.userSub as string;
    const appId = req.params.appId as string;
    if (!KNOWN_APPS.includes(appId)) {
      res.status(400).json({ error: `unknown app "${appId}"` });
      return;
    }
    // userName is audit-only — denormalized from whatever the admin UI
    // already has loaded, so recording history doesn't cost an extra
    // Keycloak round-trip on every checkbox toggle.
    const { read, write, edit, delete: del, userName } = req.body as Partial<{
      read: boolean;
      write: boolean;
      edit: boolean;
      delete: boolean;
      userName: string;
    }>;
    try {
      const before = await getPermission(userSub, appId);
      await upsertPermission(userSub, appId, { read, write, edit, delete: del });
      const after = await getPermission(userSub, appId);
      void recordAudit({
        actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
        action: "permission.update",
        targetSub: userSub,
        targetName: userName ?? null,
        appId,
        detail: { before, after },
      });
      res.sendStatus(204);
    } catch (err) {
      // Not an authz decision (the caller already passed requireAdmin) —
      // just report the write failure so the admin UI's optimistic update
      // rolls back, consistent with GET /admin/permissions's existing 502.
      console.error("auth-gateway: permission upsert failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

// Applies one verb's value to many users at once (e.g. "grant Marketing
// read to everyone selected") — path is "/bulk" (not ":userSub/:appId",
// which requires two segments) so it can't collide with the single-cell
// route above.
adminPermissionsRouter.put(
  "/admin/permissions/bulk",
  requireSession,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    const { userSubs, appId, patch } = req.body as Partial<{
      userSubs: string[];
      appId: string;
      patch: Partial<PermissionSet>;
    }>;
    if (!appId || !KNOWN_APPS.includes(appId)) {
      res.status(400).json({ error: `unknown app "${appId}"` });
      return;
    }
    if (!Array.isArray(userSubs) || userSubs.length === 0) {
      res.status(400).json({ error: "userSubs must be a non-empty array" });
      return;
    }
    const cleanPatch: Partial<PermissionSet> = {};
    for (const verb of VERBS) {
      if (typeof patch?.[verb] === "boolean") cleanPatch[verb] = patch[verb];
    }
    if (Object.keys(cleanPatch).length === 0) {
      res.status(400).json({ error: "patch must set at least one of read/write/edit/delete" });
      return;
    }
    try {
      await bulkUpsertPermission(userSubs, appId, cleanPatch);
      // One audit row for the whole batch, not one per user — the point is
      // recording the scope of the bulk action, not duplicating per-user
      // detail the single-cell route already covers for one-off edits.
      void recordAudit({
        actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
        action: "permission.bulk_update",
        appId,
        detail: { userSubs, patch: cleanPatch, count: userSubs.length },
      });
      res.sendStatus(204);
    } catch (err) {
      console.error("auth-gateway: bulk permission upsert failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);
