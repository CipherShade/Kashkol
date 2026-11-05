import type { ReactNode } from "react";

export type CalendarEvent = {
  id: string;
  title: string;
  timeLabel: string;
  groupName?: string;
  accent?: "primary" | "amber" | "neutral";
};

export function CalendarEventCard({
  event,
  children,
}: {
  event: CalendarEvent;
  children?: ReactNode;
}) {
  const accentClass =
    event.accent === "amber"
      ? "border-t-[3px] border-t-[#C9A84C]"
      : event.accent === "neutral"
        ? "border-t-[3px] border-t-[#808080]"
        : "border-t-[3px] border-t-[#1C5223]";

  return (
    <div
      className={`rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] ${accentClass} p-3 shadow-sm transition-colors hover:border-[var(--border-strong)]`}
      aria-label={event.title}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--ink)] leading-snug">{event.title}</h4>
        <span className="text-[11px] font-medium text-[var(--muted)] shrink-0">{event.timeLabel}</span>
      </div>
      {event.groupName ? (
        <p className="mt-1 text-xs text-[var(--muted)]">{event.groupName}</p>
      ) : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

export function CalendarTimeGrid({
  dayLabels,
  children,
}: {
  dayLabels: string[];
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-px bg-[var(--border)] text-xs font-medium text-[var(--muted)]">
        <div className="bg-[var(--surface)] px-3 py-2 text-start">Time</div>
        {dayLabels.map((d) => (
          <div key={d} className="bg-[var(--surface)] px-3 py-2 text-center">{d}</div>
        ))}
      </div>
      <div className="relative bg-[var(--surface)]">{children}</div>
    </div>
  );
}
