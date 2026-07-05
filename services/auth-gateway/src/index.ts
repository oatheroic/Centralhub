import express from "express";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { seedDevPermissions } from "./permissions.js";
import { loginRouter } from "./routes/login.js";
import { callbackRouter } from "./routes/callback.js";
import { sessionRouter } from "./routes/session.js";
import { logoutRouter } from "./routes/logout.js";
import { adminUsersRouter } from "./routes/adminUsers.js";
import { adminPermissionsRouter } from "./routes/adminPermissions.js";
import { adminSessionsRouter } from "./routes/adminSessions.js";
import { backchannelLogoutRouter } from "./routes/backchannelLogout.js";
import { deniedRouter } from "./routes/denied.js";

const app = express();
app.use(cookieParser());
app.use(express.json());
// Keycloak's backchannel-logout POST is form-urlencoded per the OIDC spec
// (a `logout_token` field), not JSON.
app.use(express.urlencoded({ extended: false }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(loginRouter);
app.use(callbackRouter);
app.use(sessionRouter);
app.use(logoutRouter);
app.use(adminUsersRouter);
app.use(adminPermissionsRouter);
app.use(adminSessionsRouter);
app.use(backchannelLogoutRouter);
app.use(deniedRouter);

async function start() {
  await migrate();
  // Not awaited: Keycloak's own boot can take 30-45s, far longer than
  // Postgres — seeding retries in the background so it doesn't hold up
  // the gateway from serving real login traffic in the meantime.
  void seedDevPermissions();
  app.listen(config.port, () => {
    console.log(`auth-gateway listening on :${config.port}`);
  });
}

start().catch((err) => {
  console.error("auth-gateway failed to start:", err);
  process.exit(1);
});
