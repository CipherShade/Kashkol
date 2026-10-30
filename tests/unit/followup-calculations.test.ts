import { describe, expect, it } from "vitest";
import { calculateFollowUpFlags, type AssessmentFact } from "@/modules/followups/calculations";

const student = { id: "s1", firstName: "A", lastName: "Student" };
const now = new Date("2026-10-29T10:00:00.000Z");

describe("transparent follow-up rules", () => {
  it("flags only consecutive absences within one group and exposes the sessions", () => {
    const flags = calculateFollowUpFlags(
      [student],
      [
        {
          studentId: "s1",
          groupId: "g1",
          groupName: "Group A",
          sessionId: "1",
          date: "2026-10-01",
          mark: "present",
        },
        {
          studentId: "s1",
          groupId: "g1",
          groupName: "Group A",
          sessionId: "2",
          date: "2026-10-08",
          mark: "absent",
        },
        {
          studentId: "s1",
          groupId: "g1",
          groupName: "Group A",
          sessionId: "3",
          date: "2026-10-15",
          mark: "absent",
        },
      ],
      [],
      [],
      now,
    );
    expect(flags[0].reasons[0].rule).toBe("repeated_absences");
    expect(flags[0].reasons[0].sources.map(({ id }) => id)).toEqual(["3", "2"]);
    expect(flags[0].reasons[0].details.threshold).toBe(2);
  });

  it("uses the configured consecutive-absence threshold", () => {
    const facts = [
      {
        studentId: "s1",
        groupId: "g1",
        groupName: "Group A",
        sessionId: "1",
        date: "2026-10-08",
        mark: "absent" as const,
      },
      {
        studentId: "s1",
        groupId: "g1",
        groupName: "Group A",
        sessionId: "2",
        date: "2026-10-15",
        mark: "absent" as const,
      },
    ];
    expect(calculateFollowUpFlags([student], facts, [], [], now, 3)).toEqual([]);
    expect(calculateFollowUpFlags([student], facts, [], [], now, 2)).toHaveLength(1);
  });

  it("flags overdue, not-submitted homework and ignores submitted or not-yet-due work", () => {
    const flags = calculateFollowUpFlags(
      [student],
      [],
      [
        {
          studentId: "s1",
          homeworkId: "late",
          title: "Late",
          dueAt: "2026-10-20T10:00:00Z",
          status: "not_submitted",
        },
        {
          studentId: "s1",
          homeworkId: "done",
          title: "Done",
          dueAt: "2026-10-20T10:00:00Z",
          status: "submitted",
        },
        {
          studentId: "s1",
          homeworkId: "future",
          title: "Future",
          dueAt: "2026-11-20T10:00:00Z",
          status: "not_submitted",
        },
      ],
      [],
      now,
    );
    expect(flags[0].reasons).toHaveLength(1);
    expect(flags[0].reasons[0].sources[0].id).toBe("late");
  });

  it("compares the latest three graded results with the prior three and excludes ungraded rows", () => {
    const assessments: AssessmentFact[] = [90, 90, 90, 80, 70, 60].map((score, index) => ({
      studentId: "s1",
      assessmentId: `a${index}`,
      title: `Exam ${index}`,
      date: `2026-0${index + 1}-01`,
      status: "graded",
      score,
      maxScore: 100,
    }));
    assessments.push({
      studentId: "s1",
      assessmentId: "missing",
      title: "Missing",
      date: "2026-07-01",
      status: "missing",
      score: null,
      maxScore: 100,
    });
    const flags = calculateFollowUpFlags([student], [], [], assessments, now);
    expect(flags[0].reasons[0].rule).toBe("declining_assessments");
    expect(flags[0].reasons[0].details).toEqual({
      previousAveragePercent: 90,
      recentAveragePercent: 70,
    });
  });

  it("does not fabricate flags when there are no source records", () => {
    expect(calculateFollowUpFlags([student], [], [], [], now)).toEqual([]);
  });
});
