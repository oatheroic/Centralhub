import type { NextFunction, Request, Response } from "express";

export type Verb = "read" | "write" | "edit" | "delete";
export type PermissionSet = Record<Verb, boolean>;

export type Identity = {
  sub: string;
  name: string;
  email: string;
  roles: string[];
  department: string | null;
  position: string | null;
  jobLevel: string | null;
};

export type AuthedRequest = Request & { identity?: Identity; permissions?: PermissionSet };

// Response shape of auth-gateway's GET /session/context?app=<id>.
type SessionContext = Identity & { permissions: PermissionSet };

export type AuthOptions = {
  // The app's id — the same id used for its app-<id>/api-<id> compose
  // services, its /apps/<id>/ gateway route, and its app_permissions rows.
  appId: string;
  authGatewayUrl: string;
};

// Server-side permission enforcement for a trusted first-party app backend
// (README §7's "native gate"). This is the actual security boundary for
// write/edit/delete — the frontend's useGuardedAction() is a UX guard only.
//
// One auth-gateway round-trip per request: `authenticate` forwards the
// caller's session cookie to /session/context, which returns identity plus
// all four verbs for this app in a single response. requireVerb()/hasVerb()
// then read from that — no further HTTP.
//
// Read access is normally already enforced ahead of the service by Nginx's
// auth_request on /apps/<id>/api/; the `read:false → 403` here is defense
// in depth (a container reachable by some other path is still gated), not
// the primary gate. Every failure fails closed: a missing/revoked session
// is 401, an unreachable or erroring auth-gateway is 502 — never a grant.
export function createAuth({ appId, authGatewayUrl }: AuthOptions) {
  const contextUrl = `${authGatewayUrl}/session/context?app=${encodeURIComponent(appId)}`;

  async function authenticate(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
    const cookie = req.headers.cookie;
    if (!cookie) {
      res.sendStatus(401);
      return;
    }
    let ctxRes: globalThis.Response;
    try {
      ctxRes = await fetch(contextUrl, { headers: { cookie } });
    } catch (err) {
      console.error(`${appId}: auth-gateway unreachable, failing closed`, err);
      res.sendStatus(502);
      return;
    }
    if (ctxRes.status === 401) {
      res.sendStatus(401);
      return;
    }
    if (!ctxRes.ok) {
      console.error(`${appId}: /session/context returned ${ctxRes.status}, failing closed`);
      res.sendStatus(502);
      return;
    }
    const ctx = (await ctxRes.json()) as SessionContext;
    if (!ctx.permissions?.read) {
      res.sendStatus(403);
      return;
    }
    const { permissions, ...identity } = ctx;
    req.identity = identity;
    req.permissions = permissions;
    next();
  }

  // Must run after `authenticate` (it reads req.permissions).
  function requireVerb(verb: Verb) {
    return (req: AuthedRequest, res: Response, next: NextFunction): void => {
      if (!hasVerb(req, verb)) {
        res.sendStatus(req.permissions ? 403 : 401);
        return;
      }
      next();
    };
  }

  return { authenticate, requireVerb };
}

// For conditional checks inside a handler — e.g. "a user may always cancel
// their own booking, but cancelling someone else's needs `delete`".
export function hasVerb(req: AuthedRequest, verb: Verb): boolean {
  return req.permissions?.[verb] === true;
}
