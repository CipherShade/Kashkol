/** Initials for a person's display name, tolerant of Arabic and Latin names. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = [...parts[0]][0] ?? "";
  const second = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? "") : "";
  return `${first}${second}`.toUpperCase();
}

/** Deterministic tone 1–6 so the same person keeps the same avatar colour. */
export function avatarToneFor(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash + char.codePointAt(0)!) % 6;
  return hash + 1;
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={["ui-avatar", className].filter(Boolean).join(" ")}
      data-size={size}
      data-tone={avatarToneFor(name)}
      aria-hidden="true"
      title={name}
    >
      {initialsFor(name)}
    </span>
  );
}
