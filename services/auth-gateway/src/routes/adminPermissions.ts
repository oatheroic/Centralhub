import { Router } from "express";
import { requireSession, requireAdmin, type AuthedRequest } from "../middleware/requireAdmin.js";
import { getMatrix, getPermission, upsertPermission, KNOWN_APPS } from "../permissions.js";
import { recordAudit } from "../audit.js";

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
