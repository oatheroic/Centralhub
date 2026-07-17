import { useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button, Input } from "@centralhub/ui";

// Rename/delete for one attribute_values kind (department/position/job
// level) — the "official list" CRUD that AttributeSelect's own "+ Add
// new..." dialog doesn't cover. Rename cascades server-side to every
// existing user_attributes/app_role_rules row (see auth-gateway's
// renameAttributeValue); delete is blocked server-side while any reference
// still exists, so a 409 here always means "still in use", surfaced with
// the usage counts the server returns rather than a generic failure.
export function AttributeValueManagerDialog({
  open,
  onOpenChange,
  label,
  values,
  onRename,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  values: string[];
  onRename: (oldValue: string, newValue: string) => Promise<void>;
  onDelete: (value: string) => Promise<{ blocked: boolean; message?: string }>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [blockedNotice, setBlockedNotice] = useState<{ value: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function startEdit(value: string) {
    setEditing(value);
    setDraft(value);
    setBlockedNotice(null);
  }

  async function confirmEdit(oldValue: string) {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === oldValue) {
      setEditing(null);
      return;
    }
    setBusy(true);
    try {
      await onRename(oldValue, trimmed);
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(value: string) {
    setBusy(true);
    setBlockedNotice(null);
    try {
      const result = await onDelete(value);
      if (result.blocked) {
        setBlockedNotice({ value, message: result.message ?? "still in use" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-black/50" />
        <RadixDialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6">
          <RadixDialog.Title className="text-base font-semibold text-text">Manage {label}</RadixDialog.Title>
          <RadixDialog.Description className="mt-2 text-sm text-text-muted">
            Renaming updates every user and role rule already using this value. Deleting is blocked while any are
            still assigned.
          </RadixDialog.Description>

          <ul className="mt-4 flex max-h-80 flex-col gap-1 overflow-y-auto">
            {values.map((value) => (
              <li key={value} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-muted">
                {editing === value ? (
                  <>
                    <Input
                      autoFocus
                      value={draft}
                      className="h-8 flex-1 text-sm"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void confirmEdit(value);
                        if (e.key === "Escape") setEditing(null);
                      }}
                    />
                    <button
                      aria-label="Save"
                      disabled={busy}
                      onClick={() => void confirmEdit(value)}
                      className="text-success hover:opacity-80"
                    >
                      <Check size={16} />
                    </button>
                    <button aria-label="Cancel" onClick={() => setEditing(null)} className="text-text-muted hover:opacity-80">
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-text">{value}</span>
                    <button
                      aria-label={`Rename ${value}`}
                      disabled={busy}
                      onClick={() => startEdit(value)}
                      className="text-text-muted hover:text-text"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      aria-label={`Delete ${value}`}
                      disabled={busy}
                      onClick={() => void confirmDelete(value)}
                      className="text-danger hover:opacity-80"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </li>
            ))}
            {values.length === 0 && <li className="px-2 py-1.5 text-sm text-text-muted">No values yet.</li>}
          </ul>

          {blockedNotice && (
            <p className="mt-3 text-sm text-danger">
              Can't delete "{blockedNotice.value}" — {blockedNotice.message}.
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <RadixDialog.Close asChild>
              <Button variant="secondary">Close</Button>
            </RadixDialog.Close>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
