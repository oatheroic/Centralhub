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
