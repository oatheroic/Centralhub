import { Router } from "express";
import { config } from "../config.js";
import { renderPermissionDeniedPage } from "../permissionDeniedPage.js";

export const deniedRouter = Router();

deniedRouter.get("/denied", (_req, res) => {
  res.type("html").send(renderPermissionDeniedPage(`${config.gatewayPublicUrl}/`));
});
