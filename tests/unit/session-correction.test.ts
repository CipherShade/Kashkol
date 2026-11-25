import { describe, expect, it } from "vitest";
import {
  rescheduleWarningKeys,
  sessionCorrectionWarningKey,
  type SessionForCorrection,
} from "../../src/modules/sessions/corrections.js";
import {
  cancelSessionSchema,
  rescheduleSessionSchema,
} from "../../src/modules/sessions/schemas.js";

const sessionId = "018f6c5b-4321-789a-bcde-ef0123456789";

function correctionSession(input: {
  id: string;
  groupId: string | null;
  status?: SessionForCorrection["status"];
}): SessionForCorrection {
  return {
    id: input.id,
    groupId: input.groupId,
    startsAt: "2026-12-01T10:00:00.000Z",
    endsAt: "2026-12-01T11:00:00.000Z",
    status: input.status ?? "scheduled",
  };
}

describe("F-P2-12 session correction warnings", () => {
  it("shows no warning when the session has no attendance", () => {
    expect(sessionCorrectionWarningKey({ hasAttendance: false }, "reschedule")).toBeNull();
    expect(sessionCorrectionWarningKey({ hasAttendance: false }, "cancel")).toBeNull();
    expect(sessionCorrectionWarningKey(null, "cancel")).toBeNull();
  });

  it("states that rescheduling keeps attendance attached", () => {
    expect(sessionCorrectionWarningKey({ hasAttendance: true }, "reschedule")).toBe(
      "Sessions.rescheduleAttendanceWarning",
    );
  });

  it("states that cancelling retains attendance but excludes it from rates", () => {
    expect(sessionCorrectionWarningKey({ hasAttendance: true }, "cancel")).toBe(
      "Sessions.cancelAttendanceWarning",
    );
  });

  it("warns when a reschedule moves a session into the past", () => {
    const session = correctionSession({ id: sessionId, groupId: null });

    expect(
      rescheduleWarningKeys(
        session,
        "2026-11-20T10:00:00.000Z",
        null,
        [],
        new Date("2026-11-23T12:00:00.000Z"),
      ),
    ).toContain("Sessions.reschedulePastWarning");
  });

  it("warns about an overlapping group session but allows the move", () => {
    const session = correctionSession({ id: sessionId, groupId: "group-a" });
    const other = correctionSession({ id: "018f6c5b-4321-789a-bcde-ef012345678a", groupId: "group-a" });

    expect(
      rescheduleWarningKeys(
        session,
        "2026-12-01T10:00:00.000Z",
        "2026-12-01T11:00:00.000Z",
        [other],
        new Date("2026-11-23T12:00:00.000Z"),
      ),
    ).toEqual(["Sessions.rescheduleConflictWarning"]);
  });

  it("does not warn about cancelled sessions, other groups, or the session itself", () => {
    const session = correctionSession({ id: sessionId, groupId: "group-a" });
    const cancelled = correctionSession({
      id: "018f6c5b-4321-789a-bcde-ef012345678a",
      groupId: "group-a",
      status: "cancelled",
    });
    const otherGroup = correctionSession({
      id: "018f6c5b-4321-789a-bcde-ef012345678b",
      groupId: "group-b",
    });

    expect(
      rescheduleWarningKeys(
        session,
        "2026-12-01T10:00:00.000Z",
        "2026-12-01T11:00:00.000Z",
        [session, cancelled, otherGroup],
        new Date("2026-11-23T12:00:00.000Z"),
      ),
    ).toEqual([]);
  });

  it("requires a reason to reschedule a session", () => {
    const result = rescheduleSessionSchema.safeParse({
      id: sessionId,
      startsAt: "2026-12-01T10:00:00.000Z",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "reason")).toBe(true);
    }
  });

  it("requires a reason to cancel a session", () => {
    const result = cancelSessionSchema.safeParse({ id: sessionId });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "reason")).toBe(true);
    }
  });
});
