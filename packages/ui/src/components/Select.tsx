import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

// className is applied to both the wrapper (so sizing like h-8/w-28 lays
// out correctly) and the <select> itself (so overrides like text-xs beat
// the default text-sm — same trailing-className-wins convention as
// Input.tsx). The select fills the wrapper via h-full/w-full.
// `appearance-none` drops each browser's own native arrow, which otherwise
// looks inconsistent against the design tokens' rounded, bordered inputs.
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = "", children, ...props }, ref) => (
    <div className={`relative inline-block ${className}`}>
      <select
        ref={ref}
        className={`h-full w-full appearance-none rounded-md border border-border bg-surface py-2 pl-3 pr-8 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted"
      />
    </div>
  ),
);
Select.displayName = "Select";
