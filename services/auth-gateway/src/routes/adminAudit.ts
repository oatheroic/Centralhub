import { Router } from "express";
import { requireSession, requireAdmin } from "../middleware/requireAdmin.js";
import { listAudit } from "../audit.js";

export const adminAuditRouter = Router();

adminAuditRouter.get("/admin/audit", requireSession, requireAdmin, async (req, res) => {
  const limit = Number(req.query.limit);
  try {
    res.json(await listAudit(Number.isFinite(limit) ? limit : undefined));
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
