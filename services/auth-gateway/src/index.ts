import express from "express";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { loginRouter } from "./routes/login.js";
import { callbackRouter } from "./routes/callback.js";
import { sessionRouter } from "./routes/session.js";
import { logoutRouter } from "./routes/logout.js";
import { adminUsersRouter } from "./routes/adminUsers.js";

const app = express();
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(loginRouter);
app.use(callbackRouter);
app.use(sessionRouter);
app.use(logoutRouter);
app.use(adminUsersRouter);

app.listen(config.port, () => {
  console.log(`auth-gateway listening on :${config.port}`);
});
