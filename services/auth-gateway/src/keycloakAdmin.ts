import { clientCredentialsToken } from "./oidc.js";
import { keycloakEndpoints } from "./config.js";

type KeycloakUser = {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};

type KeycloakRole = { name: string };

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
};

export async function findUserSubByUsername(username: string): Promise<string | null> {
  const token = await clientCredentialsToken();
  const res = await fetch(
    `${keycloakEndpoints.adminUsers}?username=${encodeURIComponent(username)}&exact=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Keycloak admin user lookup failed: ${res.status}`);
  }
  const users = (await res.json()) as KeycloakUser[];
  return users[0]?.id ?? null;
}

export async function listUsers(): Promise<AdminUser[]> {
  const token = await clientCredentialsToken();
  const headers = { Authorization: `Bearer ${token}` };

  const usersRes = await fetch(keycloakEndpoints.adminUsers, { headers });
  if (!usersRes.ok) {
    throw new Error(`Keycloak admin users list failed: ${usersRes.status}`);
  }
  const users = (await usersRes.json()) as KeycloakUser[];

  return Promise.all(
    users.map(async (user) => {
      const rolesRes = await fetch(`${keycloakEndpoints.adminUsers}/${user.id}/role-mappings/realm`, {
        headers,
      });
      const roles: KeycloakRole[] = rolesRes.ok ? ((await rolesRes.json()) as KeycloakRole[]) : [];
      return {
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username,
        email: user.email ?? "",
        roles: roles.map((r) => r.name),
      };
    }),
  );
}
