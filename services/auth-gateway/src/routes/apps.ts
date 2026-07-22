import { Router } from "express";
import { requireSession } from "../middleware/requireAdmin.js";
import { listApps, upsertFromManifest, type ManifestEntry } from "../apps.js";

// Feeds apps/central-hub's dashboard — replaces the old static
// apps/central-hub/src/registry/apps.ts array. Session-gated (any logged-in
// user, not admin-only) since every user needs the full list to render
// their own filtered dashboard; hidden/requiresRole filtering happens
// client-side exactly as it did with the static array.
export const appsRouter = Router();

appsRouter.get("/apps", requireSession, async (_req, res) => {
  try {
    res.json(await listApps());
  } catch (err) {
    console.error("auth-gateway: /apps list failed", err);
    res.status(503).json({ error: "unavailable" });
  }
});

// Deliberately public/unauthenticated, same posture as
// routes/backchannelLogout.ts — reachable only server-to-server, over the
// internal Docker network, by the one-shot apps-manifest-sync container
// (see environments/docker-compose.yml). Never exposed through Nginx's
// auth_request gate.
appsRouter.post("/internal/apps/sync", async (req, res) => {
  const body = req.body as { apps?: unknown };
  if (!Array.isArray(body.apps)) {
    res.status(400).json({ error: "body.apps must be an array" });
    return;
  }
  const entries: ManifestEntry[] = (body.apps as Record<string, unknown>[]).map((raw) => ({
    id: String(raw.id),
    name: String(raw.name),
    department: String(raw.department),
    icon: typeof raw.icon === "string" ? raw.icon : "LayoutGrid",
    description: typeof raw.description === "string" ? raw.description : null,
    hidden: raw.hidden === true,
    requiresRole: typeof raw.requiresRole === "string" ? raw.requiresRole : null,
  }));
  try {
    const inserted = await upsertFromManifest(entries);
    res.json({ inserted, received: entries.length });
  } catch (err) {
    console.error("auth-gateway: manifest sync failed", err);
    res.status(502).json({ error: (err as Error).message });
  }
});
