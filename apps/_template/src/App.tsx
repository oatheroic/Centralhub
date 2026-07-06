import { useState } from "react";
import { AppShell, Button, Card } from "@centralhub/ui";

export default function App() {
  const [status, setStatus] = useState<string>("idle");

  async function pingInferenceGateway() {
    setStatus("checking...");
    try {
      const res = await fetch("/api/inference/health");
      const data: { provider: string; ok: boolean } = await res.json();
      setStatus(`gateway ok — provider: ${data.provider}`);
    } catch {
      setStatus("gateway unreachable");
    }
  }

  return (
    <AppShell title="Template App">
      <Card className="flex flex-col items-start gap-4">
        <p className="text-text-muted">
          Copy <code>apps/_template</code> to scaffold a new department mini-app.
        </p>
        <Button onClick={pingInferenceGateway}>Ping inference gateway</Button>
        <p className="text-sm text-text-muted">{status}</p>
      </Card>
    </AppShell>
  );
}
