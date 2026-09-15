import express from "express";
import cookieParser from "cookie-parser";
import { applyMigrations, connectWithRetry, healthRouter } from "@centralhub/service-kit";
import { config } from "./config.js";
import { pool } from "./db.js";
import { migrations } from "./migrations.js";
import { authenticate } from "./auth.js";
import { resourcesRouter } from "./routes/resources.js";
import { bookingsRouter } from "./routes/bookings.js";

const app = express();
app.use(cookieParser());
app.use(express.json());

app.use(healthRouter);

// Every route below needs the caller's identity (for user_sub on bookings)
// and permission set (for the write/edit/delete checks) — one auth-gateway
// round-trip per request, see @centralhub/service-kit's createAuth().
app.use(authenticate);
app.use(resourcesRouter);
app.use(bookingsRouter);

async function start() {
  await connectWithRetry(pool, "booking-api");
  await applyMigrations(pool, migrations, "booking-api");
  app.listen(config.port, () => {
    console.log(`booking-api listening on :${config.port}`);
  });
}

start().catch((err) => {
  console.error("booking-api failed to start:", err);
  process.exit(1);
});
