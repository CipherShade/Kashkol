import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { getStudentProgress } from "@/modules/performance/service";
import type { Permission, Scope } from "@/modules/tenancy/types";
import {
  FIXTURES,
  FIXTURE_ASSISTANT,
  createStudent,
  fixturesScope,
} from "./helpers";

afterAll(async () => {
  await disconnectDb();
});

function limitedScope(permissions: Permission[]): Scope {
  return {
    workspaceId: FIXTURES,
    actorUserId: FIXTURE_ASSISTANT,
    actorDisplayName: "Progress Assistant",
    role: "assistant",
    permissions: new Set(permissions),
  };
}

describe("F-P2-06 computed progress against PostgreSQL RLS", () => {
  it("computes three real series, filters denied sources, and isolates tenants", async () => {
    const scope = fixturesScope("Progress Integration");
    const suffix = randomUUID().slice(0, 8);
    const group = await withScope(scope, (tx) =>
      tx.group.create({
        data: { workspaceId: FIXTURES, name: `Progress ${suffix}`, color: "indigo" },
      }),
    );
    const studentId = await createStudent(FIXTURES, "Progress", suffix);
    const dates = [
      new Date("2026-08-10T10:00:00.000Z"),
      new Date("2026-09-10T10:00:00.000Z"),
      new Date("2026-10-10T10:00:00.000Z"),
    ];

    await withScope(scope, async (tx) => {
      const sessions = [];
      for (const startsAt of dates) {
        sessions.push(
          await tx.teachingSession.create({
            data: { workspaceId: FIXTURES, groupId: group.id, startsAt, status: "completed" },
          }),
        );
      }
      await tx.attendanceMark.createMany({
        data: sessions.map((session, index) => ({
          workspaceId: FIXTURES,
          sessionId: session.id,
          studentId,
          mark: index === 0 ? "absent" : "present",
          recordedBy: scope.actorUserId,
        })),
      });

      const homeworks = [];
      for (const [index, dueAt] of dates.entries()) {
        const homework = await tx.homework.create({
          data: {
            workspaceId: FIXTURES,
            groupId: group.id,
            title: `Progress homework ${index + 1} ${suffix}`,
            dueAt,
            createdBy: scope.actorUserId,
          },
        });
        homeworks.push(homework);
      }
      await tx.homeworkCompletionMark.createMany({
        data: homeworks.map((homework, index) => ({
          workspaceId: FIXTURES,
          homeworkId: homework.id,
          studentId,
          status: index === 0 ? "not_completed" : "completed",
          recordedBy: scope.actorUserId,
        })),
      });

      for (const [index, date] of dates.entries()) {
        const assessment = await tx.assessment.create({
          data: {
            workspaceId: FIXTURES,
            groupId: group.id,
            title: `Progress assessment ${index + 1} ${suffix}`,
            date,
            maxScore: 100,
          },
        });
        await tx.assessmentScore.create({
          data: {
            workspaceId: FIXTURES,
            assessmentId: assessment.id,
            studentId,
            score: 50 + index * 20,
            status: "graded",
            updatedBy: scope.actorUserId,
          },
        });
      }
    });

    const result = await getStudentProgress(scope, studentId, {});
    expect(result.sources).toEqual({ attendance: true, assessment: true, homework: true });
    expect(result.series.attendance?.points.map((point) => point.value)).toEqual([0, 100, 100]);
    expect(result.series.attendance?.direction).toBe("improving");
    expect(result.series.assessment?.points.map((point) => point.value)).toEqual([50, 70, 90]);
    expect(result.series.assessment?.direction).toBe("improving");
    expect(result.series.homework?.points.map((point) => point.value)).toEqual([0, 100, 100]);
    expect(result.series.homework?.direction).toBe("improving");

    const limited = await getStudentProgress(limitedScope(["students:read"]), studentId, {});
    expect(limited.sources).toEqual({ attendance: false, assessment: false, homework: false });
    expect(limited.series).toEqual({ attendance: null, assessment: null, homework: null });

    const mixed = await getStudentProgress(
      limitedScope(["students:read", "attendance:read"]),
      studentId,
      {},
    );
    expect(mixed.sources).toEqual({ attendance: true, assessment: false, homework: false });
    expect(mixed.series.attendance?.points).toHaveLength(3);
    expect(mixed.series.assessment).toBeNull();
    expect(mixed.series.homework).toBeNull();

    const otherWorkspace = { ...scope, workspaceId: "00000000-0000-4000-8000-000000000001" };
    await expect(getStudentProgress(otherWorkspace, studentId, {})).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
