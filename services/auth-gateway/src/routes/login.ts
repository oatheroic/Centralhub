import { Router } from "express";
import crypto from "node:crypto";
import { buildAuthorizeUrl } from "../oidc.js";
import { safeRedirectPath } from "../safeRedirect.js";

export const loginRouter = Router();

const STATE_COOKIE = "chub_auth_state";
const REDIRECT_COOKIE = "chub_post_login_redirect";

loginRouter.get("/login", (req, res) => {
  const redirect = safeRedirectPath(req.query.redirect as string | undefined);
  const state = crypto.randomUUID();

  // 5 minutes was tight enough that a user idling on Keycloak's own login
  // form (e.g. after just being timed out and having to stop to re-recall
  // credentials) could outlast it, turning a normal slow login into a dead
  // -end "Invalid or missing OAuth state" page — see callback.ts. 10 minutes
  // comfortably covers a real human filling in a login form while staying
  // well short of anything that would make the state cookie a stale,
  // reusable CSRF token.
  const STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: STATE_COOKIE_MAX_AGE_MS,
  });
  res.cookie(REDIRECT_COOKIE, redirect, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: STATE_COOKIE_MAX_AGE_MS,
  });

  res.redirect(buildAuthorizeUrl(state));
});
