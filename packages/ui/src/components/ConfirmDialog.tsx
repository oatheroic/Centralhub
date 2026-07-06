import * as RadixDialog from "@radix-ui/react-dialog";
import { Button } from "./Button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-black/50" />
        <RadixDialog.Content className="fixed left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6">
          <RadixDialog.Title className="text-base font-semibold text-text">{title}</RadixDialog.Title>
          {description && (
            <RadixDialog.Description className="mt-2 text-sm text-text-muted">
              {description}
            </RadixDialog.Description>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <RadixDialog.Close asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </RadixDialog.Close>
            <Button
              variant={danger ? "danger" : "primary"}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
