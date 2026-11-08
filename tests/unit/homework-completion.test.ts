import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getHomeworkCompletionRoster,
  bulkRecordHomeworkCompletion,
} from "../../src/modules/homework/service.js";
import * as homeworkRepo from "../../src/modules/homework/repository.js";
import * as dbScope from "../../src/lib/db/scope.js";
import { AppError } from "../../src/lib/http/errors.js";
import type { Scope } from "../../src/modules/tenancy/types.js";

const scope: Scope = {
  workspaceId: "018f6c5b-0000-7000-8000-000000000001",
  actorUserId: "018f6c5b-0000-7000-8000-000000000002",
  actorDisplayName: "Teacher Ali",
  role: "owner",
  permissions: new Set(),
};

describe("Offline Homework Completion Service", () => {
  const homeworkId = "018f6c5b-7777-7000-8000-000000000001";
  const sessionId = "018f6c5b-1111-7000-8000-000000000001";
  const student1Id = "018f6c5b-2222-7000-8000-000000000001";
  const student2Id = "018f6c5b-3333-7000-8000-000000000001";

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(dbScope, "withScope").mockImplementation(async (_s, cb) => {
      return cb({
        auditEvent: { create: vi.fn().mockResolvedValue({}) },
      } as unknown as Parameters<Parameters<typeof dbScope.withScope>[1]>[0]);
    });
  });

  it("fetches homework completion roster", async () => {
    vi.spyOn(homeworkRepo, "getHomeworkCompletionRosterTx").mockResolvedValue({
      homework: {
        id: homeworkId,
        title: "Unit 1 Exercises",
        group: { id: "g1", name: "Group 1" },
      } as unknown as NonNullable<Awaited<ReturnType<typeof homeworkRepo.getHomeworkCompletionRosterTx>>>["homework"],
      roster: [
        {
          studentId: student1Id,
          firstName: "Ahmed",
          lastName: "Ali",
          status: "completed",
          note: "Well done",
          recordedBy: "teacher-1",
          recordedAt: new Date(),
        },
        {
          studentId: student2Id,
          firstName: "Sara",
          lastName: "Hassan",
          status: "not_completed",
          note: null,
          recordedBy: null,
          recordedAt: null,
        },
      ],
    });

    const result = await getHomeworkCompletionRoster(scope, homeworkId, sessionId);
    expect(result.homework.title).toBe("Unit 1 Exercises");
    expect(result.roster).toHaveLength(2);
    expect(result.roster[0].status).toBe("completed");
    expect(result.roster[1].status).toBe("not_completed");
  });

  it("throws NOT_FOUND if homework does not exist", async () => {
    vi.spyOn(homeworkRepo, "getHomeworkCompletionRosterTx").mockResolvedValue(null);

    await expect(
      getHomeworkCompletionRoster(scope, "non-existent-hw"),
    ).rejects.toThrow(AppError);
  });

  it("bulk records homework completion marks", async () => {
    const upsertSpy = vi.spyOn(homeworkRepo, "upsertHomeworkCompletionMarksTx").mockResolvedValue([
      { id: "cm-1", homeworkId, studentId: student1Id, status: "completed" },
      { id: "cm-2", homeworkId, studentId: student2Id, status: "not_applicable" },
    ] as unknown as Awaited<ReturnType<typeof homeworkRepo.upsertHomeworkCompletionMarksTx>>);

    const result = await bulkRecordHomeworkCompletion(scope, {
      homeworkId,
      sessionId,
      marks: [
        { studentId: student1Id, status: "completed", note: "Good work" },
        { studentId: student2Id, status: "not_applicable" },
      ],
    });

    expect(result.count).toBe(2);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        homeworkId,
        sessionId,
        marks: [
          { studentId: student1Id, status: "completed", note: "Good work" },
          { studentId: student2Id, status: "not_applicable" },
        ],
      }),
    );
  });
});
