import { useEffect, useState } from "react";
import { AppShell, Button, Card } from "@centralhub/ui";
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

  const handleSaveCampaign = useGuardedAction(permissions, "write", () => {
    setSaveStatus("Campaign saved.");
  });

  if (denied) {
    return (
      <main
        onClick={() => {
          window.location.href = "/";
        }}
        className="min-h-screen bg-bg text-text-muted flex flex-col items-center justify-center gap-2 p-8 cursor-pointer"
      >
        <h1 className="text-xl font-semibold text-text">Access denied</h1>
        <p className="text-sm text-text-muted">Click anywhere to go back to the dashboard.</p>
      </main>
    );
  }

  return (
    <AppShell title="Marketing Department">
      <Card className="flex flex-col items-start gap-4">
        <p className="text-text-muted">Placeholder app — scaffolded from apps/_template.</p>
        <p className="text-sm text-text-muted">
          {user === undefined
            ? "checking session..."
            : user
              ? `Logged in as ${user.name} (${user.email})`
              : "No session detected"}
        </p>
        <Button onClick={handleSaveCampaign}>Save campaign</Button>
        {saveStatus && <p className="text-sm text-success">{saveStatus}</p>}
      </Card>
    </AppShell>
  );
}
