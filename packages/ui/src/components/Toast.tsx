import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as RadixToast from "@radix-ui/react-toast";

type ToastTone = "success" | "danger" | "neutral";
type ToastInput = { title: string; description?: string; tone?: ToastTone };
type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const TONE_CLASSES: Record<ToastTone, string> = {
  success: "border-success/30 bg-success-bg text-success",
  danger: "border-danger/30 bg-danger-bg text-danger",
  neutral: "border-border bg-surface text-text",
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((toast: ToastInput) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <RadixToast.Root
            key={toast.id}
            duration={4000}
            onOpenChange={(open) => {
              if (!open) dismiss(toast.id);
            }}
            className={`rounded-lg border px-4 py-3 shadow-lg ${TONE_CLASSES[toast.tone ?? "neutral"]}`}
          >
            <RadixToast.Title className="text-sm font-medium">{toast.title}</RadixToast.Title>
            {toast.description && (
              <RadixToast.Description className="mt-0.5 text-sm opacity-90">
                {toast.description}
              </RadixToast.Description>
            )}
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return useMemo(() => ({ show: showToast }), [showToast]);
}
