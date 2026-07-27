import type { CSSProperties } from "react";

// Registry departments are dynamic (derived from whatever apps are visible,
// see useAppRegistry) and admin-managed (the "department" attribute_values
// vocabulary, see services/auth-gateway/src/attributes.ts) — as seeded
// today the apps table's actual department strings are the capitalized
// display names ("Marketing", "Finance", "Engineering", "Operations",
// "Platform"), not the app-id-shaped keys the handoff mockup guessed at
// ("assets", "admin"). Matched case-insensitively since that vocabulary is
// admin-editable free text, not a fixed enum; anything outside the known
// set falls back to the neutral border token rather than breaking.
const DEPT_VAR: Record<string, string> = {
  marketing: "--dept-marketing",
  finance: "--dept-finance",
  engineering: "--dept-engineering",
  operations: "--dept-assets",
  platform: "--dept-admin",
};

const FALLBACK_VAR = "--chub-border";

export function deptColorVar(department: string): string {
  return DEPT_VAR[department.toLowerCase()] ?? FALLBACK_VAR;
}

// A `--dept-color` custom property value, set as inline style per element;
// consuming Tailwind classes then reference it via the arbitrary-value
// syntax (e.g. `bg-[var(--dept-color)]/10`) so the class text stays static
// and JIT-detectable regardless of which department is being rendered.
// Cast to React.CSSProperties since TS's CSSProperties type doesn't model
// custom properties — this is React's own documented workaround.
export function deptColorStyle(department: string): CSSProperties {
  return { "--dept-color": `rgb(var(${deptColorVar(department)}))` } as CSSProperties;
}
