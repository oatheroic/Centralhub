import { Router } from "express";
import { requireSession, requireAdmin } from "../middleware/requireAdmin.js";
import { listUsers } from "../keycloakAdmin.js";

export const adminUsersRouter = Router();

adminUsersRouter.get("/admin/users", requireSession, requireAdmin, async (_req, res) => {
  try {
    const users = await listUsers();
    res.json(users);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
