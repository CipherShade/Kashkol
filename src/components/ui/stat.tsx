import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type StatTone = "default" | "primary" | "success" | "warn" | "danger" | "muted";

type StatContent = {
  /** Always a real, server-computed value or a label derived from one. */
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: StatTone;
  /** "invert" mirrors the reference composition: dark on light, light on dark. */
  variant?: "default" | "invert";
  className?: string;
};

type StatProps = StatContent &
  (
    | { onClick?: undefined; pressed?: undefined; ariaLabel?: undefined }
    | {
        /** Renders a real button. The card becomes a filter or a shortcut, never a decoration. */
        onClick: () => void;
        pressed?: boolean;
        ariaLabel?: string;
      }
  );

function StatInner({ label, value, hint, icon }: Omit<StatContent, "tone" | "variant" | "className">) {
  return (
    <>
      <div className="ui-stat-top">
        <span className="ui-stat-label">{label}</span>
        {icon ? (
          <span className="ui-stat-icon" aria-hidden="true">
            <Icon name={icon} size={17} />
          </span>
        ) : null}
      </div>
      <div className="ui-stat-value">{value}</div>
      {hint ? <div className="ui-stat-hint">{hint}</div> : null}
    </>
  );
}

export function Stat(props: StatProps) {
  const { label, value, hint, icon, tone = "default", variant = "default", className } = props;
  const classes = ["ui-stat", className].filter(Boolean).join(" ");
  const dataTone = tone === "default" ? undefined : tone;

  if (props.onClick) {
    return (
      <button
        type="button"
        className={classes}
        data-tone={dataTone}
        data-variant={variant === "invert" ? "invert" : undefined}
        data-interactive="true"
        data-pressed={props.pressed === undefined ? undefined : String(props.pressed)}
        aria-pressed={props.pressed}
        aria-label={props.ariaLabel}
        onClick={props.onClick}
      >
        <StatInner label={label} value={value} hint={hint} icon={icon} />
      </button>
    );
  }

  return (
    <div
      className={classes}
      data-tone={dataTone}
      data-variant={variant === "invert" ? "invert" : undefined}
    >
      <StatInner label={label} value={value} hint={hint} icon={icon} />
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
