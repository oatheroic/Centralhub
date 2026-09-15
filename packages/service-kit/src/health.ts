import { Router, type Router as RouterType } from "express";

// Mount before `authenticate` — a health probe carries no session cookie.
export const healthRouter: RouterType = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});
