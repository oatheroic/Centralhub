import { useState } from "react";
import { Info, X } from "lucide-react";

const DISMISSED_KEY_PREFIX = "chub_banner_dismissed_";

function isDismissed(id: string): boolean {
  return window.localStorage.getItem(DISMISSED_KEY_PREFIX + id) === "1";
}

export function SystemBanner({ id, message }: { id: string; message: string }) {
  const [dismissed, setDismissed] = useState(() => isDismissed(id));

  if (dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/5 px-5 py-3">
      <div className="flex items-center gap-2.5 text-sm text-text">
        <Info size={16} className="shrink-0 text-accent" />
        <p>{message}</p>
      </div>
      <button
        onClick={() => {
          window.localStorage.setItem(DISMISSED_KEY_PREFIX + id, "1");
          setDismissed(true);
        }}
        aria-label="Dismiss announcement"
        className="shrink-0 rounded p-1 text-text-muted transition hover:bg-border hover:text-text"
      >
        <X size={16} />
      </button>
    </div>
  );
}
