import { createRemoteJWKSet, jwtVerify } from "jose";
import { config, keycloakEndpoints, redirectUri } from "./config.js";

const jwks = createRemoteJWKSet(new URL(keycloakEndpoints.jwks));

type TokenResponse = {
  access_token: string;
  id_token: string;
  token_type: string;
};

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(keycloakEndpoints.authorize);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  // Forces a real credential check every time, even if Keycloak still has
  // a live SSO cookie from an earlier login. Without this, a revoked
  // chub_session (§8 — role revoked, or an admin's "Revoke session")
  // silently re-authenticates for free the moment the user hits
  // /auth/login, completely undoing the revocation. auth-gateway is
  // Keycloak's only client in this realm, so there's no multi-app SSO
  // convenience being given up — every /auth/login here should mean "the
  // caller doesn't have a valid session," so a credential prompt is always
  // the correct behavior, not a regression.
  url.searchParams.set("prompt", "login");
  return url.toString();
}

async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(keycloakEndpoints.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`Keycloak token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

export type IdTokenClaims = {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  realm_access?: { roles?: string[] };
};

export async function completeLogin(code: string): Promise<{
  sub: string;
  name: string;
  email: string;
  roles: string[];
  idToken: string;
}> {
  const tokens = await exchangeCodeForTokens(code);

  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: keycloakEndpoints.issuer,
    audience: config.clientId,
  });
  const claims = payload as IdTokenClaims;

  return {
    sub: claims.sub,
    name: claims.name ?? claims.preferred_username ?? "Unknown",
    email: claims.email ?? "",
    roles: claims.realm_access?.roles ?? [],
    // Raw JWT, kept only to pass as id_token_hint to Keycloak's end-session
    // endpoint on logout (Keycloak requires it to identify which SSO
    // session to kill) — never used for authorization decisions.
    idToken: tokens.id_token,
  };
}

const BACKCHANNEL_LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";

// Verifies a Keycloak-signed logout_token sent to our backchannel-logout
// endpoint (server-to-server, over the Docker network — never through
// Nginx or a browser). Reuses the same JWKS as ID token verification,
// since both are signed by the realm's own key. Per the OIDC Backchannel
// Logout spec, a valid logout_token must carry a `sub` and an `events`
// claim containing the backchannel-logout event key.
export async function verifyLogoutToken(token: string): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: keycloakEndpoints.issuer,
    audience: config.clientId,
  });
  const sub = payload.sub;
  const events = payload.events as Record<string, unknown> | undefined;
  if (typeof sub !== "string" || !events || !(BACKCHANNEL_LOGOUT_EVENT in events)) {
    throw new Error("logout_token missing sub or backchannel-logout event claim");
  }
  return { sub };
}

export async function clientCredentialsToken(): Promise<string> {
  const res = await fetch(keycloakEndpoints.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`Keycloak client_credentials grant failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
