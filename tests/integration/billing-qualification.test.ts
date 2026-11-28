import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import type { BillingConfigView } from "@/modules/billing/repository";
import { runBillingCycleForWorkspace } from "@/modules/billing/service";
import { countStudentLinkedRecords } from "@/modules/students/repository";
import { deleteStudent } from "@/modules/students/service";
import type { Scope } from "@/modules/tenancy/types";
import { createStudent, fixturesScope } from "./helpers";

const NOW = new Date("2026-11-25T10:00:00.000Z");

const CONFIG: BillingConfigView = {
  id: randomUUID(),
  version: 1,
  rateMinor: 99,
  thresholdMinor: 5000,
  currency: "EGP",
  timezone: "Africa/Cairo",
  instapayHandle: "test-instapay",
  instapayLink: "",
  qrStorageKey: null,
  isActive: true,
  effectiveAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterAll(async () => {
  await disconnectDb();
});

async function createWorkspace(activationMonth: string): Promise<{
  workspaceId: string;
  scope: Scope;
}> {
  const workspaceId = randomUUID();
  const key = workspaceId.slice(0, 8);
  await withScope({ workspaceId }, async (tx) => {
    await tx.workspace.create({
      data: {
        id: workspaceId,
        name: `Qualification ${key}`,
        slug: `qualification-${key}`,
        teachingName: `Qualification ${key}`,
        primarySubject: null,
        gradesTaught: [],
        status: "active",
        planTier: "pilot",
        planStatus: "pilot_active",
      },
    });
    await tx.workspaceSettings.create({
      data: {
        workspaceId,
        atRiskAfter: 2,
        inactiveAfter: 4,
        locale: "en",
        theme: "system",
        timezone: "Africa/Cairo",
        currency: "EGP",
      },
    });
    await tx.workspaceBillingState.create({
      data: {
        workspaceId,
        activationMonth,
        activatedAt: NOW,
        activatedBy: "test:billing",
        createdAt: NOW,
      },
    });
  });
  return { workspaceId, scope: { ...fixturesScope("Qualification"), workspaceId } };
}

async function recordMarks(
  workspaceId: string,
  scope: Scope,
  studentId: string,
  startsAt: readonly Date[],
): Promise<void> {
  await withScope({ workspaceId }, async (tx) => {
    const group = await tx.group.create({
      data: { workspaceId, name: `Qualification ${studentId.slice(0, 8)}`, color: "indigo" },
    });
    for (const [index, start] of startsAt.entries()) {
      const session = await tx.teachingSession.create({
        data: {
          workspaceId,
          groupId: group.id,
          startsAt: start,
          status: "completed",
        },
      });
      await tx.attendanceMark.create({
        data: {
          workspaceId,
          sessionId: session.id,
          studentId,
          mark: index === 0 ? "present" : "late",
          recordedBy: scope.actorUserId,
          createdAt: NOW,
        },
      });
    }
  });
}

async function snapshotCounts(workspaceId: string): Promise<Array<[string, number]>> {
  return withScope({ workspaceId }, async (tx) => {
    const rows = await tx.billingUsageSnapshot.findMany({
      where: { workspaceId },
      orderBy: [{ periodMonth: "asc" }],
      select: { periodMonth: true, qualifyingStudentCount: true },
    });
    return rows.map((row) => [row.periodMonth, row.qualifyingStudentCount]);
  });
}

async function usageCharges(workspaceId: string, studentId: string) {
  return withScope({ workspaceId }, (tx) =>
    tx.billingLedgerEntry.findMany({
      where: {
        workspaceId,
        studentId,
        entryType: "usage_charge",
      },
    }),
  );
}

describe("billing qualification against stored attendance (ADR-0051)", () => {
  it("qualifies across a Cairo month boundary when two sessions are within 30 days", async () => {
    const { workspaceId, scope } = await createWorkspace("2026-10");
    const studentId = await createStudent(workspaceId, "Boundary", "Student");
    await recordMarks(workspaceId, scope, studentId, [
      new Date("2026-10-25T10:00:00.000Z"),
      new Date("2026-11-20T10:00:00.000Z"),
    ]);

    const result = await runBillingCycleForWorkspace(workspaceId, NOW, "system:billing-worker", CONFIG);

    expect(result.monthsProcessed).toBe(2);
    expect(await snapshotCounts(workspaceId)).toEqual([["2026-10", 0], ["2026-11", 1]]);
    const charges = await usageCharges(workspaceId, studentId);
    expect(charges).toHaveLength(1);
    expect(charges[0]?.periodMonth).toBe("2026-11");
    expect(charges[0]?.amountMinor).toBe(99);
  });

  it("does not qualify when the qualifying sessions are more than 30 days apart", async () => {
    const { workspaceId, scope } = await createWorkspace("2026-10");
    const studentId = await createStudent(workspaceId, "TooFar", "Student");
    await recordMarks(workspaceId, scope, studentId, [
      new Date("2026-10-05T10:00:00.000Z"),
      new Date("2026-11-20T10:00:00.000Z"),
    ]);

    await runBillingCycleForWorkspace(workspaceId, NOW, "system:billing-worker", CONFIG);

    expect(await snapshotCounts(workspaceId)).toEqual([["2026-10", 0], ["2026-11", 0]]);
    expect(await usageCharges(workspaceId, studentId)).toEqual([]);
  });

  it("keeps earned qualification after the student is archived", async () => {
    const { workspaceId, scope } = await createWorkspace("2026-11");
    const studentId = await createStudent(workspaceId, "Archived", "Student");
    await recordMarks(workspaceId, scope, studentId, [
      new Date("2026-11-05T10:00:00.000Z"),
      new Date("2026-11-20T10:00:00.000Z"),
    ]);
    await withScope({ workspaceId }, (tx) =>
      tx.student.update({
        where: { id: studentId, workspaceId },
        data: { archivedAt: NOW },
      }),
    );

    await runBillingCycleForWorkspace(workspaceId, NOW, "system:billing-worker", CONFIG);

    expect(await snapshotCounts(workspaceId)).toEqual([["2026-11", 1]]);
    const charges = await usageCharges(workspaceId, studentId);
    expect(charges).toHaveLength(1);
    expect(charges[0]?.amountMinor).toBe(99);
    expect((await countStudentLinkedRecords(scope, studentId)).attendanceCount).toBe(2);
    await expect(deleteStudent(scope, studentId)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
