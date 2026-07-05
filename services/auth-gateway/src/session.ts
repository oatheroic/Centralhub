import { SignJWT, jwtVerify } from "jose";
import { config } from "./config.js";

// Deliberately identity-only, no authorization data (no roles/permissions).
// Roles live in user_roles and permissions in app_permissions, both checked
// live against Postgres on every request — see roles.ts/permissions.ts —
// so revoking either takes effect on the very next request instead of
// waiting for this JWT to expire. `issuedAt` (the JWT's `iat`) is kept so
// callers can compare it against session_revocations.revoked_before.
export type SessionInput = {
  sub: string;
  name: string;
  email: string;
};

export type SessionClaims = SessionInput & {
  issuedAt: Date;
};

const secretKey = new TextEncoder().encode(config.sessionSecret);

export const SESSION_COOKIE = "chub_session";

// Holds the raw Keycloak id_token, used only as id_token_hint when calling
// Keycloak's end-session endpoint on logout — see routes/logout.ts.
export const ID_TOKEN_COOKIE = "chub_id_token";

export async function signSession(claims: SessionInput): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey);
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (
      typeof payload.sub !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      name: payload.name,
      email: payload.email,
      issuedAt: new Date(payload.iat * 1000),
    };
  } catch {
    return null;
  }
}
