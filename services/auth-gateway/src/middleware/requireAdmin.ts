import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, verifySession, type SessionClaims } from "../session.js";

export type AuthedRequest = Request & { session?: SessionClaims };

export async function requireSession(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const claims = token ? await verifySession(token) : null;
  if (!claims) {
    res.sendStatus(401);
    return;
  }
  req.session = claims;
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.session) {
    res.sendStatus(401);
    return;
  }
  if (!req.session.roles.includes("admin")) {
    res.sendStatus(403);
    return;
  }
  next();
}
