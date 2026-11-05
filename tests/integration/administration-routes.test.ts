import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sessionMock = vi.hoisted(() => ({ requireStaffSession: vi.fn() }));
vi.mock("@/modules/identity/session", () => ({
  requireStaffSession: sessionMock.requireStaffSession,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

import { GET as getAudit } from "@/app/api/audit/route";
import { GET as getAssessments } from "@/app/api/assessments/route";
import { GET as getFiles } from "@/app/api/files/route";
import { GET as getAttendance } from "@/app/api/sessions/[sessionId]/attendance/route";
import { GET as getGroups } from "@/app/api/groups/route";
import { GET as getHomework } from "@/app/api/homework/route";
import { GET as getOutbox } from "@/app/api/messaging/outbox/route";
import { GET as getGuardians, POST as postGuardian } from "@/app/api/messaging/guardians/route";
import { GET as getPayments } from "@/app/api/payments/route";
import { GET as getReports } from "@/app/api/reports/route";
import { GET as getReportExport } from "@/app/api/reports/exports/[exportId]/route";
import { GET as getSessions } from "@/app/api/sessions/route";
import { GET as getStudents } from "@/app/api/students/route";
import { GET as getNotificationSettings } from "@/app/api/messaging/settings/route";
import { GET as getTeam } from "@/app/api/team/route";
import { GET as getWorkspace } from "@/app/api/workspace/route";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { AppError } from "@/lib/http/errors";
import { assistantScope, createStudent, deleteStudent, NILE, ownerScope } from "./helpers";

afterAll(async () => {
  await disconnectDb();
});

function request(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe("workspace administration direct requests", () => {
  it("denies assistants without team:read and permits the owner through the team API", async () => {
    const assistant = await assistantScope();
    sessionMock.requireStaffSession.mockResolvedValue({
      scope: { ...assistant, permissions: new Set() },
    });

    const denied = await getTeam(request("/api/team"));
    expect(denied.status).toBe(403);

    sessionMock.requireStaffSession.mockResolvedValue({ scope: ownerScope() });
    const allowed = await getTeam(request("/api/team"));
    expect(allowed.status).toBe(200);
    await expect(allowed.json()).resolves.toMatchObject({
      members: expect.any(Array),
      invitations: expect.any(Array),
    });
  });

  it("restricts the audit API to audit:read and returns a redacted projection", async () => {
    const assistant = await assistantScope();
    sessionMock.requireStaffSession.mockResolvedValue({
      scope: { ...assistant, permissions: new Set() },
    });

    const denied = await getAudit(request("/api/audit"));
    expect(denied.status).toBe(403);

    sessionMock.requireStaffSession.mockResolvedValue({ scope: ownerScope() });
    const allowed = await getAudit(request("/api/audit"));
    expect(allowed.status).toBe(200);
    const result = await allowed.json();
    expect(result.events).toEqual(expect.any(Array));
    expect(result.events[0]).not.toHaveProperty("diff");
  });

  it("enforces each staff data boundary through direct API requests", async () => {
    const assistant = await assistantScope();
    sessionMock.requireStaffSession.mockResolvedValue({
      scope: { ...assistant, permissions: new Set() },
    });

    const sessionId = "30000000-0000-4000-8000-000000000001";
    const exportId = "30000000-0000-4000-8000-000000000002";
    const responses = await Promise.all([
      getStudents(request("/api/students")),
      getGroups(request("/api/groups")),
      getSessions(
        request("/api/sessions?from=2026-10-30T00%3A00%3A00.000Z&to=2026-10-31T00%3A00%3A00.000Z"),
      ),
      getHomework(request("/api/homework")),
      getAssessments(request("/api/assessments")),
      getFiles(request("/api/files")),
      getGuardians(
        request("/api/messaging/guardians?studentId=30000000-0000-4000-8000-000000000003"),
      ),
      getOutbox(request("/api/messaging/outbox")),
      getPayments(request("/api/payments")),
      getReports(request("/api/reports?type=payments")),
      getReportExport(request(`/api/reports/exports/${exportId}`), {
        params: Promise.resolve({ exportId }),
      }),
      getAttendance(request(`/api/sessions/${sessionId}/attendance`), {
        params: Promise.resolve({ sessionId }),
      }),
      getNotificationSettings(request("/api/messaging/settings")),
      getWorkspace(request("/api/workspace")),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403,
    ]);

    sessionMock.requireStaffSession.mockResolvedValue({
      scope: { ...assistant, permissions: new Set(["messages:read"]) },
    });
    const permittedOutbox = await getOutbox(request("/api/messaging/outbox"));
    expect(permittedOutbox.status).toBe(200);
  });

  it("requires students permissions for guardians and audits guardian creation", async () => {
    const assistant = await assistantScope();
    const studentId = await createStudent(NILE, `Guardian-${randomUUID()}`);
    const body = {
      studentId,
      firstName: "Mona",
      lastName: "Hassan",
      relation: "mother",
      phoneE164: "+201012345678",
      isPrimary: true,
      isAuthorized: true,
    };

    sessionMock.requireStaffSession.mockResolvedValue({
      scope: { ...assistant, permissions: new Set(["messages:read", "messages:write"]) },
    });

    const deniedGet = await getGuardians(
      request(`/api/messaging/guardians?studentId=${studentId}`),
    );
    expect(deniedGet.status).toBe(403);

    const deniedPost = await postGuardian(
      new NextRequest("http://localhost:3000/api/messaging/guardians", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    expect(deniedPost.status).toBe(403);

    sessionMock.requireStaffSession.mockResolvedValue({ scope: ownerScope() });

    let guardianId: string | undefined;
    try {
      const created = await postGuardian(
        new NextRequest("http://localhost:3000/api/messaging/guardians", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      expect(created.status).toBe(201);
      const createdBody = await created.json();
      guardianId = createdBody.data.id;
      expect(createdBody.data).toMatchObject({
        workspaceId: NILE,
        studentId,
        firstName: "Mona",
        isPrimary: true,
      });

      const listed = await getGuardians(
        request(`/api/messaging/guardians?studentId=${studentId}`),
      );
      expect(listed.status).toBe(200);
      const listedBody = await listed.json();
      expect(listedBody.data.map((guardian: { id: string }) => guardian.id)).toContain(
        guardianId,
      );

      const audit = await withScope({ workspaceId: NILE }, (tx) =>
        tx.auditEvent.findFirst({
          where: {
            workspaceId: NILE,
            entityType: "guardian",
            entityId: guardianId,
            action: "messaging.guardian.created",
          },
        }),
      );
      expect(audit).not.toBeNull();
    } finally {
      if (guardianId) {
        await withScope({ workspaceId: NILE }, (tx) =>
          tx.guardian.deleteMany({ where: { workspaceId: NILE, id: guardianId } }),
        );
      }
      await deleteStudent(NILE, studentId);
    }
  });

  it("returns an unauthenticated response rather than leaking team data", async () => {
    sessionMock.requireStaffSession.mockRejectedValue(new AppError("UNAUTHORIZED"));
    const response = await getTeam(request("/api/team"));
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("members");
  });
});
