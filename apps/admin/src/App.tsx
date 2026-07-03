import { useEffect, useState } from "react";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
};

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
      <div className="mx-auto max-w-3xl space-y-6">
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
      </div>
    </main>
  );
}
