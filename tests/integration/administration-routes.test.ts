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
import { GET as getPayments } from "@/app/api/payments/route";
import { GET as getReports } from "@/app/api/reports/route";
import { GET as getReportExport } from "@/app/api/reports/exports/[exportId]/route";
import { GET as getSessions } from "@/app/api/sessions/route";
import { GET as getStudents } from "@/app/api/students/route";
import { GET as getNotificationSettings } from "@/app/api/messaging/settings/route";
import { GET as getTeam } from "@/app/api/team/route";
import { GET as getWorkspace } from "@/app/api/workspace/route";
import { disconnectDb } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { assistantScope, ownerScope } from "./helpers";

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
      403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403, 403,
    ]);

    sessionMock.requireStaffSession.mockResolvedValue({
      scope: { ...assistant, permissions: new Set(["messages:read"]) },
    });
    const permittedOutbox = await getOutbox(request("/api/messaging/outbox"));
    expect(permittedOutbox.status).toBe(200);
  });

  it("returns an unauthenticated response rather than leaking team data", async () => {
    sessionMock.requireStaffSession.mockRejectedValue(new AppError("UNAUTHORIZED"));
    const response = await getTeam(request("/api/team"));
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("members");
  });
});
