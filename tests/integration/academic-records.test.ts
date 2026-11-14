import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/http/errors";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import {
  createAssessment,
  listAssessments,
  setAssessmentResult,
} from "@/modules/assessments/service";
import { assessmentQuerySchema } from "@/modules/assessments/schemas";
import { enrollStudentInGroup } from "@/modules/groups/service";
import { createHomework, listHomework } from "@/modules/homework/service";
import { createFollowUp, getFollowUpDashboard, resolveFollowUp } from "@/modules/followups/service";
import { createStudent } from "@/modules/students/service";
import { homeworkQuerySchema } from "@/modules/homework/schemas";
import { DELTA, FIXTURES, fixturesScope } from "./helpers";

const groupIds: string[] = [];
const studentIds: string[] = [];
const assessmentIds: string[] = [];
const homeworkIds: string[] = [];
const followUpIds: string[] = [];

afterAll(async () => {
  await disconnectDb();
});

afterEach(async () => {
  await withScope({ workspaceId: FIXTURES }, async (tx) => {
    await tx.studentFollowUpEvent.deleteMany({
      where: { workspaceId: FIXTURES, followUpId: { in: followUpIds } },
    });
    await tx.studentFollowUp.deleteMany({ where: { workspaceId: FIXTURES, id: { in: followUpIds } } });
    await tx.assessmentScore.deleteMany({
      where: { workspaceId: FIXTURES, assessmentId: { in: assessmentIds } },
    });
    await tx.assessment.deleteMany({ where: { workspaceId: FIXTURES, id: { in: assessmentIds } } });
    await tx.homeworkResource.deleteMany({
      where: { workspaceId: FIXTURES, homeworkId: { in: homeworkIds } },
    });
    await tx.homeworkSubmission.deleteMany({
      where: { workspaceId: FIXTURES, homeworkId: { in: homeworkIds } },
    });
    await tx.homework.deleteMany({ where: { workspaceId: FIXTURES, id: { in: homeworkIds } } });
    await tx.enrollment.deleteMany({ where: { workspaceId: FIXTURES, groupId: { in: groupIds } } });
    await tx.groupScheduleSlot.deleteMany({
      where: { workspaceId: FIXTURES, groupId: { in: groupIds } },
    });
    await tx.group.deleteMany({ where: { workspaceId: FIXTURES, id: { in: groupIds } } });
    await tx.student.deleteMany({ where: { workspaceId: FIXTURES, id: { in: studentIds } } });
  });
  groupIds.length = 0;
  studentIds.length = 0;
  assessmentIds.length = 0;
  homeworkIds.length = 0;
  followUpIds.length = 0;
});

async function createFixture() {
  const scope = fixturesScope();
  const group = await withScope(scope, (tx) =>
    tx.group.create({
      data: {
        workspaceId: FIXTURES,
        name: `Academic ${randomUUID()}`,
        color: "indigo",
        scheduleSlots: {
          create: {
            weekday: 0,
            startTime: new Date("1970-01-01T16:00:00.000Z"),
            endTime: new Date("1970-01-01T17:00:00.000Z"),
            capacity: 20,
          },
        },
      },
    }),
  );
  groupIds.push(group.id);
  const createdStudent = await createStudent(scope, {
    firstName: "Academic",
    lastName: randomUUID(),
    grade: null,
    phone: null,
    parentName: null,
    parentPhone: null,
    groupIds: [],
    note: null,
    confirmDuplicate: false,
  });
  if (createdStudent.duplicateWarning) throw new Error("unexpected duplicate student");
  studentIds.push(createdStudent.student.id);
  await enrollStudentInGroup(scope, { groupId: group.id, studentId: createdStudent.student.id });
  return { scope, group, student: createdStudent.student };
}

