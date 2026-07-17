import { Router, type Response } from "express";
import { requireSession, requireAdmin, type AuthedRequest } from "../middleware/requireAdmin.js";
import {
  listAttributeValues,
  addAttributeValue,
  renameAttributeValue,
  deleteAttributeValue,
  isAttributeKind,
  AttributeValueInUseError,
  AttributeValueExistsError,
  type AttributeKind,
} from "../attributes.js";
import { recordAudit } from "../audit.js";

// Managed vocabulary for user_attributes' department/position/job_level
// columns (and app_role_rules' matching criteria columns) — lets apps/admin
// and each app's own role-rules panel render dropdowns instead of free
// text, and an admin extend/rename/retire the list in place. Rename
// cascades to every existing reference (see renameAttributeValue); delete
// is blocked while any reference still exists (see AttributeValueInUseError)
// rather than leaving a dangling "(unlisted)" value behind.
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

adminAttributeValuesRouter.put(
  "/admin/attribute-values/:kind/:value",
  requireSession,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    const kind = req.params.kind as string;
    if (!checkKind(kind, res)) return;
    const oldValue = req.params.value as string;
    const { newValue } = req.body as Partial<{ newValue: string }>;
    if (!newValue?.trim()) {
      res.status(400).json({ error: "newValue is required" });
      return;
    }
    try {
      await renameAttributeValue(kind, oldValue, newValue.trim());
      void recordAudit({
        actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
        action: "attribute_value.rename",
        detail: { kind, oldValue, newValue: newValue.trim() },
      });
      res.json(await listAttributeValues(kind));
    } catch (err) {
      if (err instanceof AttributeValueExistsError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error("auth-gateway: attribute value rename failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

adminAttributeValuesRouter.delete(
  "/admin/attribute-values/:kind/:value",
  requireSession,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    const kind = req.params.kind as string;
    if (!checkKind(kind, res)) return;
    const value = req.params.value as string;
    try {
      await deleteAttributeValue(kind, value);
      void recordAudit({
        actor: { sub: req.session?.sub ?? null, name: req.session?.name ?? "unknown" },
        action: "attribute_value.delete",
        detail: { kind, value },
      });
      res.sendStatus(204);
    } catch (err) {
      if (err instanceof AttributeValueInUseError) {
        res.status(409).json({ error: "value is still in use", usage: err.usage });
        return;
      }
      console.error("auth-gateway: attribute value deletion failed", err);
      res.status(502).json({ error: (err as Error).message });
    }
  },
);
