import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getDb, disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { previewParentPortalForStudent } from "@/modules/portals/preview";
import type { Permission } from "@/modules/tenancy/types";
import {
  createStudent,
  deleteStudent,
  fixturesScope,
  FIXTURES,
  FIXTURE_OWNER,
} from "./helpers";

const STUDENTS: string[] = [];

afterAll(async () => {
  await disconnectDb();
});

afterEach(async () => {
  for (const studentId of STUDENTS) {
    await deleteStudent(FIXTURES, studentId).catch(() => undefined);
  }
  STUDENTS.length = 0;
});

describe("teacher parent-portal preview", () => {
  it("renders the real parent projection and writes an audit event", async () => {
    const scope = fixturesScope("Preview Owner");
    const studentId = await createStudent(
      FIXTURES,
      "Preview",
      randomUUID().slice(0, 8),
    );
    STUDENTS.push(studentId);

    const grantsBefore = await withScope(scope, (tx) =>
      tx.portalGrant.count({ where: { workspaceId: FIXTURES, studentId } }),
    );
    const loginsBefore = await getDb().portalLogin.count();
    const requestId = `req-${randomUUID()}`;

    const overview = await previewParentPortalForStudent(
      scope,
      studentId,
      { requestId },
      new Date("2026-11-24T10:00:00.000Z"),
    );

    expect(overview.children).toHaveLength(1);
    expect(overview.children[0].studentId).toBe(studentId);
    expect(overview.activeChild.kind).toBe("parent");
    expect(overview.activeChild.student.id).toBe(studentId);

    const events = await withScope(scope, (tx) =>
      tx.auditEvent.findMany({
        where: {
          workspaceId: FIXTURES,
          entityType: "student",
          entityId: studentId,
          action: "portal.previewed",
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.actorUserId).toBe(FIXTURE_OWNER);
    expect(events[0]?.requestId).toBe(requestId);
    expect(events[0]?.diff).toMatchObject({
      kind: "parent",
      source: "default_permissions",
    });

    const grantsAfter = await withScope(scope, (tx) =>
      tx.portalGrant.count({ where: { workspaceId: FIXTURES, studentId } }),
    );
    expect(grantsAfter).toBe(grantsBefore);
    expect(await getDb().portalLogin.count()).toBe(loginsBefore);
  });

  it("denies teachers without portal access read permission before reading data", async () => {
    const owner = fixturesScope("Preview Owner");
    const studentId = await createStudent(
      FIXTURES,
      "Denied",
      randomUUID().slice(0, 8),
    );
    STUDENTS.push(studentId);

    const assistant = {
      ...owner,
      actorUserId: "10000000-0000-4000-8000-000000000098",
      actorDisplayName: "Preview Assistant",
      role: "assistant" as const,
      permissions: new Set<Permission>(),
    };

    await expect(
      previewParentPortalForStudent(assistant, studentId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const events = await withScope(owner, (tx) =>
      tx.auditEvent.count({
        where: {
          workspaceId: FIXTURES,
          entityType: "student",
          entityId: studentId,
          action: "portal.previewed",
        },
      }),
    );
    expect(events).toBe(0);
  });
});