describe("tenant-scoped homework and assessment records", () => {
  it("audits a grade correction transactionally and isolates homework to its workspace", async () => {
    const { scope, group, student } = await createFixture();
    const auditRunId = randomUUID();
    const assessment = await createAssessment(scope, {
      groupId: group.id,
      title: "Paper",
      type: "paper_exam",
      date: "2026-10-29",
      maxScore: 100,
      note: null,
      extraCreditAllowance: null,
    });
    assessmentIds.push(assessment.id);

    await setAssessmentResult(
      scope,
      assessment.id,
      student.id,
      {
        status: "graded",
        score: 80,
        note: null,
      },
      { requestId: `${auditRunId}-initial` },
    );
    await setAssessmentResult(
      scope,
      assessment.id,
      student.id,
      {
        status: "graded",
        score: 80,
        note: null,
      },
      { requestId: `${auditRunId}-idempotent` },
    );
    await setAssessmentResult(
      scope,
      assessment.id,
      student.id,
      {
        status: "graded",
        score: 72,
        note: null,
      },
      { requestId: `${auditRunId}-correction` },
    );
    await expect(
      setAssessmentResult(
        scope,
        assessment.id,
        student.id,
        { status: "graded", score: 101, note: null },
        { requestId: `${auditRunId}-over-limit` },
      ),
    ).rejects.toBeInstanceOf(AppError);

    const extraCreditAssessment = await createAssessment(scope, {
      groupId: group.id,
      title: "Extra credit",
      type: "quiz",
      date: "2026-10-29",
      maxScore: 100,
      note: null,
      extraCreditAllowance: 5,
    });
    assessmentIds.push(extraCreditAssessment.id);
    await setAssessmentResult(scope, extraCreditAssessment.id, student.id, {
      status: "graded",
      score: 105,
      note: null,
    });
    await expect(
      setAssessmentResult(scope, extraCreditAssessment.id, student.id, {
        status: "graded",
        score: 106,
        note: null,
      }),
    ).rejects.toBeInstanceOf(AppError);

    const events = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.auditEvent.findMany({
        where: {
          workspaceId: FIXTURES,
          entityType: "assessment_score",
          action: { in: ["assessment.score_set", "assessment.score_changed"] },
          requestId: {
            in: [`${auditRunId}-initial`, `${auditRunId}-idempotent`, `${auditRunId}-correction`],
          },
        },
        select: { action: true, requestId: true, diff: true },
      }),
    );
    expect(events).toHaveLength(2);
    expect(events.map(({ action }) => action).sort()).toEqual([
      "assessment.score_changed",
      "assessment.score_set",
    ]);
    const foreignAssessments = await listAssessments(
      { ...scope, workspaceId: DELTA },
      assessmentQuerySchema.parse({}),
    );
    expect(foreignAssessments.assessments).toEqual([]);

    const homework = await createHomework(scope, {
      groupId: group.id,
      studentIds: undefined,
      title: "Worksheet",
      instructions: null,
      dueAt: "2026-10-30T12:00:00.000Z",
      resourceFileIds: [],
      maxScore: null,
    });
    homeworkIds.push(homework.id);
    const foreign = await listHomework(
      { ...scope, workspaceId: DELTA },
      homeworkQuerySchema.parse({}),
    );
    expect(foreign).toEqual([]);
    const local = await listHomework(scope, homeworkQuerySchema.parse({}));
    expect(local.some(({ id }) => id === homework.id)).toBe(true);

    const followUp = await createFollowUp(scope, {
      studentId: student.id,
      title: "Contact family",
      note: "Private follow-up note",
      dueAt: "2026-11-01T12:00:00.000Z",
    });
    followUpIds.push(followUp.id);
    const foreignDashboard = await getFollowUpDashboard({ ...scope, workspaceId: DELTA });
    expect(foreignDashboard.followUps).toEqual([]);
  });

  it("audits the first resolution, stays idempotent on identical retry, and audits outcome corrections", async () => {
    const { scope, student } = await createFixture();
    const auditRunId = randomUUID();
    const followUp = await createFollowUp(scope, {
      studentId: student.id,
      title: "Call family",
      note: null,
      dueAt: null,
    });
    followUpIds.push(followUp.id);

    await resolveFollowUp(
      scope,
      followUp.id,
      { outcome: "contacted" },
      { requestId: `${auditRunId}-first` },
    );
    await resolveFollowUp(
      scope,
      followUp.id,
      { outcome: "contacted" },
      { requestId: `${auditRunId}-identical-retry` },
    );
    await resolveFollowUp(
      scope,
      followUp.id,
      { outcome: "no_action" },
      { requestId: `${auditRunId}-correction` },
    );

    const auditEvents = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.auditEvent.findMany({
        where: {
          workspaceId: FIXTURES,
          entityType: "student_follow_up",
          entityId: followUp.id,
          requestId: {
            in: [
              `${auditRunId}-first`,
              `${auditRunId}-identical-retry`,
              `${auditRunId}-correction`,
            ],
          },
        },
        select: { action: true, requestId: true, diff: true },
      }),
    );
    // The identical retry must write nothing; first resolution and the correction are recorded.
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents.map(({ requestId }) => requestId).sort()).toEqual(
      [`${auditRunId}-correction`, `${auditRunId}-first`].sort(),
    );
    const first = auditEvents.find(({ requestId }) => requestId === `${auditRunId}-first`);
    const correction = auditEvents.find(({ requestId }) => requestId === `${auditRunId}-correction`);
    expect(first?.action).toBe("student_follow_up.resolved");
    expect(first?.diff).toEqual({ outcome: "contacted" });
    expect(correction?.action).toBe("student_follow_up.outcome_corrected");
    expect(correction?.diff).toEqual({
      previousOutcome: "contacted",
      outcome: "no_action",
    });

    // The task history preserves the same sequence with distinct actions.
    const taskEvents = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.studentFollowUpEvent.findMany({
        where: { workspaceId: FIXTURES, followUpId: followUp.id },
        orderBy: { createdAt: "asc" },
        select: { action: true, outcome: true },
      }),
    );
    expect(taskEvents).toEqual([
      { action: "created", outcome: null },
      { action: "resolved", outcome: "contacted" },
      { action: "outcome_corrected", outcome: "no_action" },
    ]);

    // A same-outcome resolve issued twice in a row leaves the sequence unchanged.
    const beforeEvents = taskEvents.length;
    await resolveFollowUp(
      scope,
      followUp.id,
      { outcome: "no_action" },
      { requestId: `${auditRunId}-identical-correction-retry` },
    );
    const afterEvents = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.studentFollowUpEvent.count({
        where: { workspaceId: FIXTURES, followUpId: followUp.id },
      }),
    );
    expect(afterEvents).toBe(beforeEvents);
  });

  it("creates an individual homework record when a student joins an assigned group later", async () => {
    const { scope, group } = await createFixture();
    const homework = await createHomework(scope, {
      groupId: group.id,
      studentIds: undefined,
      title: "Later enrollee",
      instructions: null,
      dueAt: "2026-10-30T12:00:00.000Z",
      resourceFileIds: [],
      maxScore: null,
    });
    homeworkIds.push(homework.id);
    const later = await createStudent(scope, {
      firstName: "Later",
      lastName: randomUUID(),
      grade: null,
      phone: null,
      parentName: null,
      parentPhone: null,
      groupIds: [],
      note: null,
      confirmDuplicate: false,
    });
    if (later.duplicateWarning) throw new Error("unexpected duplicate student");
    studentIds.push(later.student.id);
    await enrollStudentInGroup(scope, { groupId: group.id, studentId: later.student.id });
    const rows = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.homeworkSubmission.findMany({
        where: { workspaceId: FIXTURES, homeworkId: homework.id, studentId: later.student.id },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("not_submitted");
  });
});
