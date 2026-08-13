function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4200),
  databaseUrl: requireEnv("DATABASE_URL"),
  // Internal Docker-network URL for auth-gateway — used to resolve the
  // caller's identity (GET /me) and to check write/edit/delete permissions
  // (GET /session/verify-permission) before any mutation. Read access is
  // already enforced ahead of this service by Nginx's auth_request gate on
  // /apps/resource-booking/, so this service never re-checks "read".
  authGatewayUrl: requireEnv("AUTH_GATEWAY_URL"),
};
