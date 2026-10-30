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
import { createFollowUp, getFollowUpDashboard } from "@/modules/followups/service";
import { createStudent } from "@/modules/students/service";
import { homeworkQuerySchema } from "@/modules/homework/schemas";
import { DELTA, NILE, ownerScope } from "./helpers";

const groupIds: string[] = [];
const studentIds: string[] = [];
const assessmentIds: string[] = [];
const homeworkIds: string[] = [];
const followUpIds: string[] = [];

afterAll(async () => {
  await disconnectDb();
});

afterEach(async () => {
  await withScope({ workspaceId: NILE }, async (tx) => {
    await tx.studentFollowUpEvent.deleteMany({
      where: { workspaceId: NILE, followUpId: { in: followUpIds } },
    });
    await tx.studentFollowUp.deleteMany({ where: { workspaceId: NILE, id: { in: followUpIds } } });
    await tx.assessmentScore.deleteMany({
      where: { workspaceId: NILE, assessmentId: { in: assessmentIds } },
    });
    await tx.assessment.deleteMany({ where: { workspaceId: NILE, id: { in: assessmentIds } } });
    await tx.homeworkResource.deleteMany({
      where: { workspaceId: NILE, homeworkId: { in: homeworkIds } },
    });
    await tx.homeworkSubmission.deleteMany({
      where: { workspaceId: NILE, homeworkId: { in: homeworkIds } },
    });
    await tx.homework.deleteMany({ where: { workspaceId: NILE, id: { in: homeworkIds } } });
    await tx.enrollment.deleteMany({ where: { workspaceId: NILE, groupId: { in: groupIds } } });
    await tx.group.deleteMany({ where: { workspaceId: NILE, id: { in: groupIds } } });
    await tx.student.deleteMany({ where: { workspaceId: NILE, id: { in: studentIds } } });
  });
  groupIds.length = 0;
  studentIds.length = 0;
  assessmentIds.length = 0;
  homeworkIds.length = 0;
  followUpIds.length = 0;
});

async function createFixture() {
  const scope = ownerScope();
  const group = await withScope(scope, (tx) =>
    tx.group.create({
      data: {
        workspaceId: NILE,
        name: `Academic ${randomUUID()}`,
        color: "indigo",
        weekday: 0,
        startTime: new Date("1970-01-01T16:00:00.000Z"),
        endTime: new Date("1970-01-01T17:00:00.000Z"),
        capacity: 20,
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

    const events = await withScope({ workspaceId: NILE }, (tx) =>
      tx.auditEvent.findMany({
        where: {
          workspaceId: NILE,
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
    const rows = await withScope({ workspaceId: NILE }, (tx) =>
      tx.homeworkSubmission.findMany({
        where: { workspaceId: NILE, homeworkId: homework.id, studentId: later.student.id },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("not_submitted");
  });
});
