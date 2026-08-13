import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";

export type Identity = { sub: string; name: string; email: string };
export type AuthedRequest = Request & { identity?: Identity };

const APP_ID = "resource-booking";

// This service is first-party, trusted code — per README §7's "Choosing an
// enforcement model" decision tree, it uses the native gate
// (auth-gateway's /session/verify-permission), not minted-JWT/RLS (that
// model exists for untrusted third-party apps like assets/engineering).
// Read access is already enforced ahead of this service by Nginx's
// auth_request gate on /apps/resource-booking/ — this file only resolves
// identity and checks write/edit/delete before a mutation.

// Resolves the caller's identity by forwarding their session cookie to
// auth-gateway's existing GET /me — no new auth-gateway endpoint needed.
export async function resolveIdentity(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const cookie = req.headers.cookie;
  if (!cookie) {
    res.sendStatus(401);
    return;
  }
  try {
    const meRes = await fetch(`${config.authGatewayUrl}/me`, { headers: { cookie } });
    if (!meRes.ok) {
      res.sendStatus(meRes.status === 401 ? 401 : 502);
      return;
    }
    const me = (await meRes.json()) as { sub: string; name: string; email: string };
    req.identity = { sub: me.sub, name: me.name, email: me.email };
    next();
  } catch (err) {
    console.error("booking-api: identity resolution failed", err);
    res.sendStatus(502);
  }
}

// Checks a write/edit/delete verb against auth-gateway's app_permissions —
// the single source of truth every other app already uses. Returns the HTTP
// status to answer the caller with: 200 means granted.
export async function checkVerb(cookie: string, verb: "write" | "edit" | "delete"): Promise<number> {
  try {
    const checkRes = await fetch(`${config.authGatewayUrl}/session/verify-permission?app=${APP_ID}&verb=${verb}`, {
      headers: { cookie },
    });
    return checkRes.ok ? 200 : checkRes.status === 401 ? 401 : 403;
  } catch (err) {
    console.error("booking-api: permission check failed, failing closed", err);
    return 403;
  }
}

// Express middleware wrapper around checkVerb, for routes that always
// require a given verb. Must run after resolveIdentity (needs the same
// forwarded cookie).
export function requireVerb(verb: "write" | "edit" | "delete") {
  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    const cookie = req.headers.cookie;
    if (!cookie) {
      res.sendStatus(401);
      return;
    }
    const status = await checkVerb(cookie, verb);
    if (status !== 200) {
      res.sendStatus(status);
      return;
    }
    next();
  };
}
