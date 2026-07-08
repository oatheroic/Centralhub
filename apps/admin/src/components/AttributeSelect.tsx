import { useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Check } from "lucide-react";
import { Button, Input, Select } from "@centralhub/ui";

const ADD_NEW = "__add_new__";

// A managed dropdown for one user_attributes column (department/position/
// jobLevel) — options come from the server-side attribute_values table,
// with a "+ Add new..." entry that opens a small modal (mirrors
// @centralhub/ui's ConfirmDialog's Radix pattern) so an admin can extend
// the list without the row itself changing shape.
export function AttributeSelect({
  value,
  options,
  placeholder,
  onChange,
  onAddOption,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
  onAddOption: (value: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  function closeDialog(next: boolean) {
    setOpen(next);
    if (!next) setDraft("");
  }

  async function confirm() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await onAddOption(trimmed);
    onChange(trimmed);
    closeDialog(false);
  }

  const label = placeholder.replace(/^Select /, "");

  return (
    <>
      <Select
        value={value}
        className="h-8 w-full min-w-[9rem] text-xs"
        onChange={(e) => {
          if (e.target.value === ADD_NEW) {
            setOpen(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {value && !options.includes(value) && <option value={value}>{value} (unlisted)</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value={ADD_NEW}>+ Add new...</option>
      </Select>

      <RadixDialog.Root open={open} onOpenChange={closeDialog}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 bg-black/50" />
          <RadixDialog.Content className="fixed left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6">
            <RadixDialog.Title className="text-base font-semibold text-text">Add {label}</RadixDialog.Title>
            <RadixDialog.Description className="mt-2 text-sm text-text-muted">
              The new value becomes available immediately, for every user.
            </RadixDialog.Description>
            <Input
              autoFocus
              value={draft}
              placeholder={`New ${label.toLowerCase()}`}
              className="mt-4"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirm();
              }}
            />
            <div className="mt-6 flex justify-end gap-3">
              <RadixDialog.Close asChild>
                <Button variant="secondary">Cancel</Button>
              </RadixDialog.Close>
              <Button variant="primary" disabled={!draft.trim()} onClick={() => void confirm()}>
                <Check size={16} />
                Save
              </Button>
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </>
  );
}
