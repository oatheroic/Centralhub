import { Router } from "express";
import { completeLogin } from "../oidc.js";
import { signSession, SESSION_COOKIE, ID_TOKEN_COOKIE } from "../session.js";
import { safeRedirectPath } from "../safeRedirect.js";
import { syncRolesFromKeycloak } from "../roles.js";
import { renderOAuthStateErrorPage } from "../oauthStateErrorPage.js";
import { config } from "../config.js";

export const callbackRouter = Router();

const STATE_COOKIE = "chub_auth_state";
const REDIRECT_COOKIE = "chub_post_login_redirect";

callbackRouter.get("/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const expectedState = req.cookies?.[STATE_COOKIE] as string | undefined;
  const redirect = safeRedirectPath(req.cookies?.[REDIRECT_COOKIE] as string | undefined);

  // Single-use: clear both regardless of outcome below.
  res.clearCookie(STATE_COOKIE);
  res.clearCookie(REDIRECT_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    // Most real-world hits here are not CSRF — they're chub_auth_state
    // simply expiring because the user idled on Keycloak's own login form
    // (see login.ts's STATE_COOKIE maxAge). Send them back into a fresh
    // login rather than dead-ending on a raw error, preserving where they
    // were originally headed.
    const retryTo = `${config.gatewayPublicUrl}/auth/login?redirect=${encodeURIComponent(redirect)}`;
    res.status(400).type("html").send(renderOAuthStateErrorPage(retryTo));
    return;
  }

  try {
    const { sub, name, email, roles, idToken } = await completeLogin(code);
    // Mirror into user_roles so role checks can be re-verified live on every
    // request afterward — the JWT below deliberately does NOT carry roles;
    // it's identity-only (sub/name/email), never the authorization source
    // of truth. See README "Pillar 4c".
    await syncRolesFromKeycloak(sub, roles, "login");
    const token = await signSession({ sub, name, email });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.cookie(ID_TOKEN_COOKIE, idToken, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.redirect(redirect);
  } catch (err) {
    res.status(502).send(`Login failed: ${(err as Error).message}`);
  }
});
