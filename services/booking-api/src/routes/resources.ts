import { Router } from "express";
import { pool } from "../db.js";
import { requireVerb, type AuthedRequest } from "../auth.js";

export const resourcesRouter = Router();

type ResourceRow = {
  id: number;
  name: string;
  location: string | null;
  capacity: number | null;
  is_active: boolean;
};

function toResource(row: ResourceRow) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    capacity: row.capacity,
    isActive: row.is_active,
  };
}

// Returns every room, active or not — the "book a room" view filters to
// active ones client-side, the "manage rooms" admin view needs to see and
// re-activate inactive ones too. No sensitive data here, so no verb check
// beyond the read gate Nginx already enforces ahead of this service.
resourcesRouter.get("/resources", async (_req, res) => {
  try {
    const result = await pool.query<ResourceRow>("SELECT * FROM resources ORDER BY name");
    res.json(result.rows.map(toResource));
  } catch (err) {
    console.error("booking-api: list resources failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});

resourcesRouter.post("/resources", requireVerb("edit"), async (req: AuthedRequest, res) => {
  const body = req.body as Partial<{ name: string; location: string; capacity: number }>;
  if (!body.name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const result = await pool.query<ResourceRow>(
      "INSERT INTO resources (name, location, capacity) VALUES ($1, $2, $3) RETURNING *",
      [body.name, body.location ?? null, body.capacity ?? null],
    );
    res.status(201).json(toResource(result.rows[0]));
  } catch (err) {
    console.error("booking-api: create resource failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});

resourcesRouter.put("/resources/:id", requireVerb("edit"), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const body = req.body as Partial<{ name: string; location: string; capacity: number; isActive: boolean }>;
  try {
    const current = await pool.query<ResourceRow>("SELECT * FROM resources WHERE id = $1", [id]);
    const row = current.rows[0];
    if (!row) {
      res.sendStatus(404);
      return;
    }
    const next = {
      name: body.name ?? row.name,
      location: body.location ?? row.location,
      capacity: body.capacity ?? row.capacity,
      is_active: body.isActive ?? row.is_active,
    };
    const result = await pool.query<ResourceRow>(
      "UPDATE resources SET name = $2, location = $3, capacity = $4, is_active = $5 WHERE id = $1 RETURNING *",
      [id, next.name, next.location, next.capacity, next.is_active],
    );
    res.json(toResource(result.rows[0]));
  } catch (err) {
    console.error("booking-api: update resource failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});

resourcesRouter.delete("/resources/:id", requireVerb("delete"), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  try {
    await pool.query("DELETE FROM resources WHERE id = $1", [id]);
    res.sendStatus(204);
  } catch (err) {
    console.error("booking-api: delete resource failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});
