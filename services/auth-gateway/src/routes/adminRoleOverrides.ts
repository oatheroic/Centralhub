import { Router, type Response } from "express";
import {
  requireSession, requireAppAdmin, appIdFromParam, isPlatformScope, type AuthedRequest,
} from "../middleware/requireAdmin.js";
import {
  listAppRoleOverrides, upsertAppRoleOverride, deleteAppRoleOverride,
} from "../attributes.js";
import { hasRole } from "../roles.js";
import { isKnownApp, adminRoleCodeFor } from "../apps.js";
import { recordAudit } from "../audit.js";

// Generic per-app CRUD, mirroring adminRoleRules.ts exactly — a per-user
// exception on top of that app's attribute rules (resolveRoleCode() checks
// this table first; see attributes.ts). Not engineering-specific: any app
// using the attributes -> role_code pattern gets this for free.
export const adminRoleOverridesRouter = Router();

async function checkKnownApp(appId: string, res: Response): Promise<boolean> {
  if (!(await isKnownApp(appId))) {
    res.status(400).json({ error: `unknown app "${appId}"` });
    return false;
  }
  return true;
}

adminRoleOverridesRouter.get(
  "/admin/apps/:appId/role-overrides",
  requireSession,
  requireAppAdmin(appIdFromParam),
  async (req, res) => {
    const appId = req.params.appId as string;
    if (!(await checkKnownApp(appId, res))) return;
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
  requireAppAdmin(appIdFromParam),
  async (req: AuthedRequest, res) => {
    const appId = req.params.appId as string;
    if (!(await checkKnownApp(appId, res))) return;
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
    // A CentralHub platform admin cannot be overridden here, by anyone.
    // Two reasons, and the second is why this is unconditional:
    //  - It would not work. isAppAdmin() makes a realm admin an admin of
    //    every app regardless of this table, so the override would be
    //    written and then silently ignored. Better to refuse than to let
    //    someone believe a dead override took effect.
    //  - It is the floor under delegation. A local admin now has full
    //    control of their app's rules and overrides (requireAppAdmin), so
    //    without this they could demote the platform admins of their own
    //    app — exactly the escalation delegating this power must not open.
    // Checked before adminRoleCode is consulted at all: the old form was
    // conditional on the app having an admin role code, which made the
    // guard silently absent for any app without one.
    if (await hasRole(userSub, "admin")) {
      const adminRoleCode = await adminRoleCodeFor(appId);
      res.status(400).json({
        error:
          "this user is a CentralHub platform admin — they are always an admin of every app" +
          (adminRoleCode ? ` (role "${adminRoleCode}" here)` : "") +
          ", so an override would never take effect and cannot be used to remove their access",
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
  requireAppAdmin(appIdFromParam),
  async (req: AuthedRequest, res) => {
    const appId = req.params.appId as string;
    if (!(await checkKnownApp(appId, res))) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "invalid override id" });
      return;
    }
    try {
      const existing = (await listAppRoleOverrides(appId)).find((o) => o.id === id) ?? null;
      // The other half of the self-lockout guard on POST above. A local
      // admin holds that status *because* of their override row, so
      // deleting their own is the one action here that revokes their own
      // access — and it is unrecoverable through this UI, since the panel
      // that could restore it is the one they just locked themselves out
      // of. Blocked rather than warned: there is no legitimate reason to
      // resign this way, and a platform admin can always remove the
      // override for them.
      //
      // Scoped to local admins deliberately. A platform admin's status
      // comes from the Keycloak realm role, not this table, so deleting
      // their own row costs them nothing — and blocking it would leave a
      // legacy row nobody could clean up.
      if (existing && existing.userSub === req.session?.sub && !isPlatformScope(req)) {
        res.status(400).json({
          error:
            "cannot delete your own role override — it is what makes you an admin of this app, " +
            "and removing it here would lock you out of the panel that could restore it",
        });
        return;
      }
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
