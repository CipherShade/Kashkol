/**
 * User-facing correction warnings for F-P2-12 / F10.
 *
 * These message keys are used both as visible notes in the session dialog and
 * as the text of the submit confirmation when a correction needs an explicit
 * acknowledgement. Keeping the mapping pure makes it testable without
 * rendering the client component.
 */
export type SessionCorrectionKind = "reschedule" | "cancel";

export type SessionForCorrection = {
  id: string;
  groupId: string | null;
  startsAt: string | Date;
  endsAt: string | Date | null;
  status: "scheduled" | "started" | "completed" | "cancelled";
};

export function sessionCorrectionWarningKey(
  session: { hasAttendance: boolean } | null,
  kind: SessionCorrectionKind,
): string | null {
  if (!session?.hasAttendance) return null;
  return kind === "reschedule"
    ? "Sessions.rescheduleAttendanceWarning"
    : "Sessions.cancelAttendanceWarning";
}

function asDate(value: string | Date | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * F10 edge cases: moving onto an occupied slot and moving into the past are
 * warnings, not blocking validation errors. Only group sessions have a
 * timeline that can conflict (ADR-0029).
 */
export function rescheduleWarningKeys(
  session: SessionForCorrection | null,
  nextStartsAt: string,
  nextEndsAt: string | null,
  sessions: SessionForCorrection[],
  now: Date = new Date(),
): string[] {
  const keys: string[] = [];
  if (!session) return keys;

  const startsAt = asDate(nextStartsAt);
  if (!startsAt) return keys;

  const requestedEnd = asDate(nextEndsAt);
  const endsAt =
    requestedEnd && requestedEnd.getTime() > startsAt.getTime()
      ? requestedEnd
      : new Date(startsAt.getTime() + 60 * 60 * 1000);

  if (startsAt.getTime() < now.getTime()) {
    keys.push("Sessions.reschedulePastWarning");
  }

  if (session.groupId) {
    const hasConflict = sessions.some((other) => {
      if (other.id === session.id) return false;
      if (other.groupId !== session.groupId) return false;
      if (other.status === "cancelled") return false;

      const otherStart = asDate(other.startsAt);
      if (!otherStart) return false;
      const otherEnd = asDate(other.endsAt);
      const effectiveOtherEnd =
        otherEnd && otherEnd.getTime() > otherStart.getTime()
          ? otherEnd
          : new Date(otherStart.getTime() + 60 * 60 * 1000);

      return otherStart.getTime() < endsAt.getTime() && effectiveOtherEnd.getTime() > startsAt.getTime();
    });

    if (hasConflict) keys.push("Sessions.rescheduleConflictWarning");
  }

  return keys;
}
