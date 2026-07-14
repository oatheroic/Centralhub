import { Router, type Response } from "express";
import { requireSession, requireAdmin, type AuthedRequest } from "../middleware/requireAdmin.js";
import { listAppRoleRules, createAppRoleRule, deleteAppRoleRule } from "../attributes.js";
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
    try {
      const rule = await createAppRoleRule(appId, roleCode, {
        department: department?.trim() || null,
        position: position?.trim() || null,
        jobLevel: jobLevel?.trim() || null,
      });
      void recordAudit({
        actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
        action: "role_rule.create",
        appId,
        detail: rule,
      });
      res.status(201).json(rule);
    } catch (err) {
      console.error("auth-gateway: role rule creation failed", err);
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
