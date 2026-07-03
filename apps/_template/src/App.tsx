import { useState } from "react";

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
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">Template App</h1>
      <p className="text-slate-400">
        Copy <code>apps/_template</code> to scaffold a new department mini-app.
      </p>
      <button
        onClick={pingInferenceGateway}
        className="rounded-md bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500"
      >
        Ping inference gateway
      </button>
      <p className="text-sm text-slate-500">{status}</p>
    </main>
  );
}
