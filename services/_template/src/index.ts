// services/_template — copy this folder to scaffold a first-party app
// backend (README §10e's "native gate" model, the pattern booking-api set).
//
// Checklist after copying to services/<name>:
//   1. package.json: rename to @services/<name>.
//   2. Dockerfile: replace the three `_template`/`template` references.
//   3. src/config.ts: set APP_ID to the app's id — the same id as its
//      apps/<id> frontend, its app.manifest.json, and its app_permissions
//      rows.
//   4. src/migrations.ts: replace the example schema (append-only from
//      then on — never edit an applied migration, add a new one).
//   5. environments/docker-compose.yml: add `<id>-db` and `api-<id>`
//      services (copy the booking-db / api-resource-booking blocks; the
//      container MUST be named api-<id> and listen on 4200 — that's what
//      the gateway's generic /apps/<id>/api/ routing resolves to), and add
//      api-<id> to gateway's depends_on.
//   6. environments/.env.example: add <ID>_DB_PASSWORD.
//   No gateway/nginx edit, no auth-gateway edit.
//
// Request flow: Nginx already gates /apps/<id>/api/* on a valid session +
// this app's `read` permission before anything reaches this process. The
// kit's `authenticate` then makes ONE auth-gateway call per request to
// resolve who the caller is and which of write/edit/delete they hold; the
// requireVerb()/hasVerb() checks in routes are in-memory after that.
import express from "express";
import cookieParser from "cookie-parser";
import { applyMigrations, connectWithRetry, healthRouter } from "@centralhub/service-kit";
import { config, SERVICE_NAME } from "./config.js";
import { pool } from "./db.js";
import { migrations } from "./migrations.js";
import { authenticate } from "./auth.js";
import { notesRouter } from "./routes/notes.js";

const app = express();
app.use(cookieParser());
app.use(express.json());

// Health is the only unauthenticated route — mount it before `authenticate`.
app.use(healthRouter);

app.use(authenticate);
app.use(notesRouter);

async function start() {
  await connectWithRetry(pool, SERVICE_NAME);
  await applyMigrations(pool, migrations, SERVICE_NAME);
  app.listen(config.port, () => {
    console.log(`${SERVICE_NAME} listening on :${config.port}`);
  });
}

start().catch((err) => {
  console.error(`${SERVICE_NAME} failed to start:`, err);
  process.exit(1);
});
