import { Router } from "express";
import { requireSession, requireAdmin, type AuthedRequest } from "../middleware/requireAdmin.js";
import {
  getMatrix,
  getPermission,
  upsertPermission,
  bulkUpsertPermission,
  type PermissionSet,
} from "../permissions.js";
import { isKnownApp, getApp } from "../apps.js";
import { recordAudit } from "../audit.js";
import { createNotification, fanOutNotification } from "../notifications.js";

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
    if (!(await isKnownApp(appId))) {
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
      // Notify only on a real "you can now reach something new" transition
      // (read false -> true) — not every checkbox toggle (e.g. write/edit/
      // delete alone, or a revoke) is something worth interrupting the user
      // for. Fire-and-forget, same as recordAudit() above: a notification
      // failure must never affect the permission change that already
      // succeeded.
      if (!before.read && after.read) {
        const app = await getApp(appId);
        void createNotification(userSub, {
          sourceAppId: "central-hub",
          type: "success",
          title: `You now have access to ${app?.name ?? appId}`,
          link: appId === "central-hub" ? "/" : `/apps/${appId}/`,
          actorSub: req.session?.sub ?? null,
        });
      }
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
    if (!appId || !(await isKnownApp(appId))) {
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
      // Captured before the bulk write, only when the patch actually grants
      // read — this is the one thing the fan-out below needs (see
      // permission.update's single-cell notification above for the same
      // "false -> true is a real transition" reasoning). Since cleanPatch.read
      // is applied identically to every selected user, "after" is
      // deterministically true for all of them; only "before" varies.
      const grantsRead = cleanPatch.read === true;
      const before = grantsRead
        ? await Promise.all(userSubs.map(async (userSub) => ({ userSub, read: (await getPermission(userSub, appId)).read })))
        : [];

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

      if (grantsRead) {
        const newlyGranted = before.filter((b) => !b.read).map((b) => b.userSub);
        if (newlyGranted.length > 0) {
          const app = await getApp(appId);
          void fanOutNotification(newlyGranted, {
            sourceAppId: "central-hub",
            type: "success",
            title: `You now have access to ${app?.name ?? appId}`,
            link: appId === "central-hub" ? "/" : `/apps/${appId}/`,
            actorSub: req.session?.sub ?? null,
          });
        }
      }

      res.sendStatus(204);
    } catch (err) {
      console.error("auth-gateway: bulk permission upsert failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);
