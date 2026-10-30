import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type BadgeTone = "neutral" | "primary" | "success" | "warn" | "danger" | "accent" | "outline";

/**
 * A status badge. The caller always supplies text; the icon is an additional
 * cue, never the only one (no colour-only status meaning).
 */
export function Badge({
  tone,
  variant,
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  variant?: string;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  const effectiveTone = (tone ??
    (variant === "destructive"
      ? "danger"
      : variant === "warning"
        ? "warn"
        : variant === "secondary"
          ? "neutral"
          : variant) ??
    "neutral") as BadgeTone;
  return (
    <span
      className={["ui-badge", className].filter(Boolean).join(" ")}
      data-tone={effectiveTone}
    >
      {icon ? <Icon name={icon} size={13} strokeWidth={2} /> : null}
      <span>{children}</span>
    </span>
  );
}
