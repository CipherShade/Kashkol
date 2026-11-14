export type FollowUpFlagSource = {
  id: string;
  type: "session" | "homework" | "assessment";
  label: string;
  date: string;
};

export type FollowUpFlagReason = {
  rule: "repeated_absences" | "overdue_homework" | "declining_assessments";
  sources: FollowUpFlagSource[];
  details: Record<string, number | string>;
};

export type FlagStudent = { id: string; firstName: string; lastName: string };
export type AttendanceFact = {
  studentId: string;
  groupId: string | null;
  groupName: string;
  sessionId: string;
  date: string;
  mark: "present" | "absent" | "late" | "excused";
};
export type HomeworkFact = {
  studentId: string;
  homeworkId: string;
  title: string;
  dueAt: string;
  status: "not_submitted" | "submitted" | "late" | "excused";
};
export type AssessmentFact = {
  studentId: string;
  assessmentId: string;
  title: string;
  date: string;
  status: "graded" | "missing" | "excused" | "not_taken";
  score: number | null;
  maxScore: number;
};

export function calculateFollowUpFlags(
  students: readonly FlagStudent[],
  attendance: readonly AttendanceFact[],
  homework: readonly HomeworkFact[],
  assessments: readonly AssessmentFact[],
  now: Date,
  consecutiveAbsenceThreshold = 2,
) {
  if (!Number.isInteger(consecutiveAbsenceThreshold) || consecutiveAbsenceThreshold < 1) {
    throw new RangeError("The consecutive-absence threshold must be a positive integer.");
  }
  const flags = new Map<string, FollowUpFlagReason[]>();
  const add = (studentId: string, reason: FollowUpFlagReason) => {
    const list = flags.get(studentId) ?? [];
    list.push(reason);
    flags.set(studentId, list);
  };

  const attendanceByStudentAndGroup = new Map<string, AttendanceFact[]>();
  for (const fact of attendance) {
    if (new Date(fact.date).getTime() > now.getTime()) continue;
    const key = `${fact.studentId}:${fact.groupId}`;
    const list = attendanceByStudentAndGroup.get(key) ?? [];
    list.push(fact);
    attendanceByStudentAndGroup.set(key, list);
  }
  for (const facts of attendanceByStudentAndGroup.values()) {
    const ordered = facts.slice().sort((left, right) => right.date.localeCompare(left.date));
    const absences: AttendanceFact[] = [];
    for (const fact of ordered) {
      if (fact.mark !== "absent") break;
      absences.push(fact);
    }
    if (absences.length >= consecutiveAbsenceThreshold) {
      const recent = absences.slice(0, consecutiveAbsenceThreshold);
      add(recent[0].studentId, {
        rule: "repeated_absences",
        sources: recent.map((fact) => ({
          id: fact.sessionId,
          type: "session",
          label: fact.groupName,
          date: fact.date,
        })),
        details: {
          consecutiveAbsences: absences.length,
          threshold: consecutiveAbsenceThreshold,
          group: recent[0].groupName,
        },
      });
    }
  }

  for (const fact of homework) {
    if (fact.status !== "not_submitted" || new Date(fact.dueAt).getTime() >= now.getTime())
      continue;
    add(fact.studentId, {
      rule: "overdue_homework",
      sources: [{ id: fact.homeworkId, type: "homework", label: fact.title, date: fact.dueAt }],
      details: { dueAt: fact.dueAt },
    });
  }

  const assessmentsByStudent = new Map<string, AssessmentFact[]>();
  for (const fact of assessments) {
    if (
      fact.status !== "graded" ||
      fact.score === null ||
      fact.maxScore <= 0 ||
      fact.date > now.toISOString().slice(0, 10)
    )
      continue;
    const list = assessmentsByStudent.get(fact.studentId) ?? [];
    list.push(fact);
    assessmentsByStudent.set(fact.studentId, list);
  }
  for (const [studentId, facts] of assessmentsByStudent) {
    const ordered = facts.slice().sort((left, right) => left.date.localeCompare(right.date));
    if (ordered.length < 6) continue;
    const previous = ordered.slice(-6, -3);
    const recent = ordered.slice(-3);
    const priorAverage = meanPercentage(previous);
    const recentAverage = meanPercentage(recent);
    if (recentAverage >= priorAverage) continue;
    add(studentId, {
      rule: "declining_assessments",
      sources: [...previous, ...recent].map((fact) => ({
        id: fact.assessmentId,
        type: "assessment",
        label: fact.title,
        date: fact.date,
      })),
      details: {
        previousAveragePercent: round(priorAverage),
        recentAveragePercent: round(recentAverage),
      },
    });
  }

  return students.flatMap((student) => {
    const reasons = flags.get(student.id) ?? [];
    return reasons.length > 0 ? [{ student, reasons }] : [];
  });
}

function meanPercentage(facts: readonly AssessmentFact[]) {
  return (
    facts.reduce((total, fact) => total + ((fact.score ?? 0) / fact.maxScore) * 100, 0) /
    facts.length
  );
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
