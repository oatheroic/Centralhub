import { Router } from "express";
import { requireSession, type AuthedRequest } from "../middleware/requireAdmin.js";
import { resolveRoleCode } from "../attributes.js";
import { isKnownApp } from "../apps.js";

// Role is JWT-resolved only (see apps/engineering's schema — there is no
// user_roles table), so any in-app feature that needs to enumerate "which
// of these users currently has role X" (e.g. apps/engineering's leader page
// building a repairer roster to assign jobs to) needs a live lookup rather
// than a table query. Deliberately gated by requireSession only, not
// requireAdmin — a "leader" resolving via a rule/override with no
// CentralHub realm admin role still needs this to do their job, unlike the
// /admin/... routes in this directory. Batch size capped defensively since
// this fans out to one resolveRoleCode() (a few DB reads) per requested sub.
export const roleLookupRouter = Router();

const MAX_SUBS = 200;

roleLookupRouter.get(
  "/apps/:appId/role-codes",
  requireSession,
  async (req: AuthedRequest, res) => {
    const appId = req.params.appId as string;
    if (!(await isKnownApp(appId))) {
      res.status(400).json({ error: `unknown app "${appId}"` });
      return;
    }
    const subsParam = (req.query.subs as string | undefined) ?? "";
    const subs = subsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_SUBS);
    try {
      const entries = await Promise.all(
        subs.map(async (sub) => [sub, await resolveRoleCode(sub, appId)] as const),
      );
      res.json(Object.fromEntries(entries));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  },
);
