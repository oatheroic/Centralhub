import { useEffect, useState } from "react";
import { usePermissions, useGuardedAction, useReadGuard } from "./lib/usePermissions";

type SessionUser = { name: string; email: string };

export default function App() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const { permissions, loading } = usePermissions();
  const denied = useReadGuard(permissions, loading);

  useEffect(() => {
    fetch("/auth/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<SessionUser>) : null))
      .then(setUser);
  }, []);

  const handleApproveBudget = useGuardedAction(permissions, "edit", () => {
    setSaveStatus("Budget approved.");
  });

  if (denied) {
    return (
      <main
        onClick={() => {
          window.location.href = "/";
        }}
        className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-2 p-8 cursor-pointer"
      >
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-slate-500">Click anywhere to go back to the dashboard.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">Finance Department</h1>
      <p className="text-slate-400">Placeholder app — scaffolded from apps/_template.</p>
      <p className="text-sm text-slate-500">
        {user === undefined
          ? "checking session..."
          : user
            ? `Logged in as ${user.name} (${user.email})`
            : "No session detected"}
      </p>
      <button
        onClick={handleApproveBudget}
        className="rounded-md bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500"
      >
        Approve budget
      </button>
      {saveStatus && <p className="text-sm text-emerald-400">{saveStatus}</p>}
    </main>
  );
}
