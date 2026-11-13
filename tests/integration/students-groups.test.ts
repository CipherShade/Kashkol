import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { withScope } from "@/lib/db/scope";
import { AppError } from "@/lib/http/errors";
import { createGroup, enrollStudentInGroup } from "@/modules/groups/service";
import { createStudent, getStudent } from "@/modules/students/service";
import {
  commitStudentsImport,
  previewStudentsImport,
} from "@/modules/students/service";
import type { CommitImportInput } from "@/modules/students/schemas";
import { DELTA, FIXTURES, fixturesScope } from "./helpers";

const created: Array<{ groupId: string; studentId: string }> = [];

afterEach(async () => {
  for (const item of created.splice(0)) {
    await withScope({ workspaceId: FIXTURES }, async (tx) => {
      await tx.enrollment.deleteMany({ where: { workspaceId: FIXTURES, groupId: item.groupId } });
      await tx.teachingSession.deleteMany({ where: { workspaceId: FIXTURES, groupId: item.groupId } });
      await tx.group.deleteMany({ where: { workspaceId: FIXTURES, id: item.groupId } });
      await tx.student.deleteMany({ where: { workspaceId: FIXTURES, id: item.studentId } });
    });
  }
});

describe("students and groups services", () => {
  it("creates records and makes concurrent enrollment idempotent", async () => {
    const scope = fixturesScope();
    const studentResult = await createStudent(
      scope,
      {
        firstName: "Concurrent",
        lastName: randomUUID(),
        grade: null,
        phone: null,
        parentName: null,
        parentPhone: null,
        groupIds: [],
        note: null,
        confirmDuplicate: false,
      },
      { requestId: randomUUID() },
    );
    if (studentResult.duplicateWarning) throw new Error("unexpected duplicate");

    const group = await createGroup(
      scope,
      {
        name: `Concurrent ${randomUUID()}`,
        subjectId: null,
        subjectName: null,
        grade: null,
        room: null,
        color: "indigo",
        weekday: 0,
        startTime: "16:00",
        endTime: "17:00",
        capacity: 20,
        teacherNote: null,
      },
      { requestId: randomUUID() },
    );
    created.push({ groupId: group.id, studentId: studentResult.student.id });

    const enroll = { groupId: group.id, studentId: studentResult.student.id };
    const [first, second] = await Promise.all([
      enrollStudentInGroup(scope, enroll, { requestId: randomUUID() }),
      enrollStudentInGroup(scope, enroll, { requestId: randomUUID() }),
    ]);
    expect(first.id).toBe(second.id);

    const openEnrollments = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.enrollment.count({ where: { groupId: group.id, studentId: studentResult.student.id, leftAt: null } }),
    );
    expect(openEnrollments).toBe(1);
  });

  it("does not disclose a foreign student through the service", async () => {
    const foreignStudentId = randomUUID();
    await withScope({ workspaceId: DELTA }, (tx) =>
      tx.student.create({
        data: { id: foreignStudentId, workspaceId: DELTA, firstName: "Foreign", lastName: "Student" },
      }),
    );
    try {
      await expect(getStudent(fixturesScope(), foreignStudentId)).rejects.toBeInstanceOf(AppError);
    } finally {
      await withScope({ workspaceId: DELTA }, (tx) =>
        tx.student.deleteMany({ where: { id: foreignStudentId, workspaceId: DELTA } }),
      );
    }
  });

  it("requires acknowledgment for a name-only import match and audits each row", async () => {
    const scope = fixturesScope();
    const lastName = `Import${randomUUID().slice(0, 8)}`;
    const studentResult = await createStudent(
      scope,
      {
        firstName: "Nameonly",
        lastName,
        grade: null,
        phone: null,
        parentName: null,
        parentPhone: null,
        groupIds: [],
        note: null,
        confirmDuplicate: false,
      },
      { requestId: randomUUID() },
    );
    if (studentResult.duplicateWarning) throw new Error("unexpected duplicate");
    const studentId = studentResult.student.id;
    created.push({ groupId: randomUUID(), studentId });

    const preview = await previewStudentsImport(
      scope,
      Buffer.from(`name\nNameonly ${lastName}\n`, "utf8"),
      "csv",
    );
    expect(preview.rows[0]?.action).toBe("update");
    expect(preview.rows[0]?.warnings).toContain("nameOnlyMatch");

    const input: CommitImportInput = {
      mode: "all_or_nothing",
      acknowledgeWarnings: false,
      groupMappings: {},
      rows: preview.rows.map((row) => ({
        rowNumber: row.rowNumber,
        firstName: row.firstName,
        lastName: row.lastName,
        grade: row.grade,
        phone: row.phone,
        parentName: row.parentName,
        parentPhone: row.parentPhone,
        groupName: row.groupName,
        action: row.action,
        existingStudentId: row.existingStudentId,
      })),
    };

    await expect(
      commitStudentsImport(scope, input, { requestId: randomUUID() }),
    ).rejects.toBeInstanceOf(AppError);

    const requestId = randomUUID();
    const result = await commitStudentsImport(
      scope,
      { ...input, acknowledgeWarnings: true },
      { requestId },
    );
    expect(result.updatedCount).toBe(1);

    const rowAudits = await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.auditEvent.count({
        where: { workspaceId: FIXTURES, requestId, action: "student.updated", entityId: studentId },
      }),
    );
    expect(rowAudits).toBe(1);
  });
});
