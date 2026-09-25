import { Router } from "express";
import {
  requireSession, requireAppAdmin, appIdFromQuery, isPlatformScope, type AuthedRequest,
} from "../middleware/requireAdmin.js";
import { listUsers } from "../keycloakAdmin.js";
import { listUserSubsWithAppAccess } from "../permissions.js";

export const adminUsersRouter = Router();

// Readable by a local app admin too (with ?app=<id>), not just a platform
// admin — an app's own role-overrides panel is unusable without a user
// list: it needs names to offer as override targets, and to render existing
// overrides as people rather than raw subject ids.
//
// A local admin sees only users who actually have access to their app, not
// the whole Keycloak directory. That is a real privacy boundary (an
// engineering admin has no business enumerating the company), and it costs
// nothing in capability: an override for a user with no permission on the
// app is inert, because GET /data-token refuses a caller without `read`
// before it ever consults a role code. It also separates the two jobs
// cleanly — a platform admin decides *who may reach an app at all* (the
// permission matrix), the app's own admin decides *what role they hold
// inside it*.
adminUsersRouter.get(
  "/admin/users",
  requireSession,
  requireAppAdmin(appIdFromQuery),
  async (req: AuthedRequest, res) => {
    try {
      const users = await listUsers();
      if (isPlatformScope(req)) {
        res.json(users);
        return;
      }
      const { appId } = req.adminScope as { appId: string };
      const allowed = await listUserSubsWithAppAccess(appId);
      res.json(users.filter((user) => allowed.has(user.id)));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  },
);
