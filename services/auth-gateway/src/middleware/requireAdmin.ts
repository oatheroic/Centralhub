import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, verifySession, type SessionClaims } from "../session.js";
import { isRevoked } from "../revocation.js";
import { hasRole } from "../roles.js";
import { isAppAdmin } from "../attributes.js";
import { isKnownApp } from "../apps.js";

// Set by requireAppAdmin() for a handler that must narrow what it returns:
// "platform" is a Keycloak realm admin (everything), otherwise the single
// app id this caller is a local admin of. Absent on routes gated by the
// plain requireAdmin(), which are platform-only by definition.
export type AdminScope = "platform" | { appId: string };

export type AuthedRequest = Request & { session?: SessionClaims; adminScope?: AdminScope };

// True when this request may see/act on data belonging to every app, rather
// than only the one app its local admin governs.
export function isPlatformScope(req: AuthedRequest): boolean {
  return req.adminScope === "platform";
}

export async function requireSession(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const claims = token ? await verifySession(token) : null;
  if (!claims) {
    res.sendStatus(401);
    return;
  }
  try {
    if (await isRevoked(claims.sub, claims.issuedAt)) {
      // 401, not 403 — see routes/session.ts's resolveSession() for why a
      // revoked session is treated as "not authenticated," not "forbidden."
      res.sendStatus(401);
      return;
    }
  } catch (err) {
    console.error("auth-gateway: revocation check failed, failing closed", err);
    res.sendStatus(401);
    return;
  }
  req.session = claims;
  next();
}

export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.session) {
    res.sendStatus(401);
    return;
  }
  try {
    if (!(await hasRole(req.session.sub, "admin"))) {
      res.sendStatus(403);
      return;
    }
  } catch (err) {
    console.error("auth-gateway: role check failed, failing closed", err);
    res.sendStatus(403);
    return;
  }
  next();
}

// Admin of *one specific app*: a Keycloak realm admin (who is an admin of
// every app, see attributes.ts's isAppAdmin()), or a local admin promoted
// to that app's own admin role code.
//
// This is what makes delegation real. requireAdmin() above answers "are you
// a platform admin", which is the right gate for genuinely platform-wide
// surfaces (the apps table, the permission matrix, session revocation, the
// global attribute vocabulary's *writes*). But an app's own role-rules and
// role-overrides panel is not platform-wide — it governs one app — so
// gating it on the realm role left a promoted local admin able to *be* an
// admin while unable to *administer* anything, which is the shape the app
// panels actually need.
//
// `getAppId` says where the app id comes from: the path (`:appId`) for the
// per-app routes, or `?app=` for the shared ones (the user list, the
// attribute vocabulary) that a local admin needs in order to render their
// own app's pickers. On those shared routes the handler must also narrow
// its response by req.adminScope — the gate only decides *whether* to
// answer, not *how much*.
//
// Fails closed on every path: no session 401, unknown/absent app 403, not
// an admin of it 403, error while checking 403.
export function requireAppAdmin(getAppId: (req: AuthedRequest) => string | undefined) {
  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session) {
      res.sendStatus(401);
      return;
    }
    try {
      if (await hasRole(req.session.sub, "admin")) {
        req.adminScope = "platform";
        next();
        return;
      }
      const appId = getAppId(req);
      if (!appId) {
        // A local admin reaching a shared route without saying which app
        // they're acting for. Explained rather than a bare 403: the app's
        // own panel simply has to add ?app=<id>, and a silent 403 here
        // looks identical to "you aren't an admin at all".
        res.status(403).json({
          error:
            "not a CentralHub admin — a local app admin must pass ?app=<id> to say which app they are acting for",
        });
        return;
      }
      if (!(await isKnownApp(appId)) || !(await isAppAdmin(req.session.sub, appId))) {
        res.sendStatus(403);
        return;
      }
      req.adminScope = { appId };
      next();
    } catch (err) {
      console.error("auth-gateway: app-admin check failed, failing closed", err);
      res.sendStatus(403);
    }
  };
}

// The two shapes used below: app id from the route path, or from ?app=.
export const appIdFromParam = (req: AuthedRequest): string | undefined =>
  req.params?.appId as string | undefined;
export const appIdFromQuery = (req: AuthedRequest): string | undefined =>
  (req.query?.app as string | undefined)?.trim() || undefined;
