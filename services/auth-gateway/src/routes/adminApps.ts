import { Router } from "express";
import { requireSession, requireAdmin, type AuthedRequest } from "../middleware/requireAdmin.js";
import { listApps, getApp, createApp, updateApp, deleteApp, AppExistsError, AppInUseError, type AppInput } from "../apps.js";
import { recordAudit } from "../audit.js";

// Full CRUD for apps/admin's "Apps" tab — replaces hand-editing
// apps/central-hub/src/registry/apps.ts, permissions.ts's KNOWN_APPS, and
// attributes.ts's CENTRALHUB_ADMIN_ROLE_CODE. Same requireSession +
// requireAdmin + recordAudit + in-use-blocks-delete shape as
// routes/adminAttributeValues.ts.
export const adminAppsRouter = Router();

function parseInput(body: unknown): AppInput | null {
  const b = body as Partial<{
    name: string;
    department: string;
    icon: string;
    description: string | null;
    hidden: boolean;
    requiresRole: string | null;
    knownApp: boolean;
    adminRoleCode: string | null;
  }>;
  if (!b.name?.trim() || !b.department?.trim()) return null;
  return {
    name: b.name.trim(),
    department: b.department.trim(),
    icon: b.icon?.trim() || "LayoutGrid",
    description: b.description?.trim() || null,
    hidden: b.hidden === true,
    requiresRole: b.requiresRole?.trim() || null,
    knownApp: b.knownApp !== false,
    adminRoleCode: b.adminRoleCode?.trim() || null,
  };
}

adminAppsRouter.get("/admin/apps", requireSession, requireAdmin, async (_req, res) => {
  try {
    res.json(await listApps());
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

adminAppsRouter.post("/admin/apps", requireSession, requireAdmin, async (req: AuthedRequest, res) => {
  const { id } = req.body as Partial<{ id: string }>;
  if (!id?.trim()) {
    res.status(400).json({ error: "id is required" });
    return;
  }
  const input = parseInput(req.body);
  if (!input) {
    res.status(400).json({ error: "name and department are required" });
    return;
  }
  try {
    const app = await createApp(id.trim(), input);
    void recordAudit({
      actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
      action: "app.create",
      appId: app.id,
      detail: app,
    });
    res.status(201).json(app);
  } catch (err) {
    if (err instanceof AppExistsError) {
      res.status(409).json({ error: err.message });
      return;
    }
    console.error("auth-gateway: app creation failed", err);
    res.status(502).json({ error: (err as Error).message });
  }
});

adminAppsRouter.put("/admin/apps/:id", requireSession, requireAdmin, async (req: AuthedRequest, res) => {
  const id = req.params.id as string;
  const input = parseInput(req.body);
  if (!input) {
    res.status(400).json({ error: "name and department are required" });
    return;
  }
  try {
    // Fetched before the write so the audit row can show what actually
    // changed, not just the app's current state — same before/after shape
    // as permission.update/attribute.update.
    const before = await getApp(id);
    const app = await updateApp(id, input);
    if (!app) {
      res.status(404).json({ error: `unknown app "${id}"` });
      return;
    }
    void recordAudit({
      actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
      action: "app.update",
      appId: id,
      detail: { before, after: app },
    });
    res.json(app);
  } catch (err) {
    console.error("auth-gateway: app update failed", err);
    res.status(502).json({ error: (err as Error).message });
  }
});

adminAppsRouter.delete("/admin/apps/:id", requireSession, requireAdmin, async (req: AuthedRequest, res) => {
  const id = req.params.id as string;
  try {
    const existing = await getApp(id);
    await deleteApp(id);
    void recordAudit({
      actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
      action: "app.delete",
      appId: id,
      detail: existing ?? { id },
    });
    res.sendStatus(204);
  } catch (err) {
    if (err instanceof AppInUseError) {
      res.status(409).json({ error: "app is still in use", usage: err.usage });
      return;
    }
    console.error("auth-gateway: app deletion failed", err);
    res.status(502).json({ error: (err as Error).message });
  }
});
