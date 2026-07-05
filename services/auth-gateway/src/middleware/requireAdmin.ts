import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, verifySession, type SessionClaims } from "../session.js";
import { isRevoked } from "../revocation.js";
import { hasRole } from "../roles.js";

export type AuthedRequest = Request & { session?: SessionClaims };

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
