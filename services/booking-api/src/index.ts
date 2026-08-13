import express from "express";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { resolveIdentity } from "./auth.js";
import { resourcesRouter } from "./routes/resources.js";
import { bookingsRouter } from "./routes/bookings.js";

const app = express();
app.use(cookieParser());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Every route below needs the caller's identity (for user_sub on bookings,
// or as a prerequisite to the write/edit/delete permission checks) — read
// access itself is already enforced ahead of this service by Nginx's
// auth_request gate on /apps/resource-booking/.
app.use(resolveIdentity);
app.use(resourcesRouter);
app.use(bookingsRouter);

async function start() {
  await migrate();
  app.listen(config.port, () => {
    console.log(`booking-api listening on :${config.port}`);
  });
}

start().catch((err) => {
  console.error("booking-api failed to start:", err);
  process.exit(1);
});
