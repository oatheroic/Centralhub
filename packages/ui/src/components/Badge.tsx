import type { HTMLAttributes } from "react";

type Tone = "neutral" | "success" | "danger";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-bg text-text-muted",
  success: "bg-success-bg text-success",
  danger: "bg-danger-bg text-danger",
};

export function Badge({ tone = "neutral", className = "", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
      {...props}
    />
  );
}
