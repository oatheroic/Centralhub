import { Router } from "express";
import { SESSION_COOKIE, verifySession } from "../session.js";

export const sessionRouter = Router();

sessionRouter.get("/session/verify", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const claims = token ? await verifySession(token) : null;
  if (!claims) {
    res.sendStatus(401);
    return;
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
