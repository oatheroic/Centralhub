function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

export function Avatar({
  name,
  size = 36,
  ringVar,
}: {
  name: string;
  size?: number;
  /** CSS var name (e.g. "--dept-engineering") to ring the avatar with; omit for no ring. */
  ringVar?: string;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg font-medium"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        boxShadow: ringVar ? `0 0 0 2px rgb(var(--chub-surface)), 0 0 0 3.5px rgb(var(${ringVar}))` : undefined,
      }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
