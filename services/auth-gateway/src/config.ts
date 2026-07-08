function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4100),

  // Two distinct Keycloak URLs are required, not one: the browser can only
  // reach Keycloak's published host port, while this service talks to
  // Keycloak container-to-container over the internal Docker network. Both
  // paths resolve to the SAME issuer (KC_HOSTNAME pins it) — see
  // README "Pillar 4" for why collapsing these into one URL would break
  // either the browser redirect or the token issuer check.
  keycloakInternalUrl: requireEnv("KEYCLOAK_INTERNAL_URL"),
  keycloakPublicUrl: requireEnv("KEYCLOAK_PUBLIC_URL"),
  gatewayPublicUrl: requireEnv("GATEWAY_PUBLIC_URL"),
  realm: process.env.KEYCLOAK_REALM ?? "centralhub",
  clientId: process.env.KEYCLOAK_CLIENT_ID ?? "auth-gateway",
  clientSecret: requireEnv("KEYCLOAK_CLIENT_SECRET"),

  sessionSecret: requireEnv("AUTH_SESSION_SECRET"),

  // Shared with postgrest-assets/storage-assets (and any future third-party
  // app's self-hosted data layer) — signs the short-lived data-access JWTs
  // minted by GET /auth/data-token. Deliberately a separate secret from
  // sessionSecret: this one is trusted by services outside this process
  // (PostgREST verifies it directly), the session secret is not.
  pgrstJwtSecret: requireEnv("PGRST_JWT_SECRET"),

  // Reuses the same Postgres instance/credentials that already back
  // Keycloak — see README "Pillar 4" for why this doesn't warrant a
  // separate database engine or container.
  databaseUrl: requireEnv("DATABASE_URL"),
};

export const keycloakEndpoints = {
  authorize: `${config.keycloakPublicUrl}/realms/${config.realm}/protocol/openid-connect/auth`,
  token: `${config.keycloakInternalUrl}/realms/${config.realm}/protocol/openid-connect/token`,
  jwks: `${config.keycloakInternalUrl}/realms/${config.realm}/protocol/openid-connect/certs`,
  issuer: `${config.keycloakPublicUrl}/realms/${config.realm}`,
  adminUsers: `${config.keycloakInternalUrl}/admin/realms/${config.realm}/users`,
  // Browser-facing (KEYCLOAK_PUBLIC_URL) — ends Keycloak's own SSO session,
  // not just ours. Without this, /logout only clears chub_session; the next
  // /login silently re-authenticates via Keycloak's still-live SSO cookie
  // with no credential prompt, which looks to a user like "logout did
  // nothing."
  endSession: `${config.keycloakPublicUrl}/realms/${config.realm}/protocol/openid-connect/logout`,
};

export const redirectUri = `${config.gatewayPublicUrl}/auth/callback`;
