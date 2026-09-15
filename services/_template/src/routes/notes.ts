// Example resource showing the three permission shapes an app backend
// typically needs. Replace with the app's real routes.
import { Router } from "express";
import { hasVerb, type AuthedRequest } from "@centralhub/service-kit";
import { pool } from "../db.js";
import { requireVerb, notify } from "../auth.js";

export const notesRouter = Router();

type NoteRow = { id: number; user_sub: string; user_name: string; body: string; created_at: string };

// 1. Read-only: no verb check beyond what Nginx + `authenticate` already
//    enforced (a valid session with `read` on this app).
notesRouter.get("/notes", async (_req, res) => {
  try {
    const result = await pool.query<NoteRow>("SELECT * FROM notes ORDER BY created_at DESC LIMIT 100");
    res.json(result.rows);
  } catch (err) {
    console.error("template-api: list notes failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});

// 2. A fixed verb for the whole route: requireVerb() is an in-memory check
//    against the permission set `authenticate` already fetched.
notesRouter.post("/notes", requireVerb("write"), async (req: AuthedRequest, res) => {
  const body = (req.body as Partial<{ body: string }>).body;
  if (!body) {
    res.status(400).json({ error: "body is required" });
    return;
  }
  try {
    const result = await pool.query<NoteRow>(
      "INSERT INTO notes (user_sub, user_name, body) VALUES ($1, $2, $3) RETURNING *",
      [req.identity!.sub, req.identity!.name, body],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("template-api: create note failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});

// 3. A conditional verb: anyone may delete their own note; deleting someone
//    else's needs `delete` — and the owner gets told about it.
notesRouter.delete("/notes/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  try {
    const existing = await pool.query<NoteRow>("SELECT * FROM notes WHERE id = $1", [id]);
    const row = existing.rows[0];
    if (!row) {
      res.sendStatus(404);
      return;
    }
    const isOverride = row.user_sub !== req.identity!.sub;
    if (isOverride && !hasVerb(req, "delete")) {
      res.sendStatus(403);
      return;
    }
    await pool.query("DELETE FROM notes WHERE id = $1", [id]);
    res.sendStatus(204);
    if (isOverride) {
      void notify({
        recipientSubs: [row.user_sub],
        type: "warning",
        title: "Your note was removed",
        body: `Removed by ${req.identity!.name}.`,
        link: "/apps/_template/",
        actorSub: req.identity!.sub,
        dedupeKey: `note-removed:${id}`,
      });
    }
  } catch (err) {
    console.error("template-api: delete note failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});
