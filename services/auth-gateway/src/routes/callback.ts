import { Router } from "express";
import { completeLogin } from "../oidc.js";
import { signSession, SESSION_COOKIE, ID_TOKEN_COOKIE } from "../session.js";
import { safeRedirectPath } from "../safeRedirect.js";

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
    res.status(400).send("Invalid or missing OAuth state — possible CSRF attempt, login aborted.");
    return;
  }

  try {
    const { sub, name, email, roles, idToken } = await completeLogin(code);
    const token = await signSession({ sub, name, email, roles });
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
