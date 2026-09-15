import { Router } from "express";
import { hasVerb, type AuthedRequest } from "@centralhub/service-kit";
import { pool } from "../db.js";
import { requireVerb, notify } from "../auth.js";

export const bookingsRouter = Router();

type BookingRow = {
  id: number;
  resource_id: number;
  user_sub: string;
  user_name: string;
  title: string;
  starts_at: string;
  ends_at: string;
};

function toBooking(row: BookingRow) {
  return {
    id: row.id,
    resourceId: row.resource_id,
    userName: row.user_name,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

// Bookings within a range are visible to every reader (not just their own),
// same as any shared room calendar — the read gate ahead of this service
// already limits this to logged-in, resource-booking-read-granted users.
bookingsRouter.get("/bookings", async (req, res) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  if (!from || !to) {
    res.status(400).json({ error: "missing ?from=&to= query params" });
    return;
  }
  try {
    const result = await pool.query<BookingRow>(
      "SELECT * FROM bookings WHERE starts_at < $2 AND ends_at > $1 ORDER BY starts_at",
      [from, to],
    );
    res.json(result.rows.map(toBooking));
  } catch (err) {
    console.error("booking-api: list bookings failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});

bookingsRouter.get("/bookings/mine", async (req: AuthedRequest, res) => {
  try {
    const result = await pool.query<BookingRow>(
      "SELECT * FROM bookings WHERE user_sub = $1 AND ends_at > now() ORDER BY starts_at",
      [req.identity!.sub],
    );
    res.json(result.rows.map(toBooking));
  } catch (err) {
    console.error("booking-api: list my bookings failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});

bookingsRouter.post("/bookings", requireVerb("write"), async (req: AuthedRequest, res) => {
  const body = req.body as Partial<{ resourceId: number; title: string; startsAt: string; endsAt: string }>;
  if (!body.resourceId || !body.title || !body.startsAt || !body.endsAt) {
    res.status(400).json({ error: "resourceId, title, startsAt, endsAt are required" });
    return;
  }
  // The frontend already checks this, but that's a UX guard only — enforce
  // it here too, since this is the real gate. A stale-but-otherwise-valid
  // booking would silently succeed, show up in the day's schedule, but
  // never appear in "upcoming" (GET /bookings/mine filters on ends_at >
  // now()), with nothing telling the caller why.
  if (new Date(body.startsAt) < new Date()) {
    res.status(400).json({ error: "startsAt can't be in the past" });
    return;
  }
  try {
    const result = await pool.query<BookingRow>(
      `INSERT INTO bookings (resource_id, user_sub, user_name, title, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [body.resourceId, req.identity!.sub, req.identity!.name, body.title, body.startsAt, body.endsAt],
    );
    res.status(201).json(toBooking(result.rows[0]));
  } catch (err) {
    // 23P01 = exclusion_violation — the resource is already booked for an
    // overlapping time range. This is a real race between two users
    // booking the same slot, not just a validation error, so the DB
    // constraint (not application code) is what actually prevents it; this
    // just translates it into a client-friendly response.
    if ((err as { code?: string }).code === "23P01") {
      res.status(409).json({ error: "that time slot is no longer available" });
      return;
    }
    console.error("booking-api: create booking failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});

// A user can always cancel their own booking. Canceling someone else's
// (an admin override) requires the "delete" verb — and tells the owner,
// since from their side the booking just silently vanished otherwise.
bookingsRouter.delete("/bookings/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  try {
    const existing = await pool.query<BookingRow & { resource_name: string }>(
      `SELECT b.*, r.name AS resource_name
       FROM bookings b JOIN resources r ON r.id = b.resource_id
       WHERE b.id = $1`,
      [id],
    );
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
    await pool.query("DELETE FROM bookings WHERE id = $1", [id]);
    res.sendStatus(204);
    if (isOverride) {
      // After the response — a notifications hiccup must never fail the
      // cancellation itself (notify() never throws; see service-kit).
      const when = new Date(row.starts_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
      void notify({
        recipientSubs: [row.user_sub],
        type: "warning",
        title: "Your booking was cancelled",
        body: `"${row.title}" in ${row.resource_name} on ${when} was cancelled by ${req.identity!.name}.`,
        link: "/apps/resource-booking/",
        actorSub: req.identity!.sub,
        dedupeKey: `booking-cancelled:${id}`,
      });
    }
  } catch (err) {
    console.error("booking-api: cancel booking failed", err);
    res.status(502).json({ error: "unavailable" });
  }
});
