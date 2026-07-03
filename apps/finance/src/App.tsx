import { useEffect, useState } from "react";
import { readHandoffCookie, type HandoffUser } from "./lib/readHandoffCookie";

export default function App() {
  const [user, setUser] = useState<HandoffUser | null | undefined>(undefined);

  useEffect(() => {
    setUser(readHandoffCookie());
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">Finance Department</h1>
      <p className="text-slate-400">Placeholder app — scaffolded from apps/_template.</p>
      <p className="text-sm text-slate-500">
        {user === undefined
          ? "checking session..."
          : user
            ? `Handed off from Central Hub as ${user.name} (${user.role})`
            : "No hub session detected — opened directly"}
      </p>
    </main>
  );
}
