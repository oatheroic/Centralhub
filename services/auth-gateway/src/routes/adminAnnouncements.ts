import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireSession, requireAdmin, type AuthedRequest } from "../middleware/requireAdmin.js";
import { listUsers } from "../keycloakAdmin.js";
import { fanOutNotification } from "../notifications.js";
import { recordAudit } from "../audit.js";

export const adminAnnouncementsRouter = Router();

// The one Phase 1 producer with no existing admin action to piggyback a
// side-effect onto (permission grants/session revoke already have their own
// buttons) — this is the actual "admin issuing a notification" surface.
// Audience is all users for now; per-department/role/user targeting is a
// named, deferred follow-up (README §13), not silently dropped.
adminAnnouncementsRouter.post(
  "/admin/announcements",
  requireSession,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    const { title, body, link } = req.body as Partial<{ title: string; body: string; link: string }>;
    if (!title?.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    try {
      const users = await listUsers();
      const announcementId = randomUUID();
      await fanOutNotification(
        users.map((u) => u.id),
        {
          sourceAppId: "central-hub",
          type: "info",
          title: title.trim(),
          body: body?.trim() || null,
          link: link?.trim() || null,
          actorSub: req.session?.sub ?? null,
          dedupeKey: `announce:${announcementId}`,
        },
      );
      void recordAudit({
        actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
        action: "announcement.create",
        detail: { title: title.trim(), body: body?.trim() || null, link: link?.trim() || null, recipientCount: users.length },
      });
      res.sendStatus(204);
    } catch (err) {
      console.error("auth-gateway: announcement create failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);
