import { Router, type Response } from "express";
import { requireSession, requireAdmin } from "../middleware/requireAdmin.js";
import { listAttributeValues, addAttributeValue, isAttributeKind, type AttributeKind } from "../attributes.js";

// Managed vocabulary for user_attributes' department/position/job_level
// columns — lets apps/admin render dropdowns instead of free text, and an
// admin extend the list in place. No delete endpoint: removing a value an
// existing user is already assigned would just make their attribute look
// "unlisted" with no real cleanup benefit.
export const adminAttributeValuesRouter = Router();

function checkKind(kind: string, res: Response): kind is AttributeKind {
  if (!isAttributeKind(kind)) {
    res.status(400).json({ error: `unknown attribute kind "${kind}"` });
    return false;
  }
  return true;
}

adminAttributeValuesRouter.get(
  "/admin/attribute-values/:kind",
  requireSession,
  requireAdmin,
  async (req, res) => {
    const kind = req.params.kind as string;
    if (!checkKind(kind, res)) return;
    try {
      res.json(await listAttributeValues(kind));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

adminAttributeValuesRouter.post(
  "/admin/attribute-values/:kind",
  requireSession,
  requireAdmin,
  async (req, res) => {
    const kind = req.params.kind as string;
    if (!checkKind(kind, res)) return;
    const { value } = req.body as Partial<{ value: string }>;
    if (!value?.trim()) {
      res.status(400).json({ error: "value is required" });
      return;
    }
    try {
      await addAttributeValue(kind, value.trim());
      res.status(201).json(await listAttributeValues(kind));
    } catch (err) {
      console.error("auth-gateway: attribute value creation failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);
