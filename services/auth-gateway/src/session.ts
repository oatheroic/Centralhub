import { SignJWT, jwtVerify } from "jose";
import { config } from "./config.js";

export type SessionClaims = {
  sub: string;
  name: string;
  email: string;
  roles: string[];
};

const secretKey = new TextEncoder().encode(config.sessionSecret);

export const SESSION_COOKIE = "chub_session";

// Holds the raw Keycloak id_token, used only as id_token_hint when calling
// Keycloak's end-session endpoint on logout — see routes/logout.ts.
export const ID_TOKEN_COOKIE = "chub_id_token";

export async function signSession(claims: SessionClaims): Promise<string> {
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
      !Array.isArray(payload.roles)
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      name: payload.name,
      email: payload.email,
      roles: payload.roles as string[],
    };
  } catch {
    return null;
  }
}
