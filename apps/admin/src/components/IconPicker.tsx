import { useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Button } from "@centralhub/ui";
import { ICON_OPTIONS, iconFor } from "../lib/icons";

// Visual replacement for a free-text "type the Lucide icon name" input —
// opens a small grid of selectable icons instead. The button itself
// previews the currently-selected icon so the field is legible without
// opening the dialog. See lib/icons.ts's ICON_OPTIONS for the curated set
// (must stay in sync with apps/central-hub/src/lib/icons.ts's ICONS map).
export function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const Current = iconFor(value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-md border border-border bg-bg px-3 text-sm text-text hover:border-accent"
      >
        <Current size={16} />
        <span>{value || "Choose icon"}</span>
      </button>

      <RadixDialog.Root open={open} onOpenChange={setOpen}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 bg-black/50" />
          <RadixDialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6">
            <RadixDialog.Title className="text-base font-semibold text-text">Choose an icon</RadixDialog.Title>
            <div className="mt-4 grid grid-cols-6 gap-2">
              {ICON_OPTIONS.map(({ name, Icon }) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                  className={`flex aspect-square items-center justify-center rounded-md border transition hover:border-accent hover:bg-surface-muted ${
                    name === value ? "border-accent bg-accent/10 text-accent" : "border-border text-text-muted"
                  }`}
                >
                  <Icon size={20} />
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <RadixDialog.Close asChild>
                <Button variant="secondary">Cancel</Button>
              </RadixDialog.Close>
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </>
  );
}
