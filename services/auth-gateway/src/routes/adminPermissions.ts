import { Router } from "express";
import { requireSession, requireAdmin } from "../middleware/requireAdmin.js";
import { getMatrix, upsertPermission, KNOWN_APPS } from "../permissions.js";

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
  async (req, res) => {
    const userSub = req.params.userSub as string;
    const appId = req.params.appId as string;
    if (!KNOWN_APPS.includes(appId)) {
      res.status(400).json({ error: `unknown app "${appId}"` });
      return;
    }
    const { read, write, edit, delete: del } = req.body as Partial<{
      read: boolean;
      write: boolean;
      edit: boolean;
      delete: boolean;
    }>;
    try {
      await upsertPermission(userSub, appId, { read, write, edit, delete: del });
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
