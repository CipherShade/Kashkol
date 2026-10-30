import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="ui-stat">
      <div className="ui-stat-top">
        <span className="ui-stat-label">{label}</span>
        {icon ? <Icon name={icon} size={17} /> : null}
      </div>
      <div className="ui-stat-value">{value}</div>
      {hint ? <div className="ui-stat-hint">{hint}</div> : null}
    </div>
  );
}

export function Progress({
  value,
  tone = "primary",
  label,
}: {
  /** 0–100. The value is clamped; it is always computed by the caller. */
  value: number;
  tone?: "primary" | "success" | "warn" | "danger";
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      className="ui-progress"
      data-tone={tone}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label}
    >
      <div className="ui-progress-indicator" style={{ inlineSize: `${clamped}%` }} />
    </div>
  );
}
