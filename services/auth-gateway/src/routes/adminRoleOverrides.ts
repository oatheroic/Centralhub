import { Router, type Response } from "express";
import { requireSession, requireAdmin, type AuthedRequest } from "../middleware/requireAdmin.js";
import {
  listAppRoleOverrides, upsertAppRoleOverride, deleteAppRoleOverride, guaranteedAdminRoleCodeFor,
} from "../attributes.js";
import { hasRole } from "../roles.js";
import { KNOWN_APPS } from "../permissions.js";
import { recordAudit } from "../audit.js";

// Generic per-app CRUD, mirroring adminRoleRules.ts exactly — a per-user
// exception on top of that app's attribute rules (resolveRoleCode() checks
// this table first; see attributes.ts). Not engineering-specific: any app
// using the attributes -> role_code pattern gets this for free.
export const adminRoleOverridesRouter = Router();

function checkKnownApp(appId: string, res: Response): boolean {
  if (!KNOWN_APPS.includes(appId)) {
    res.status(400).json({ error: `unknown app "${appId}"` });
    return false;
  }
  return true;
}

adminRoleOverridesRouter.get(
  "/admin/apps/:appId/role-overrides",
  requireSession,
  requireAdmin,
  async (req, res) => {
    const appId = req.params.appId as string;
    if (!checkKnownApp(appId, res)) return;
    try {
      res.json(await listAppRoleOverrides(appId));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

adminRoleOverridesRouter.post(
  "/admin/apps/:appId/role-overrides",
  requireSession,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    const appId = req.params.appId as string;
    if (!checkKnownApp(appId, res)) return;
    const { userSub, roleCode } = req.body as Partial<{ userSub: string; roleCode: string }>;
    if (!userSub?.trim() || !roleCode?.trim()) {
      res.status(400).json({ error: "userSub and roleCode are required" });
      return;
    }
    // An override always wins over the attribute rules (resolveRoleCode()),
    // so an admin overriding their OWN account to a non-admin role_code has
    // no recovery path through this UI at all — the very tab that could
    // undo it requires the admin role_code the override just took away.
    // Same self-lockout shape as §8's session-revoke button (blocked there
    // for the identical reason); blocked here the same way rather than
    // building a recovery mechanism. Does not block overriding a
    // *different* admin — deliberately scoping one other rule-derived
    // admin down via override is a legitimate use of this table.
    if (userSub === req.session?.sub) {
      res.status(400).json({ error: "cannot set a role override on your own account" });
      return;
    }
    // For an app opted into CENTRALHUB_ADMIN_ROLE_CODE (attributes.ts), a
    // CentralHub Keycloak admin's role_code there is absolute — an override
    // targeting one would be accepted but silently never take effect
    // (resolveRoleCode() never reaches the overrides table for them at
    // all). Reject at write time rather than let an admin believe a dead
    // override worked.
    const guaranteedAdminRoleCode = guaranteedAdminRoleCodeFor(appId);
    if (guaranteedAdminRoleCode && (await hasRole(userSub, "admin"))) {
      res.status(400).json({
        error: "this user is a CentralHub admin — their role here is always \"" + guaranteedAdminRoleCode + "\", an override would never take effect",
      });
      return;
    }
    try {
      const override = await upsertAppRoleOverride(appId, userSub, roleCode);
      void recordAudit({
        actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
        action: "role_override.upsert",
        appId,
        targetSub: userSub,
        detail: override,
      });
      res.status(201).json(override);
    } catch (err) {
      console.error("auth-gateway: role override upsert failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

adminRoleOverridesRouter.delete(
  "/admin/apps/:appId/role-overrides/:id",
  requireSession,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    const appId = req.params.appId as string;
    if (!checkKnownApp(appId, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "invalid override id" });
      return;
    }
    try {
      const existing = (await listAppRoleOverrides(appId)).find((o) => o.id === id) ?? null;
      await deleteAppRoleOverride(appId, id);
      void recordAudit({
        actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
        action: "role_override.delete",
        appId,
        targetSub: existing?.userSub ?? null,
        detail: existing ?? { id },
      });
      res.sendStatus(204);
    } catch (err) {
      console.error("auth-gateway: role override deletion failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);
