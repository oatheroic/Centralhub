import { Router } from "express";
import { config } from "../config.js";
import { renderPermissionDeniedPage } from "../permissionDeniedPage.js";
import { renderAppUnavailablePage } from "../appUnavailablePage.js";

export const deniedRouter = Router();

deniedRouter.get("/denied", (_req, res) => {
  res.type("html").send(renderPermissionDeniedPage(`${config.gatewayPublicUrl}/`));
});

// Nginx's @app_unavailable named location proxies here when proxy_pass to
// app-<id> fails (502/504) — most commonly an app registered in the apps
// table (§12b) with no matching compose service/container up yet.
deniedRouter.get("/unavailable", (_req, res) => {
  res.type("html").send(renderAppUnavailablePage(`${config.gatewayPublicUrl}/`));
});
