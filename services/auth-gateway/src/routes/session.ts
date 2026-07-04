import { Router } from "express";
import { SESSION_COOKIE, verifySession } from "../session.js";
import { getPermission, type PermissionSet } from "../permissions.js";

const VERBS: (keyof PermissionSet)[] = ["read", "write", "edit", "delete"];

export const sessionRouter = Router();

sessionRouter.get("/session/verify", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const claims = token ? await verifySession(token) : null;
  if (!claims) {
    res.sendStatus(401);
    return;
  }

  // Set by Nginx from the /apps/<id>/ regex capture; empty for the
  // central-hub root, which has no per-app permission gate.
  const appId = req.headers["x-app-id"] as string | undefined;
  if (appId) {
    const permission = await getPermission(claims.sub, appId);
    if (!permission.read) {
      res.sendStatus(403);
      return;
    }
  }

  res.set("X-User-Id", claims.sub);
  res.set("X-User-Name", claims.name);
  res.set("X-User-Roles", claims.roles.join(","));
  res.sendStatus(200);
});

sessionRouter.get("/session/verify-admin", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const claims = token ? await verifySession(token) : null;
  if (!claims) {
    res.sendStatus(401);
    return;
  }
  if (!claims.roles.includes("admin")) {
    res.sendStatus(403);
    return;
  }
  res.set("X-User-Id", claims.sub);
  res.set("X-User-Name", claims.name);
  res.set("X-User-Roles", claims.roles.join(","));
  res.sendStatus(200);
});

sessionRouter.get("/me", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const claims = token ? await verifySession(token) : null;
  if (!claims) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  res.json(claims);
});

// Called by each app's usePermissions() hook to decide which mutating
// actions to allow client-side. Read-access itself is already enforced
// server-side by Nginx's auth_request — this is for write/edit/delete,
// which are app-internal actions Nginx has no visibility into.
sessionRouter.get("/permissions", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const claims = token ? await verifySession(token) : null;
  if (!claims) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  const appId = req.query.app as string | undefined;
  if (!appId) {
    res.status(400).json({ error: "missing ?app= query param" });
    return;
  }
  res.json(await getPermission(claims.sub, appId));
});

// For a FUTURE per-app backend to call before executing a real mutating
// action — auth-gateway owns the single source of truth for permissions
// (the app_permissions table), so any app that grows a real write/edit/
// delete endpoint should check here server-side rather than trusting the
// client-side useGuardedAction() hook, which is a UX guard only. Shaped
// like /session/verify(-admin) (forwarded cookie in, bare 200/401/403 out)
// so a future app's own Nginx location could gate it the same way this
// gateway's auth_request does today, or a backend could call it directly.
sessionRouter.get("/session/verify-permission", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const claims = token ? await verifySession(token) : null;
  if (!claims) {
    res.sendStatus(401);
    return;
  }
  const appId = req.query.app as string | undefined;
  const verb = req.query.verb as string | undefined;
  if (!appId || !verb || !VERBS.includes(verb as keyof PermissionSet)) {
    res.status(400).json({ error: "missing or invalid ?app=&verb= query params" });
    return;
  }
  const permission = await getPermission(claims.sub, appId);
  if (!permission[verb as keyof PermissionSet]) {
    res.sendStatus(403);
    return;
  }
  res.sendStatus(200);
});
