import { Router, type Response } from "express";
import { requireSession, requireAdmin, type AuthedRequest } from "../middleware/requireAdmin.js";
import {
  listAppRoleRules, createAppRoleRule, deleteAppRoleRule, listAttributeValues, resolveRoleCode,
  RoleRuleExistsError,
} from "../attributes.js";
import { KNOWN_APPS } from "../permissions.js";
import { recordAudit } from "../audit.js";

// Generic per-app CRUD, not assets-specific — apps/assets's own admin panel
// calls this with :appId="assets", but any future app with the same
// "generic attributes -> app-specific vocabulary" need can reuse it as-is.
export const adminRoleRulesRouter = Router();

function checkKnownApp(appId: string, res: Response): boolean {
  if (!KNOWN_APPS.includes(appId)) {
    res.status(400).json({ error: `unknown app "${appId}"` });
    return false;
  }
  return true;
}

adminRoleRulesRouter.get(
  "/admin/apps/:appId/role-rules",
  requireSession,
  requireAdmin,
  async (req, res) => {
    const appId = req.params.appId as string;
    if (!checkKnownApp(appId, res)) return;
    try {
      res.json(await listAppRoleRules(appId));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

adminRoleRulesRouter.post(
  "/admin/apps/:appId/role-rules",
  requireSession,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    const appId = req.params.appId as string;
    if (!checkKnownApp(appId, res)) return;
    const { roleCode, department, position, jobLevel } = req.body as Partial<{
      roleCode: string;
      department: string | null;
      position: string | null;
      jobLevel: string | null;
    }>;
    if (!roleCode?.trim()) {
      res.status(400).json({ error: "roleCode is required" });
      return;
    }
    const criteria = {
      department: department?.trim() || null,
      position: position?.trim() || null,
      jobLevel: jobLevel?.trim() || null,
    };
    try {
      // Every non-wildcard criterion must be a value from the managed
      // list — otherwise a typo here silently never matches any real user
      // (attrs.ts's resolveRoleCode does an exact string compare), the
      // same class of bug §10's "Managed attribute values" work already
      // closed for user_attributes itself.
      const checks: [string, string | null, "department" | "position" | "job_level"][] = [
        ["department", criteria.department, "department"],
        ["position", criteria.position, "position"],
        ["jobLevel", criteria.jobLevel, "job_level"],
      ];
      for (const [field, value, kind] of checks) {
        if (value === null) continue;
        const allowed = await listAttributeValues(kind);
        if (!allowed.includes(value)) {
          res.status(400).json({ error: `${field} "${value}" is not in the managed ${kind} list` });
          return;
        }
      }
      const rule = await createAppRoleRule(appId, roleCode, criteria);
      void recordAudit({
        actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
        action: "role_rule.create",
        appId,
        detail: rule,
      });
      res.status(201).json(rule);
    } catch (err) {
      if (err instanceof RoleRuleExistsError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error("auth-gateway: role rule creation failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

// Diagnostics: exposes the exact same precedence resolveRoleCode() already
// uses for dataToken.ts, for an arbitrary target user, so an admin can see
// what role_code a user WOULD get without that user logging in first — lets
// a misconfigured rule/override/alias chain be caught directly instead of
// manifesting only as a silent blank page in the app itself.
adminRoleRulesRouter.get(
  "/admin/apps/:appId/resolve-role/:userSub",
  requireSession,
  requireAdmin,
  async (req, res) => {
    const appId = req.params.appId as string;
    if (!checkKnownApp(appId, res)) return;
    try {
      const roleCode = await resolveRoleCode(req.params.userSub as string, appId);
      res.json({ roleCode });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

adminRoleRulesRouter.delete(
  "/admin/apps/:appId/role-rules/:id",
  requireSession,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    const appId = req.params.appId as string;
    if (!checkKnownApp(appId, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "invalid rule id" });
      return;
    }
    try {
      // Fetched before deleting so the audit row carries the deleted rule's
      // own criteria, not just its id — mirrors the before/after pattern
      // used for permission and attribute edits.
      const rule = (await listAppRoleRules(appId)).find((r) => r.id === id) ?? null;
      await deleteAppRoleRule(appId, id);
      void recordAudit({
        actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
        action: "role_rule.delete",
        appId,
        detail: rule ?? { id },
      });
      res.sendStatus(204);
    } catch (err) {
      console.error("auth-gateway: role rule deletion failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);
