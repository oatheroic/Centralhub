import { useEffect, useState } from "react";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
};

type PermissionSet = { read: boolean; write: boolean; edit: boolean; delete: boolean };

type PermissionMatrix = {
  users: { id: string; name: string; email: string }[];
  apps: string[];
  permissions: Record<string, Record<string, PermissionSet>>;
};

const VERBS: (keyof PermissionSet)[] = ["read", "write", "edit", "delete"];

function PermissionsPanel() {
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/auth/admin/permissions", { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<PermissionMatrix>;
      })
      .then(setMatrix)
      .catch((err) => setError((err as Error).message));
  }, []);

  async function toggle(userId: string, appId: string, verb: keyof PermissionSet) {
    if (!matrix) return;
    const current = matrix.permissions[userId][appId];
    const next = { ...current, [verb]: !current[verb] };

    // Optimistic update — no separate "save" step.
    setMatrix({
      ...matrix,
      permissions: { ...matrix.permissions, [userId]: { ...matrix.permissions[userId], [appId]: next } },
    });

    try {
      const res = await fetch(`/auth/admin/permissions/${userId}/${appId}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (err) {
      // Roll back on failure.
      setMatrix({
        ...matrix,
        permissions: { ...matrix.permissions, [userId]: { ...matrix.permissions[userId], [appId]: current } },
      });
      setError((err as Error).message);
    }
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Permissions</h2>
        <p className="text-slate-400">
          Per-user, per-app read/write/edit/delete grants. Toggling a checkbox saves immediately.
        </p>
      </header>

      {error && <p className="text-sm text-red-400">Failed to load or save: {error}</p>}
      {!error && !matrix && <p className="text-sm text-slate-500">Loading...</p>}

      {matrix && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">User</th>
                {matrix.apps.map((appId) => (
                  <th key={appId} className="py-2 pr-4 font-medium">
                    {appId}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {matrix.users.map((user) => (
                <tr key={user.id}>
                  <td className="py-2 pr-4 align-top">
                    <div>{user.name}</div>
                    <div className="text-slate-500">{user.email}</div>
                  </td>
                  {matrix.apps.map((appId) => {
                    const permission = matrix.permissions[user.id][appId];
                    return (
                      <td key={appId} className="py-2 pr-4 align-top">
                        <div className="flex flex-col gap-1">
                          {VERBS.map((verb) => (
                            <label key={verb} className="flex items-center gap-2 text-slate-400">
                              <input
                                type="checkbox"
                                checked={permission[verb]}
                                onChange={() => toggle(user.id, appId, verb)}
                              />
                              {verb}
                            </label>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/auth/admin/users", { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<AdminUser[]>;
      })
      .then(setUsers)
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-10">
        <section className="space-y-4">
          <header>
            <h1 className="text-3xl font-semibold">Admin</h1>
            <p className="text-slate-400">Users registered in Keycloak.</p>
          </header>

          {error && <p className="text-sm text-red-400">Failed to load users: {error}</p>}
          {!error && !users && <p className="text-sm text-slate-500">Loading...</p>}

          {users && (
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 font-medium">Roles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="py-2 pr-4">{user.name}</td>
                    <td className="py-2 pr-4 text-slate-400">{user.email}</td>
                    <td className="py-2 text-slate-400">{user.roles.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <PermissionsPanel />
      </div>
    </main>
  );
}
