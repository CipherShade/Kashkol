import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { withScope } from "@/lib/db/scope";
import { createGroup } from "@/modules/groups/service";
import { searchWorkspace } from "@/modules/search/service";
import { permissionKey, type Scope } from "@/modules/tenancy/types";
import { createStudent, DELTA, deleteStudent, FIXTURES, fixturesScope } from "./helpers";

const createdStudents: Array<{ workspaceId: string; studentId: string }> = [];
const createdGroups: string[] = [];

function token(): string {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

async function addStudent(
  workspaceId: string,
  firstName: string,
  lastName: string,
): Promise<string> {
  const studentId = await createStudent(workspaceId, firstName, lastName);
  createdStudents.push({ workspaceId, studentId });
  return studentId;
}

async function addGroup(scope: Scope, name: string): Promise<string> {
  const group = await createGroup(
    scope,
    {
      name,
      subjectId: null,
      subjectName: null,
      grade: null,
      room: null,
      color: "indigo",
      weekday: 0,
      startTime: "16:00",
      endTime: "17:00",
      capacity: null,
      teacherNote: null,
    },
    { requestId: randomUUID() },
  );
  createdGroups.push(group.id);
  return group.id;
}

afterEach(async () => {
  for (const groupId of createdGroups.splice(0)) {
    await withScope({ workspaceId: FIXTURES }, async (tx) => {
      await tx.teachingSession.deleteMany({ where: { workspaceId: FIXTURES, groupId } });
      await tx.enrollment.deleteMany({ where: { workspaceId: FIXTURES, groupId } });
      await tx.group.deleteMany({ where: { workspaceId: FIXTURES, id: groupId } });
    });
  }
  for (const item of createdStudents.splice(0)) {
    await deleteStudent(item.workspaceId, item.studentId);
  }
});

describe("workspace search", () => {
  it("matches normalized student and group names", async () => {
    const scope = fixturesScope();
    const suffix = token();
    const studentId = await addStudent(
      FIXTURES,
      "\u0623\u064e\u062d\u0652\u0645\u064e\u062f",
      suffix.toUpperCase(),
    );
    const groupId = await addGroup(
      scope,
      `\u0645\u062c\u0645\u0648\u0639\u0629 \u0623\u064e\u062d\u0652\u0645\u064e\u062f ${suffix}`,
    );

    const result = await searchWorkspace(scope, {
      q: `\u0627\u062d\u0645\u062f ${suffix}`,
    });

    expect(result.students.map((student) => student.id)).toContain(studentId);
    expect(result.groups.map((group) => group.id)).toContain(groupId);
  });

  it("caps each result type and excludes archived and other-workspace records", async () => {
    const scope = fixturesScope();
    const suffix = token();
    for (let index = 0; index < 6; index += 1) {
      await addStudent(FIXTURES, `\u0637\u0627\u0644\u0628 ${suffix}`, `${index}`);
    }

    const archivedId = await addStudent(FIXTURES, `\u0637\u0627\u0644\u0628 ${suffix}`, "archived");
    await withScope({ workspaceId: FIXTURES }, (tx) =>
      tx.student.update({
        where: { workspaceId: FIXTURES, id: archivedId },
        data: { archivedAt: new Date() },
      }),
    );

    const deltaId = await addStudent(DELTA, `\u0637\u0627\u0644\u0628 ${suffix}`, "delta");

    const result = await searchWorkspace(scope, {
      q: `\u0637\u0627\u0644\u0628 ${suffix}`,
    });

    expect(result.students).toHaveLength(5);
    expect(result.students.map((student) => student.id)).not.toContain(archivedId);
    expect(result.students.map((student) => student.id)).not.toContain(deltaId);
  });

  it("includes only the resource types the member may read", async () => {
    const suffix = token();
    const studentScope: Scope = {
      ...fixturesScope(),
      actorUserId: randomUUID(),
      role: "assistant",
      permissions: new Set([permissionKey("students", "read")]),
    };
    const studentId = await addStudent(FIXTURES, "\u0637\u0627\u0644\u0628", suffix);
    const groupId = await addGroup(fixturesScope(), `\u0645\u062c\u0645\u0648\u0639\u0629 ${suffix}`);

    const result = await searchWorkspace(studentScope, { q: suffix });
    expect(result.students.map((student) => student.id)).toContain(studentId);
    expect(result.groups.map((group) => group.id)).not.toContain(groupId);

    await expect(
      searchWorkspace(
        {
          ...studentScope,
          permissions: new Set(),
        },
        { q: suffix },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns no records for a term that normalizes to nothing", async () => {
    const result = await searchWorkspace(fixturesScope(), { q: "\u0640\u064b" });
    expect(result).toEqual({ students: [], groups: [] });
  });
});
