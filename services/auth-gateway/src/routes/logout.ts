import { Router } from "express";
import { SESSION_COOKIE, ID_TOKEN_COOKIE } from "../session.js";
import { keycloakEndpoints, config } from "../config.js";
import { renderLoggedOutPage } from "../loggedOutPage.js";

export const logoutRouter = Router();

// Ends both our own session AND Keycloak's browser SSO session. Clearing
// only chub_session isn't enough: Keycloak's SSO cookie (at
// KEYCLOAK_PUBLIC_URL) would still be live, so the very next /auth/login
// would silently re-authenticate the same user with no credential prompt —
// to a human that looks exactly like "the logout button doesn't work."
// Keycloak's end-session endpoint requires id_token_hint to know which SSO
// session to kill, which is why /callback also stashes the raw id_token in
// chub_id_token (never used for authorization, only for this).
//
// Renders a brief confirmation page instead of a bare 302: a raw redirect
// chain through Keycloak's end-session endpoint and back through the login
// gate is 3-4 silent server hops with no visual continuity, which reads as
// "did clicking logout even do anything?" to a human. This page confirms
// the logout happened, then auto-continues (with a manual fallback link in
// case the auto-redirect is ever blocked by something browser-specific).
logoutRouter.get("/logout", (req, res) => {
  const idToken = req.cookies?.[ID_TOKEN_COOKIE] as string | undefined;

  res.clearCookie(SESSION_COOKIE);
  res.clearCookie(ID_TOKEN_COOKIE);

  let target = `${config.gatewayPublicUrl}/`;
  if (idToken) {
    const url = new URL(keycloakEndpoints.endSession);
    url.searchParams.set("id_token_hint", idToken);
    url.searchParams.set("post_logout_redirect_uri", `${config.gatewayPublicUrl}/`);
    target = url.toString();
  }

  res.type("html").send(renderLoggedOutPage(target));
});
