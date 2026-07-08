import { Router } from "express";
import { SignJWT } from "jose";
import { config } from "../config.js";
import { SESSION_COOKIE, verifySession } from "../session.js";
import { getPermission } from "../permissions.js";
import { resolveRoleCode } from "../attributes.js";
import { isRevoked } from "../revocation.js";

// Mints a short-lived JWT for a third-party app's self-hosted data layer
// (PostgREST + storage-api today, see apps/assets) — those services can't
// participate in Nginx's cookie-based auth_request (they need the actual
// permission claims to enforce RLS, not just a yes/no), so this is the one
// place a CentralHub session gets translated into a token an *external*
// process verifies on its own. Signed with PGRST_JWT_SECRET, shared with
// those services, not sessionSecret (which never leaves this process).
const dataJwtSecret = new TextEncoder().encode(config.pgrstJwtSecret);

export const dataTokenRouter = Router();

// Registered without the /auth prefix: Nginx's /auth/ location strips it
// before proxying here (see gateway/conf.d/default.conf's rewrite rule) —
// the browser calls GET /auth/data-token, this service sees GET /data-token.
dataTokenRouter.get("/data-token", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const claims = token ? await verifySession(token) : null;
  if (!claims) {
    res.sendStatus(401);
    return;
  }
  try {
    if (await isRevoked(claims.sub, claims.issuedAt)) {
      res.sendStatus(401);
      return;
    }
  } catch (err) {
    console.error("auth-gateway: revocation check failed, failing closed", err);
    res.sendStatus(401);
    return;
  }

  const appId = req.query.app as string | undefined;
  if (!appId) {
    res.status(400).json({ error: "missing ?app= query param" });
    return;
  }

  try {
    const perm = await getPermission(claims.sub, appId);
    if (!perm.read) {
      res.sendStatus(403);
      return;
    }
    // Resolved from the caller's generic corporate attributes (department/
    // position/job level) against this app's own rules — see attributes.ts.
    // null if the user has no attributes set yet, or none of the app's
    // rules match; the calling app falls back to its own login in that
    // case (e.g. apps/assets's role-code picker), same as before this
    // existed. Included in the JWT payload too (inert today — no RLS
    // policy reads it yet) so a future app's own RLS can reference it
    // without another round-trip through this endpoint.
    const roleCode = await resolveRoleCode(claims.sub, appId);
    const jwt = await new SignJWT({
      role: `${appId}_authenticated`,
      sub: claims.sub,
      perm,
      ...(roleCode ? { role_code: roleCode } : {}),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(dataJwtSecret);
    res.json({ token: jwt, role_code: roleCode });
  } catch (err) {
    console.error("auth-gateway: data-token minting failed, failing closed", err);
    res.status(503).json({ error: "data token unavailable" });
  }
});
