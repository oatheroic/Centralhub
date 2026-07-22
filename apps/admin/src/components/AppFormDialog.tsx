import { useEffect, useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Check } from "lucide-react";
import { Button, Input } from "@centralhub/ui";
import { IconPicker } from "./IconPicker";

export type AppFormValues = {
  id: string;
  name: string;
  department: string;
  icon: string;
  description: string;
  hidden: boolean;
  requiresRole: string;
  knownApp: boolean;
  adminRoleCode: string;
};

const EMPTY: AppFormValues = {
  id: "",
  name: "",
  department: "",
  icon: "LayoutGrid",
  description: "",
  hidden: false,
  requiresRole: "",
  knownApp: true,
  adminRoleCode: "",
};

// Create/edit form for one apps row. id is only editable on create (it's
// the primary key and matches the app-<id> compose service / apps/<id>/
// folder — changing it after the fact would orphan every app_permissions/
// app_role_rules row already pointing at the old id). knownApp/
// adminRoleCode are deliberately only settable here, never from a
// manifest — see services/auth-gateway/src/db.ts's apps table comment.
export function AppFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AppFormValues | null;
  onSave: (values: AppFormValues) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<AppFormValues>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const isEdit = initial !== null;

  useEffect(() => {
    if (open) setDraft(initial ?? EMPTY);
  }, [open, initial]);

  function set<K extends keyof AppFormValues>(key: K, value: AppFormValues[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function confirm() {
    setBusy(true);
    try {
      const saved = await onSave(draft);
      if (saved) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  const canSave = draft.id.trim() && draft.name.trim() && draft.department.trim();

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-black/50" />
        <RadixDialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6">
          <RadixDialog.Title className="text-base font-semibold text-text">
            {isEdit ? `Edit ${initial!.id}` : "Add app"}
          </RadixDialog.Title>
          <RadixDialog.Description className="mt-2 text-sm text-text-muted">
            {isEdit
              ? "Changes are admin-managed from here on — a manifest sync will never overwrite this row again."
              : "Registers a dashboard entry immediately. This does not create a container — the app's compose service, Dockerfile, and Nginx routing (if needed) are separate steps."}
          </RadixDialog.Description>

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">Id</span>
              <Input
                value={draft.id}
                disabled={isEdit}
                placeholder="e.g. logistics"
                onChange={(e) => set("id", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">Name</span>
              <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">Department</span>
              <Input value={draft.department} onChange={(e) => set("department", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">Icon</span>
              <IconPicker value={draft.icon} onChange={(name) => set("icon", name)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">Description</span>
              <Input value={draft.description} onChange={(e) => set("description", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-muted">Requires role (dashboard visibility only)</span>
              <Input
                value={draft.requiresRole}
                placeholder="e.g. admin — leave blank for everyone"
                onChange={(e) => set("requiresRole", e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={draft.hidden} onChange={(e) => set("hidden", e.target.checked)} />
              Hidden from the dashboard grid
            </label>
            <div className="rounded-md border border-border bg-surface-muted/50 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Authorization (admin-only — never set by a manifest)
              </p>
              <label className="flex items-center gap-2 text-sm text-text">
                <input type="checkbox" checked={draft.knownApp} onChange={(e) => set("knownApp", e.target.checked)} />
                Known app (participates in the permission matrix)
              </label>
              <label className="mt-2 flex flex-col gap-1 text-sm">
                <span className="text-text-muted">Guaranteed admin role_code (optional)</span>
                <Input
                  value={draft.adminRoleCode}
                  placeholder="leave blank unless this app uses attribute-based roles"
                  onChange={(e) => set("adminRoleCode", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <RadixDialog.Close asChild>
              <Button variant="secondary">Cancel</Button>
            </RadixDialog.Close>
            <Button variant="primary" disabled={!canSave || busy} onClick={() => void confirm()}>
              <Check size={16} />
              Save
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
