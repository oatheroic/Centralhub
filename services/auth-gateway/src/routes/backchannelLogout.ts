import { Router } from "express";
import { verifyLogoutToken } from "../oidc.js";
import { revokeUser } from "../revocation.js";

export const backchannelLogoutRouter = Router();

// Public route — Keycloak calls this server-to-server over the Docker
// network (see keycloak/realm-export.json's backchannel.logout.url), no
// browser or cookie involved, so this is deliberately NOT behind Nginx's
// auth_request gate. Reacts to a Keycloak console admin explicitly ending
// a user's SSO session (Users -> Sessions -> Logout, or the equivalent
// Admin REST call) — NOT to merely disabling a user account, which does
// not by itself end a live session or fire this webhook. See README
// "Pillar 4c" for that caveat.
backchannelLogoutRouter.post("/backchannel-logout", async (req, res) => {
  const logoutToken = req.body?.logout_token as string | undefined;
  if (!logoutToken) {
    res.status(400).send("missing logout_token");
    return;
  }
  try {
    const { sub } = await verifyLogoutToken(logoutToken);
    await revokeUser(sub);
    res.sendStatus(200);
  } catch (err) {
    console.error("auth-gateway: backchannel logout failed", err);
    res.status(400).send("invalid logout_token");
  }
});
