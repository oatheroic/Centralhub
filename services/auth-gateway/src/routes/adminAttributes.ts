import { Router } from "express";
import { requireSession, requireAdmin, type AuthedRequest } from "../middleware/requireAdmin.js";
import { getUserAttributes, upsertUserAttributes, listAllUserAttributes } from "../attributes.js";
import { recordAudit } from "../audit.js";

export const adminAttributesRouter = Router();

// Bulk endpoint, for the UsersPanel table (one round-trip, not one per row).
adminAttributesRouter.get(
  "/admin/users/attributes",
  requireSession,
  requireAdmin,
  async (_req, res) => {
    try {
      res.json(await listAllUserAttributes());
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

adminAttributesRouter.get(
  "/admin/users/:userSub/attributes",
  requireSession,
  requireAdmin,
  async (req, res) => {
    try {
      res.json(await getUserAttributes(req.params.userSub as string));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

adminAttributesRouter.put(
  "/admin/users/:userSub/attributes",
  requireSession,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    // userName is audit-only, same denormalization rationale as adminPermissions.ts.
    const { department, position, jobLevel, userName } = req.body as Partial<{
      department: string;
      position: string;
      jobLevel: string;
      userName: string;
    }>;
    if (!department?.trim() || !position?.trim() || !jobLevel?.trim()) {
      res.status(400).json({ error: "department, position, and jobLevel are all required" });
      return;
    }
    const userSub = req.params.userSub as string;
    try {
      const before = await getUserAttributes(userSub);
      await upsertUserAttributes(userSub, { department, position, jobLevel });
      void recordAudit({
        actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
        action: "attribute.update",
        targetSub: userSub,
        targetName: userName ?? null,
        detail: { before, after: { department, position, jobLevel } },
      });
      res.sendStatus(204);
    } catch (err) {
      console.error("auth-gateway: attribute upsert failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);
