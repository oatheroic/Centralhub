import { Router } from "express";
import { requireSession, requireAdmin, type AuthedRequest } from "../middleware/requireAdmin.js";
import { revokeUser } from "../revocation.js";
import { recordAudit } from "../audit.js";
import { createNotification } from "../notifications.js";

export const adminSessionsRouter = Router();

// Force-invalidates every currently-live session for this user, effective
// on their very next request anywhere — the concrete "kill a (possibly
// compromised) user's session now" action, without waiting for the
// session's natural 8h expiry.
adminSessionsRouter.put(
  "/admin/sessions/:userSub/revoke",
  requireSession,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    const userSub = req.params.userSub as string;
    // Reject self-revocation server-side too, not just by hiding the button
    // in apps/admin — there's no recovery path in this UI once an admin
    // locks themselves out (they'd need direct DB access to undo it).
    if (userSub === req.session?.sub) {
      res.status(400).json({ error: "cannot revoke your own session" });
      return;
    }
    // name is audit-only, same denormalization rationale as adminPermissions.ts.
    const { name } = req.body as Partial<{ name: string }>;
    try {
      await revokeUser(userSub);
      void recordAudit({
        actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
        action: "session.revoke",
        targetSub: userSub,
        targetName: name ?? null,
      });
      // The revoked user's own next request is a 401 -> login redirect, so
      // they likely never see this live — created anyway so it's waiting in
      // their history once they log back in with a fresh, unrevoked session.
      void createNotification(userSub, {
        sourceAppId: "central-hub",
        type: "warning",
        title: "Your session was ended by an administrator",
        actorSub: req.session?.sub ?? null,
      });
      res.sendStatus(204);
    } catch (err) {
      console.error("auth-gateway: session revoke failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);
