import { Router } from "express";
import { requireSession, type AuthedRequest } from "../middleware/requireAdmin.js";
import {
  fanOutNotification,
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  type NotificationType,
} from "../notifications.js";

export const notificationsRouter = Router();

notificationsRouter.get("/notifications", requireSession, async (req: AuthedRequest, res) => {
  if (!req.session) {
    res.sendStatus(401);
    return;
  }
  const limit = Number(req.query.limit);
  try {
    res.json(await listNotifications(req.session.sub, Number.isFinite(limit) ? limit : undefined));
  } catch (err) {
    console.error("auth-gateway: /notifications list failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});

notificationsRouter.get("/notifications/count", requireSession, async (req: AuthedRequest, res) => {
  if (!req.session) {
    res.sendStatus(401);
    return;
  }
  try {
    res.json({ unread: await getUnreadCount(req.session.sub) });
  } catch (err) {
    console.error("auth-gateway: /notifications/count failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});

// 404 (not 403) whether the id doesn't exist or belongs to someone else —
// see notifications.ts's markRead() — so a user can't use the response to
// probe for other users' notification ids.
notificationsRouter.post("/notifications/:id/read", requireSession, async (req: AuthedRequest, res) => {
  if (!req.session) {
    res.sendStatus(401);
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.sendStatus(400);
    return;
  }
  try {
    const found = await markRead(id, req.session.sub);
    res.sendStatus(found ? 204 : 404);
  } catch (err) {
    console.error("auth-gateway: notification mark-read failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});

notificationsRouter.post("/notifications/read-all", requireSession, async (req: AuthedRequest, res) => {
  if (!req.session) {
    res.sendStatus(401);
    return;
  }
  try {
    await markAllRead(req.session.sub);
    res.sendStatus(204);
  } catch (err) {
    console.error("auth-gateway: notification mark-all-read failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});

// Server-to-server creation — deliberately public/unauthenticated, same
// posture as routes/backchannelLogout.ts and /internal/apps/sync
// (routes/apps.ts): reachable only over the internal Docker network, never
// exposed through Nginx's auth_request gate (see gateway/conf.d/default.conf
// — only /internal/verify and /internal/verify-admin are declared there, and
// both are marked `internal;`). Never trust a browser to assert who a
// notification is for; Phase 1's own producers (permission grants, session
// revoke, admin announcements) call fanOutNotification()/createNotification()
// directly in-process instead of routing through this endpoint — this route
// exists for a future out-of-process producer (e.g. an app's own backend).
notificationsRouter.post("/internal/notifications", async (req, res) => {
  const body = req.body as {
    recipient_sub?: unknown;
    recipient_subs?: unknown;
    source_app_id?: unknown;
    type?: unknown;
    title?: unknown;
    body?: unknown;
    link?: unknown;
    actor_sub?: unknown;
    dedupe_key?: unknown;
  };
  const recipients: string[] = Array.isArray(body.recipient_subs)
    ? body.recipient_subs.filter((s): s is string => typeof s === "string")
    : typeof body.recipient_sub === "string"
      ? [body.recipient_sub]
      : [];
  const sourceAppId = typeof body.source_app_id === "string" ? body.source_app_id : null;
  const title = typeof body.title === "string" ? body.title : null;
  if (recipients.length === 0 || !sourceAppId || !title) {
    res.status(400).json({ error: "recipient_sub(s), source_app_id, and title are required" });
    return;
  }
  const type: NotificationType | undefined =
    typeof body.type === "string" && ["info", "success", "warning", "action_required"].includes(body.type)
      ? (body.type as NotificationType)
      : undefined;
  try {
    await fanOutNotification(recipients, {
      sourceAppId,
      type,
      title,
      body: typeof body.body === "string" ? body.body : null,
      link: typeof body.link === "string" ? body.link : null,
      actorSub: typeof body.actor_sub === "string" ? body.actor_sub : null,
      dedupeKey: typeof body.dedupe_key === "string" ? body.dedupe_key : null,
    });
    res.sendStatus(204);
  } catch (err) {
    console.error("auth-gateway: /internal/notifications failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});
