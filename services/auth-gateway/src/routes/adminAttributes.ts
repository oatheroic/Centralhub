import { Router } from "express";
import {
  requireSession, requireAdmin, requireAppAdmin, appIdFromQuery, isPlatformScope,
  type AuthedRequest,
} from "../middleware/requireAdmin.js";
import { getUserAttributes, upsertUserAttributes, listAllUserAttributes } from "../attributes.js";
import { listUserSubsWithAppAccess } from "../permissions.js";
import { recordAudit } from "../audit.js";

export const adminAttributesRouter = Router();

// Bulk endpoint, for the UsersPanel table (one round-trip, not one per row).
// Readable by a local app admin (with ?app=<id>) so their panel can show
// which attributes a user has and therefore why a rule did or didn't match
// them — narrowed to that app's own users, the same boundary adminUsers.ts
// applies to the directory itself.
adminAttributesRouter.get(
  "/admin/users/attributes",
  requireSession,
  requireAppAdmin(appIdFromQuery),
  async (req: AuthedRequest, res) => {
    try {
      const all = await listAllUserAttributes();
      if (isPlatformScope(req)) {
        res.json(all);
        return;
      }
      const { appId } = req.adminScope as { appId: string };
      const allowed = await listUserSubsWithAppAccess(appId);
      res.json(Object.fromEntries(Object.entries(all).filter(([sub]) => allowed.has(sub))));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

// Single-user read, for the diagnostics view ("why did this user resolve to
// that role?"). Same delegation as the bulk read above, and the same
// narrowing: a local admin may only inspect a user who has access to their
// own app, so this cannot be used to read an arbitrary employee's record.
// The PUT below stays platform-only — a user's department/position is
// CentralHub-wide identity data that every app's rules match against, not
// something one app's admin should be able to rewrite.
adminAttributesRouter.get(
  "/admin/users/:userSub/attributes",
  requireSession,
  requireAppAdmin(appIdFromQuery),
  async (req: AuthedRequest, res) => {
    const userSub = req.params.userSub as string;
    try {
      if (!isPlatformScope(req)) {
        const { appId } = req.adminScope as { appId: string };
        const allowed = await listUserSubsWithAppAccess(appId);
        if (!allowed.has(userSub)) {
          res.sendStatus(403);
          return;
        }
      }
      res.json(await getUserAttributes(userSub));
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
