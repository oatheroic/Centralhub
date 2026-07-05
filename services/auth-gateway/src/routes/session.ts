import { Router, type Request } from "express";
import { SESSION_COOKIE, verifySession, type SessionClaims } from "../session.js";
import { getPermission, type PermissionSet } from "../permissions.js";
import { isRevoked } from "../revocation.js";
import { getRoles, hasRole } from "../roles.js";

const VERBS: (keyof PermissionSet)[] = ["read", "write", "edit", "delete"];

export const sessionRouter = Router();

type Resolved = { claims: SessionClaims; error?: undefined } | { claims?: undefined; error: 401 | 403 };

// Shared by every route below: verifies the session JWT, then checks it
// hasn't been force-revoked (by an admin or Keycloak's backchannel-logout
// webhook) since it was issued. This is deliberately re-checked on every
// request rather than trusted for the JWT's whole 8h lifetime — that's the
// entire point of this phase.
//
// A revoked/unverifiable session returns 401, not 403: 403 means "valid
// session, but not permitted THIS resource" (app read-denied, admin-role
// missing), and Nginx's @permission_denied page for that correctly sends
// the user back to the dashboard. A revoked session doesn't have that
// remedy available — the dashboard IS the resource that just 403'd — so
// it needs the same treatment as "no session at all": 401, which already
// auto-redirects to /auth/login on every gated location via the existing
// @login_redirect wiring, no Nginx changes needed. Fails closed (401, same
// reasoning) on a DB error, since this is an authz-critical path.
async function resolveSession(req: Request): Promise<Resolved> {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const claims = token ? await verifySession(token) : null;
  if (!claims) {
    return { error: 401 };
  }
  try {
    if (await isRevoked(claims.sub, claims.issuedAt)) {
      return { error: 401 };
    }
  } catch (err) {
    console.error("auth-gateway: revocation check failed, failing closed", err);
    return { error: 401 };
  }
  return { claims };
}

sessionRouter.get("/session/verify", async (req, res) => {
  const resolved = await resolveSession(req);
  if (resolved.error) {
    res.sendStatus(resolved.error);
    return;
  }
  const { claims } = resolved;

  // Set by Nginx from the /apps/<id>/ regex capture; empty for the
  // central-hub root, which has no per-app permission gate.
  const appId = req.headers["x-app-id"] as string | undefined;
  if (appId) {
    try {
      const permission = await getPermission(claims.sub, appId);
      if (!permission.read) {
        res.sendStatus(403);
        return;
      }
    } catch (err) {
      // Fail closed: this is an authz-critical path. A DB blip must never
      // silently grant access, and returning 403 (not 401) reuses the
      // already-wired @permission_denied page without an Nginx change —
      // a 401 would just bounce through @login_redirect into a fresh
      // Keycloak round-trip that can't fix a Postgres outage anyway.
      console.error("auth-gateway: permission check failed, failing closed", err);
      res.sendStatus(403);
      return;
    }
  }

  try {
    res.set("X-User-Id", claims.sub);
    res.set("X-User-Name", claims.name);
    res.set("X-User-Roles", (await getRoles(claims.sub)).join(","));
    res.sendStatus(200);
  } catch (err) {
    console.error("auth-gateway: role lookup failed, failing closed", err);
    res.sendStatus(403);
  }
});

sessionRouter.get("/session/verify-admin", async (req, res) => {
  const resolved = await resolveSession(req);
  if (resolved.error) {
    res.sendStatus(resolved.error);
    return;
  }
  const { claims } = resolved;

  try {
    if (!(await hasRole(claims.sub, "admin"))) {
      res.sendStatus(403);
      return;
    }
    res.set("X-User-Id", claims.sub);
    res.set("X-User-Name", claims.name);
    res.set("X-User-Roles", (await getRoles(claims.sub)).join(","));
    res.sendStatus(200);
  } catch (err) {
    console.error("auth-gateway: role check failed, failing closed", err);
    res.sendStatus(403);
  }
});

sessionRouter.get("/me", async (req, res) => {
  const resolved = await resolveSession(req);
  if (resolved.error) {
    res.status(resolved.error).json({ error: "not authenticated" });
    return;
  }
  const { claims } = resolved;
  try {
    const roles = await getRoles(claims.sub);
    res.json({ sub: claims.sub, name: claims.name, email: claims.email, roles });
  } catch (err) {
    console.error("auth-gateway: /me role lookup failed", err);
    res.status(503).json({ error: "unavailable" });
  }
});

// Called by each app's usePermissions() hook to decide which mutating
// actions to allow client-side. Read-access itself is already enforced
// server-side by Nginx's auth_request — this is for write/edit/delete,
// which are app-internal actions Nginx has no visibility into.
sessionRouter.get("/permissions", async (req, res) => {
  const resolved = await resolveSession(req);
  if (resolved.error) {
    res.status(resolved.error).json({ error: "not authenticated" });
    return;
  }
  const { claims } = resolved;

  const appId = req.query.app as string | undefined;
  if (!appId) {
    res.status(400).json({ error: "missing ?app= query param" });
    return;
  }
  try {
    res.json(await getPermission(claims.sub, appId));
  } catch (err) {
    // Non-fatal from a security standpoint (this endpoint only feeds the
    // frontend's useGuardedAction hook, it isn't itself a gate) — but the
    // hook already treats any non-2xx response as "no permissions", so a
    // 503 here still fails closed on the client side without needing a
    // specific status code contract.
    console.error("auth-gateway: /permissions lookup failed", err);
    res.status(503).json({ error: "permission lookup unavailable" });
  }
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
  const resolved = await resolveSession(req);
  if (resolved.error) {
    res.sendStatus(resolved.error);
    return;
  }
  const { claims } = resolved;

  const appId = req.query.app as string | undefined;
  const verb = req.query.verb as string | undefined;
  if (!appId || !verb || !VERBS.includes(verb as keyof PermissionSet)) {
    res.status(400).json({ error: "missing or invalid ?app=&verb= query params" });
    return;
  }
  try {
    const permission = await getPermission(claims.sub, appId);
    if (!permission[verb as keyof PermissionSet]) {
      res.sendStatus(403);
      return;
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("auth-gateway: verify-permission check failed, failing closed", err);
    res.sendStatus(403);
  }
});
