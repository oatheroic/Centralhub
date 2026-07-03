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

  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 5 * 60 * 1000,
  });
  res.cookie(REDIRECT_COOKIE, redirect, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 5 * 60 * 1000,
  });

  res.redirect(buildAuthorizeUrl(state));
});
