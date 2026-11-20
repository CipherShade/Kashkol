import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { resetServerEnvForTests } from "@/lib/config/env";
import { disconnectDb, getDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { findActivePortalGrants } from "@/modules/identity/repository";
import { resolvePortalStudent, type PortalContext } from "@/modules/identity/session";
import { createAssessment, setAssessmentResult } from "@/modules/assessments/service";
import { enrollStudentInGroup } from "@/modules/groups/service";
import type { ParentReportLabels } from "@/modules/performance/parent-report";
import {
  acknowledgeRisk,
  exportParentPerformanceReport,
  getClassIntelligence,
  getParentPerformanceReport,
  getPerformanceOverview,
  getPerformanceSettings,
  getStudentPerformance,
  saveBulkGrades,
  saveReportNote,
  saveTopicResults,
  updatePerformanceSettings,
} from "@/modules/performance/service";
import { bulkGradesSchema } from "@/modules/performance/schemas";
import { permissionKey, type Permission, type Scope } from "@/modules/tenancy/types";
import {
  createStudent,
  createTestUser,
  deleteTestUser,
  fixtureAssistantScope,
  fixturesScope,
  FIXTURE_OWNER,
  FIXTURES,
  DELTA,
} from "./helpers";

afterAll(async () => {
  await disconnectDb();
});

const labels = new Proxy({}, { get: (_target, key) => String(key) }) as ParentReportLabels;

async function createGroup(scope: Scope) {
  return withScope(scope, (tx) =>
    tx.group.create({
      data: {
        workspaceId: scope.workspaceId,
        name: `Performance ${randomUUID()}`,
        color: "indigo",
      },
      select: { id: true, name: true },
    }),
  );
}

async function createStudentInGroup(scope: Scope, groupId: string, name: string) {
  const studentId = await createStudent(scope.workspaceId, name, randomUUID());
  await enrollStudentInGroup(scope, { groupId, studentId });
  return studentId;
}

async function addPaper(
  scope: Scope,
  groupId: string,
  studentId: string,
  title: string,
  date: string,
  score: number,
  status: "graded" | "missing" = "graded",
) {
  const assessment = await createAssessment(scope, {
    groupId,
    title,
    type: "paper_exam",
    date,
    maxScore: 100,
    note: null,
    extraCreditAllowance: null,
  });
  await setAssessmentResult(scope, assessment.id, studentId, {
    status,
    score: status === "graded" ? score : null,
    note: null,
  });
  return assessment.id;
}

async function portalFor(userId: string): Promise<PortalContext> {
  const grants = await findActivePortalGrants(userId, new Date());
  return {
    userId,
    grants,
    workspaceIds: [...new Set(grants.map((grant) => grant.workspaceId))],
    studentIds: new Set(grants.map((grant) => grant.studentId)),
  };
}

describe("computed performance data from real records", () => {
  it("keeps insufficient data distinct from poor performance", async () => {
    const scope = fixturesScope();
    const group = await createGroup(scope);
    const studentId = await createStudentInGroup(scope, group.id, "Insufficient");

    await addPaper(scope, group.id, studentId, "Only paper", "2026-01-01", 5);
    const before = await getStudentPerformance(scope, studentId, {});
    expect(before.summary.gradedCount).toBe(1);
    expect(before.summary.averagePercent).toBe(5);
    expect(before.summary.insufficientData).toBe(true);
    expect(before.dataState).toBe("insufficient_data");
    expect(before.trend.classification).toBe("insufficient_data");
    expect(before.risks.some((risk) => risk.ruleKey === "low_average")).toBe(false);

    await addPaper(scope, group.id, studentId, "Second paper", "2026-02-01", 10);
    await addPaper(scope, group.id, studentId, "Third paper", "2026-03-01", 15);
    const after = await getStudentPerformance(scope, studentId, {});
    expect(after.summary.gradedCount).toBe(3);
    expect(after.summary.averagePercent).toBe(10);
    expect(after.summary.insufficientData).toBe(false);
    expect(after.dataState).toBe("ready");
    expect(after.risks.some((risk) => risk.ruleKey === "low_average")).toBe(true);
  });

  it("never counts missing, excused, or not-taken results as zero", async () => {
    const scope = fixturesScope();
    const group = await createGroup(scope);
    const studentId = await createStudentInGroup(scope, group.id, "Absence");
    await addPaper(scope, group.id, studentId, "Done", "2026-01-01", 80);
    await addPaper(scope, group.id, studentId, "Missing", "2026-02-01", 0, "missing");
    await addPaper(scope, group.id, studentId, "Excused", "2026-03-01", 0, "graded");

    const profile = await getStudentPerformance(scope, studentId, {});
    expect(profile.summary.completedCount).toBe(2);
    expect(profile.summary.missedCount).toBe(1);
    expect(profile.summary.averagePercent).toBe(40);
    expect(profile.history.find((row) => row.title === "Missing")).toMatchObject({
      score: null,
      percent: null,
      status: "missing",
    });
  });

  it("aggregates only real question or explicitly recorded topic counts", async () => {
    const scope = fixturesScope();
    const group = await createGroup(scope);
    const studentId = await createStudentInGroup(scope, group.id, "Topics");
    const assessmentId = await addPaper(scope, group.id, studentId, "Topic paper", "2026-01-01", 70);

    await expect(
      saveTopicResults(scope, studentId, {
        assessmentId,
        topics: [{ topic: "Fractions", correctCount: 1, incorrectCount: 4 }],
      }),
    ).resolves.toEqual({ saved: 1 });

    const profile = await getStudentPerformance(scope, studentId, {});
    expect(profile.topics).toMatchObject([
      {
        topic: "Fractions",
        observedCount: 5,
        incorrectCount: 4,
        incorrectRatePercent: 80,
        manualObservationCount: 5,
      },
    ]);
    expect(profile.risks.some((risk) => risk.ruleKey === "weak_topic")).toBe(true);

    const rows = await withScope(scope, (tx) =>
      tx.assessmentTopicResult.findMany({ where: { workspaceId: FIXTURES, studentId } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.correctCount).toBe(1);
  });

  it("compares only students with the same graded assessment set", async () => {
    const scope = fixturesScope();
    const group = await createGroup(scope);
    const first = await createStudentInGroup(scope, group.id, "CohortA");
    const second = await createStudentInGroup(scope, group.id, "CohortB");
    const dates = ["2026-01-01", "2026-02-01", "2026-03-01"];
    for (const [index, date] of dates.entries()) {
      const assessment = await createAssessment(scope, {
        groupId: group.id,
        title: `Shared ${index}`,
        type: "paper_exam",
        date,
        maxScore: 100,
        note: null,
        extraCreditAllowance: null,
      });
      await setAssessmentResult(scope, assessment.id, first, {
        status: "graded",
        score: 40 + index * 20,
        note: null,
      });
      await setAssessmentResult(scope, assessment.id, second, {
        status: "graded",
        score: 50 + index * 10,
        note: null,
      });
    }

    const intelligence = await getClassIntelligence(scope, { groupId: group.id });
    expect(intelligence.comparable).toBe(true);
    expect(intelligence.comparableStudentCount).toBe(2);
    expect(intelligence.students.map((student) => student.studentId).sort()).toEqual(
      [first, second].sort(),
    );
    expect(intelligence.weakestAssessments).toHaveLength(3);
  });
});

describe("teacher actions on computed risks", () => {
  it("persists acknowledgement, note, and follow-up against one evidence snapshot", async () => {
    const scope = fixturesScope();
    const group = await createGroup(scope);
    const studentId = await createStudentInGroup(scope, group.id, "RiskAction");
    await addPaper(scope, group.id, studentId, "Low one", "2026-01-01", 10);
    await addPaper(scope, group.id, studentId, "Low two", "2026-02-01", 20);
    await addPaper(scope, group.id, studentId, "Low three", "2026-03-01", 30);

    const profile = await getStudentPerformance(scope, studentId, {});
    const risk = profile.risks.find((candidate) => candidate.ruleKey === "low_average");
    expect(risk).toBeDefined();
    if (!risk) return;

    const saved = await acknowledgeRisk(
      scope,
      {
        studentId,
        ruleKey: risk.ruleKey,
        riskKey: risk.riskKey,
        title: "Review recent papers",
        note: "Private teacher note",
        createFollowUp: true,
        dueAt: null,
      },
      { requestId: randomUUID() },
    );
    expect(saved.followUpId).toBeTruthy();

    const after = await getStudentPerformance(scope, studentId, {});
    expect(after.risks.find((candidate) => candidate.riskKey === risk.riskKey)?.state).toMatchObject({
      status: "acknowledged",
      note: "Private teacher note",
      followUpId: saved.followUpId,
    });

    await expect(
      acknowledgeRisk(scope, {
        studentId,
        ruleKey: risk.ruleKey,
        riskKey: "a".repeat(64),
        title: "Stale",
        createFollowUp: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("bulk grade entry", () => {
  it("saves partial results and preserves scores that were not submitted", async () => {
    const scope = fixturesScope();
    const group = await createGroup(scope);
    const first = await createStudentInGroup(scope, group.id, "BulkA");
    const second = await createStudentInGroup(scope, group.id, "BulkB");
    const title = `Bulk ${randomUUID()}`;
    const date = "2026-11-18";
    const base = { groupId: group.id, title, type: "paper_exam" as const, date, maxScore: 100 };

    const initial = await saveBulkGrades(scope, {
      ...base,
      scores: [
        { studentId: first, status: "graded", score: 80 },
        { studentId: second, status: "graded", score: 90 },
      ],
    });
    expect(initial.createdAssessment).toBe(true);
    expect(initial.results.map((row) => row.outcome)).toEqual(["saved", "saved"]);

    const update = await saveBulkGrades(scope, {
      ...base,
      assessmentId: initial.assessmentId ?? undefined,
      scores: [{ studentId: first, status: "graded", score: 85 }],
    });
    expect(update.createdAssessment).toBe(false);
    expect(update.results).toEqual([{ studentId: first, outcome: "updated" }]);

    const assessmentId = initial.assessmentId;
    if (!assessmentId) throw new Error("bulk grade entry did not return an assessment id");
    const rows = await withScope(scope, (tx) =>
      tx.assessmentScore.findMany({
        where: { workspaceId: FIXTURES, assessmentId },
        select: { studentId: true, score: true },
      }),
    );
    expect(rows.find((row) => row.studentId === first)?.score?.toString()).toBe("85");
    expect(rows.find((row) => row.studentId === second)?.score?.toString()).toBe("90");

    const unenrolled = randomUUID();
    const skipped = await saveBulkGrades(scope, {
      ...base,
      assessmentId: initial.assessmentId ?? undefined,
      scores: [{ studentId: unenrolled, status: "graded", score: 10 }],
    });
    expect(skipped.results).toEqual([
      { studentId: unenrolled, outcome: "skipped", reasonKey: "Performance.bulkErrors.notEnrolled" },
    ]);

    const duplicate = bulkGradesSchema.safeParse({
      ...base,
      scores: [
        { studentId: first, status: "graded", score: 70 },
        { studentId: first, status: "graded", score: 75 },
      ],
    });
    expect(duplicate.success).toBe(false);

    await expect(
      saveBulkGrades(scope, {
        ...base,
        scores: [{ studentId: first, status: "graded", score: 60 }],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("authorization and tenant isolation", () => {
  it("requires each capability before running a performance query", async () => {
    const scope = fixturesScope();
    const group = await createGroup(scope);
    const studentId = await createStudentInGroup(scope, group.id, "Permissions");
    const assistant = await fixtureAssistantScope();
    const noGrades: Scope = {
      ...scope,
      role: "assistant",
      actorUserId: assistant.actorUserId,
      permissions: new Set<Permission>([permissionKey("students", "read")]),
    };

    await expect(getPerformanceOverview(noGrades, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(getStudentPerformance(noGrades, studentId, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(updatePerformanceSettings(assistant, {
      enabled: false,
      minAssessments: 2,
      averageBelowPercent: 50,
      consecutiveDeclines: 2,
      weakTopicPercent: 50,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cannot read or write another workspace through a performance service", async () => {
    const scope = fixturesScope();
    const group = await createGroup(scope);
    const studentId = await createStudentInGroup(scope, group.id, "Isolated");
    await addPaper(scope, group.id, studentId, "Private paper", "2026-01-01", 70);
    const foreignScope: Scope = { ...scope, workspaceId: DELTA };

    await expect(getStudentPerformance(foreignScope, studentId, {})).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      getClassIntelligence(foreignScope, { groupId: group.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      saveBulkGrades(foreignScope, {
        groupId: group.id,
        title: "Cross tenant",
        type: "paper_exam",
        date: "2026-11-19",
        maxScore: 100,
        scores: [{ studentId, status: "graded", score: 10 }],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      saveReportNote(foreignScope, { studentId, body: "Cross tenant note" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const counts = await withScope({ workspaceId: DELTA }, async (tx) => ({
      topic: await tx.assessmentTopicResult.count(),
      risk: await tx.performanceRiskState.count(),
      note: await tx.performanceReportNote.count(),
    }));
    expect(counts).toEqual({ topic: 0, risk: 0, note: 0 });
  });
});

describe("parent performance report", () => {
  it("exposes only the linked child's published grades and shareable notes", async () => {
    const scope = fixturesScope();
    const group = await createGroup(scope);
    const child = await createStudentInGroup(scope, group.id, "ParentChild");
    const other = await createStudentInGroup(scope, group.id, "OtherChild");
    const paper = await addPaper(scope, group.id, child, "Published paper", "2026-01-01", 70);
    await saveTopicResults(scope, child, {
      assessmentId: paper,
      topics: [{ topic: "Fractions", correctCount: 1, incorrectCount: 4 }],
    });
    await saveReportNote(scope, { studentId: child, body: "Shareable note only" });
    await withScope(scope, async (tx) => {
      await tx.assessment.update({ where: { id: paper }, data: { lockedAt: new Date() } });
      await tx.studentNote.create({
        data: {
          workspaceId: FIXTURES,
          studentId: child,
          body: "PRIVATE-NOTE-MUST-NOT-APPEAR",
          authorId: FIXTURE_OWNER,
        },
      });
    });
    await addPaper(scope, group.id, child, "Unpublished paper", "2026-02-01", 90);

    const parent = await createTestUser("performance-parent");
    const hiddenParent = await createTestUser("performance-hidden-parent");
    try {
      await withScope(scope, async (tx) => {
        await tx.portalGrant.create({
          data: {
            id: randomUUID(),
            workspaceId: FIXTURES,
            portalUserId: parent.id,
            studentId: child,
            kind: "parent",
            issuedBy: FIXTURE_OWNER,
            permissions: { showGrades: true },
          },
        });
        await tx.portalGrant.create({
          data: {
            id: randomUUID(),
            workspaceId: FIXTURES,
            portalUserId: hiddenParent.id,
            studentId: child,
            kind: "parent",
            issuedBy: FIXTURE_OWNER,
            permissions: { showGrades: false },
          },
        });
      });

      const portal = await portalFor(parent.id);
      const report = await getParentPerformanceReport(portal, child, {}, new Date("2026-11-19T10:00:00.000Z"));
      expect(report.student.id).toBe(child);
      expect(report.history).toHaveLength(1);
      expect(report.history[0]?.title).toBe("Published paper");
      expect(report.topics[0]?.topic).toBe("Fractions");
      expect(report.notes.map((note) => note.body)).toEqual(["Shareable note only"]);
      expect(JSON.stringify(report)).not.toContain("PRIVATE-NOTE-MUST-NOT-APPEAR");

      await expect(resolvePortalStudent(portal, child, "parent")).resolves.toMatchObject({
        student: { id: child },
      });
      await expect(getParentPerformanceReport(portal, other, {})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(getParentPerformanceReport(portal, randomUUID(), {})).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      const hidden = await portalFor(hiddenParent.id);
      await expect(getParentPerformanceReport(hidden, child, {})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      const csv = await exportParentPerformanceReport(portal, child, { format: "csv", locale: "en" }, labels);
      expect(csv.contentType).toContain("text/csv");
      expect(csv.content.toString("utf8")).toContain("Shareable note only");
      expect(csv.content.toString("utf8")).not.toContain("PRIVATE-NOTE-MUST-NOT-APPEAR");

      const xlsx = await exportParentPerformanceReport(portal, child, { format: "xlsx", locale: "ar" }, labels);
      expect(xlsx.content.subarray(0, 2).toString()).toBe("PK");

      const originalDriver = process.env.PDF_RENDERER_DRIVER;
      process.env.PDF_RENDERER_DRIVER = "none";
      resetServerEnvForTests();
      try {
        await expect(
          exportParentPerformanceReport(portal, child, { format: "pdf", locale: "ar" }, labels),
        ).rejects.toMatchObject({ code: "CONFLICT", messageKey: "errors.pdfRendererNotConfigured" });
      } finally {
        if (originalDriver === undefined) delete process.env.PDF_RENDERER_DRIVER;
        else process.env.PDF_RENDERER_DRIVER = originalDriver;
        resetServerEnvForTests();
      }
    } finally {
      await withScope(scope, (tx) =>
        tx.portalGrant.deleteMany({
          where: { workspaceId: FIXTURES, portalUserId: { in: [parent.id, hiddenParent.id] } },
        }),
      );
      await deleteTestUser(parent);
      await deleteTestUser(hiddenParent);
    }
  });
});

describe("performance settings", () => {
  it("stores deterministic thresholds in the workspace settings row", async () => {
    const scope = fixturesScope();
    const before = await getPerformanceSettings(scope);
    const updated = await updatePerformanceSettings(
      scope,
      {
        enabled: true,
        minAssessments: 4,
        averageBelowPercent: 55,
        consecutiveDeclines: 3,
        weakTopicPercent: 65,
      },
      { requestId: randomUUID() },
    );
    expect(updated).toEqual({
      enabled: true,
      minAssessments: 4,
      averageBelowPercent: 55,
      consecutiveDeclines: 3,
      weakTopicPercent: 65,
    });

    await updatePerformanceSettings(scope, before, { requestId: randomUUID() });
    const audit = await withScope(scope, (tx) =>
      tx.auditEvent.findFirst({
        where: { workspaceId: FIXTURES, action: "performance.settings_updated" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(audit).not.toBeNull();
  });
});

describe("database substrate", () => {
  it("connects the performance tables to the shared database client", async () => {
    const db = getDb();
    await expect(db.assessmentTopicResult.count()).resolves.toBe(0);
    await expect(db.performanceRiskState.count()).resolves.toBe(0);
    await expect(db.performanceReportNote.count()).resolves.toBe(0);
  });
});
