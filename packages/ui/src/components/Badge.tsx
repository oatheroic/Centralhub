import type { HTMLAttributes } from "react";

type Tone = "neutral" | "success" | "danger" | "warning";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-bg text-text-muted",
  success: "bg-success-bg text-success",
  danger: "bg-danger-bg text-danger",
  // No dedicated amber/warning token in tokens.css yet — reuses the same
  // accent tint central-hub's "Your team" pill already uses rather than
  // adding a new CSS variable for one badge tone.
  warning: "bg-accent/10 text-accent",
};

export function Badge({ tone = "neutral", className = "", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
      {...props}
    />
  );
}
