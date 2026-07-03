import { useEffect, useState } from "react";

type SessionUser = { name: string; email: string };

export default function App() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => {
    fetch("/auth/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<SessionUser>) : null))
      .then(setUser);
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">Marketing Department</h1>
      <p className="text-slate-400">Placeholder app — scaffolded from apps/_template.</p>
      <p className="text-sm text-slate-500">
        {user === undefined
          ? "checking session..."
          : user
            ? `Logged in as ${user.name} (${user.email})`
            : "No session detected"}
      </p>
    </main>
  );
}
