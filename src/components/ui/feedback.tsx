import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type AlertTone = "info" | "success" | "warning" | "danger" | "warn" | "error";

const DEFAULT_ICON: Record<string, IconName> = {
  info: "info",
  success: "checkCircle",
  warning: "alert",
  warn: "alert",
  danger: "xCircle",
  error: "xCircle",
};

export function Alert({
  tone,
  variant,
  title,
  children,
  description,
  action,
  icon,
  live,
}: {
  tone?: AlertTone;
  variant?: string;
  title?: ReactNode;
  children?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
  /** `alert` interrupts; `status` is polite. Defaults to `status`. */
  live?: "alert" | "status" | "off";
}) {
  const effectiveTone = (tone ?? variant ?? "info") as AlertTone;
  const mappedTone =
    effectiveTone === "error" ? "danger" : effectiveTone === "warn" ? "warning" : effectiveTone;
  const role = live === "alert" ? "alert" : live === "status" ? "status" : undefined;
  const content = children ?? description;
  return (
    <div className="ui-alert" data-tone={mappedTone} role={role}>
      <Icon name={icon ?? DEFAULT_ICON[effectiveTone] ?? "info"} size={17} className="ui-alert-icon" />
      <div className="ui-alert-content">
        {title ? <p className="ui-alert-title">{title}</p> : null}
        {content ? <div className="ui-alert-description">{content}</div> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = "info",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <span className="ui-empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <p className="ui-empty-title">{title}</p>
      {description ? <p className="ui-empty-description">{description}</p> : null}
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
  icon = "alert",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="ui-alert" data-tone="danger" role="alert">
      <Icon name={icon} size={18} className="ui-alert-icon" />
      <div className="ui-alert-content">
        <p className="ui-alert-title">{title}</p>
        {description ? <div className="ui-alert-description">{description}</div> : null}
        {action ? <div className="ui-empty-action">{action}</div> : null}
      </div>
    </div>
  );
}

export function Skeleton({
  className,
  shape = "line",
  width,
  height,
}: {
  className?: string;
  shape?: "line" | "circle" | "block";
  width?: string;
  height?: string;
}) {
  return (
    <span
      className={["ui-skeleton", className].filter(Boolean).join(" ")}
      data-shape={shape === "circle" ? "circle" : undefined}
      style={{ inlineSize: width, blockSize: height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="ui-skeleton-stack" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? "62%" : "100%"} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="app-page" aria-hidden="true">
      <div className="ui-skeleton-stack">
        <Skeleton width="9rem" height="0.8rem" />
        <Skeleton width="16rem" height="2rem" />
        <Skeleton width="28rem" height="0.9rem" />
      </div>
      <div className="app-dashboard-grid">
        <Skeleton height="11rem" className="ui-card" />
        <Skeleton height="11rem" className="ui-card" />
      </div>
    </div>
  );
}
