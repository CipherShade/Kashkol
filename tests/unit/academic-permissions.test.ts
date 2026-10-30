import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/http/errors";
import { createAssessment } from "@/modules/assessments/service";
import { createHomework, updateHomeworkSubmission } from "@/modules/homework/service";
import { createFollowUp } from "@/modules/followups/service";
import type { Permission, Scope } from "@/modules/tenancy/types";

const assistant: Scope = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  actorUserId: "10000000-0000-4000-8000-000000000002",
  actorDisplayName: "Assistant",
  role: "assistant",
  permissions: new Set(["homework:write", "students:read", "students:write", "grades:read"]),
};

describe("academic service permissions", () => {
  it("denies grade entry without grades:write before database access", async () => {
    await expect(
      createAssessment(assistant, {
        groupId: "00000000-0000-4000-8000-000000000010",
        title: "Paper",
        type: "paper_exam",
        date: "2026-10-29",
        maxScore: 100,
        note: null,
        extraCreditAllowance: null,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("denies homework creation for a group without permission to read that group's roster", async () => {
    const scope = {
      ...assistant,
      permissions: new Set<Permission>(["homework:write", "students:read"]),
    };
    await expect(
      createHomework(scope, {
        groupId: "00000000-0000-4000-8000-000000000010",
        studentIds: undefined,
        title: "Task",
        instructions: null,
        dueAt: "2026-10-30T12:00:00.000Z",
        resourceFileIds: [],
        maxScore: null,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("denies homework writes before database access without homework:write", async () => {
    const scope = {
      ...assistant,
      permissions: new Set<Permission>(["students:read", "grades:read"]),
    };
    await expect(
      createHomework(scope, {
        groupId: null,
        studentIds: ["00000000-0000-4000-8000-000000000020"],
        title: "Task",
        instructions: null,
        dueAt: "2026-10-30T12:00:00.000Z",
        resourceFileIds: [],
        maxScore: null,
      }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      updateHomeworkSubmission(
        scope,
        "00000000-0000-4000-8000-000000000030",
        "00000000-0000-4000-8000-000000000020",
        { status: "submitted", teacherFeedback: null },
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("requires student write access to create a private follow-up task", async () => {
    const scope = { ...assistant, permissions: new Set<Permission>(["students:read"]) };
    await expect(
      createFollowUp(scope, {
        studentId: "00000000-0000-4000-8000-000000000020",
        title: "Call family",
        note: null,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
