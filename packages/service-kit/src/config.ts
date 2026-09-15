export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export type ServiceConfig = {
  port: number;
  databaseUrl: string;
  // Internal Docker-network URL for auth-gateway — the kit's `authenticate`
  // middleware and `notify()` helper both talk to it server-to-server.
  authGatewayUrl: string;
};

// The three env vars every app backend in this repo needs. Each compose
// service block sets them the same way (see api-resource-booking in
// environments/docker-compose.yml); a service that needs more reads its
// own extras with requireEnv()/optionalEnv() alongside this.
export function loadServiceConfig(): ServiceConfig {
  return {
    port: Number(optionalEnv("PORT", "4200")),
    databaseUrl: requireEnv("DATABASE_URL"),
    authGatewayUrl: requireEnv("AUTH_GATEWAY_URL"),
  };
}
