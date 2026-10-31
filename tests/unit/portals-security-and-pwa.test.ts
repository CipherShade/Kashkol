import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createPortalInvitationToken,
  hashPortalInvitationToken,
  portalInvitationExpiresAt,
  PORTAL_INVITATION_TTL_MS,
  resolvePortalPermissions,
} from "@/modules/portals/tokens";
import {
  buildPushNotificationPayload,
  dispatchWebPushNotification,
  isLockScreenSafePayload,
} from "@/modules/portals/push";
import {
  acceptPortalInvitationSchema,
  issuePortalInvitationSchema,
  upsertPushSubscriptionSchema,
} from "@/modules/portals/schemas";
import { AppError } from "@/lib/http/errors";

const identityMocks = vi.hoisted(() => ({
  findActiveMemberships: vi.fn(),
  findActivePortalGrants: vi.fn(),
  findPortalStudentProjection: vi.fn(),
  findStudentInWorkspace: vi.fn(),
  findUser: vi.fn(),
  deleteSessionsForUserTx: vi.fn(),
}));

const portalRepoMocks = vi.hoisted(() => ({
  findStudentForPortalAccess: vi.fn(),
  findPortalInvitationByTokenHash: vi.fn(),
  createOrRotatePortalInvitationTx: vi.fn(),
  revokePortalInvitationTx: vi.fn(),
  acceptPortalInvitationTx: vi.fn(),
  updatePortalGrantPermissionsTx: vi.fn(),
  revokePortalGrantTx: vi.fn(),
  loadParentLinkedChildren: vi.fn(),
  loadParentChildDetail: vi.fn(),
  loadStudentPortalDetail: vi.fn(),
  submitStudentHomeworkInScope: vi.fn(),
  listPortalNotificationsForGrants: vi.fn(),
  markPortalNotificationReadForGrants: vi.fn(),
  listPortalPushSubscriptionsForUser: vi.fn(),
  upsertPortalPushSubscriptionForUser: vi.fn(),
  updatePortalPushPreferenceForUser: vi.fn(),
  deletePortalPushSubscriptionForUser: vi.fn(),
}));

const sessionHelperMocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getPortalContext: vi.fn(),
  requireParentPortalContext: vi.fn(),
  requireStudentPortalContext: vi.fn(),
  requireStaffSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      origin: "http://localhost:3000",
      host: "localhost:3000",
    }),
}));

vi.mock("@/modules/identity/repository", () => ({
  findActiveMemberships: identityMocks.findActiveMemberships,
  findActivePortalGrants: identityMocks.findActivePortalGrants,
  findPortalStudentProjection: identityMocks.findPortalStudentProjection,
  findStudentInWorkspace: identityMocks.findStudentInWorkspace,
  findUser: identityMocks.findUser,
  deleteSessionsForUserTx: identityMocks.deleteSessionsForUserTx,
}));

vi.mock("@/modules/portals/repository", () => ({
  findStudentForPortalAccess: portalRepoMocks.findStudentForPortalAccess,
  findPortalInvitationByTokenHash:
    portalRepoMocks.findPortalInvitationByTokenHash,
  createOrRotatePortalInvitationTx:
    portalRepoMocks.createOrRotatePortalInvitationTx,
  revokePortalInvitationTx: portalRepoMocks.revokePortalInvitationTx,
  acceptPortalInvitationTx: portalRepoMocks.acceptPortalInvitationTx,
  updatePortalGrantPermissionsTx:
    portalRepoMocks.updatePortalGrantPermissionsTx,
  revokePortalGrantTx: portalRepoMocks.revokePortalGrantTx,
  loadParentLinkedChildren: portalRepoMocks.loadParentLinkedChildren,
  loadParentChildDetail: portalRepoMocks.loadParentChildDetail,
  loadStudentPortalDetail: portalRepoMocks.loadStudentPortalDetail,
  submitStudentHomeworkInScope: portalRepoMocks.submitStudentHomeworkInScope,
  listPortalNotificationsForGrants:
    portalRepoMocks.listPortalNotificationsForGrants,
  markPortalNotificationReadForGrants:
    portalRepoMocks.markPortalNotificationReadForGrants,
  listPortalPushSubscriptionsForUser:
    portalRepoMocks.listPortalPushSubscriptionsForUser,
  upsertPortalPushSubscriptionForUser:
    portalRepoMocks.upsertPortalPushSubscriptionForUser,
  updatePortalPushPreferenceForUser:
    portalRepoMocks.updatePortalPushPreferenceForUser,
  deletePortalPushSubscriptionForUser:
    portalRepoMocks.deletePortalPushSubscriptionForUser,
}));

vi.mock("@/modules/identity/session", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/identity/session")>();
  return {
    ...actual,
    getAuthenticatedUser: sessionHelperMocks.getAuthenticatedUser,
    getPortalContext: sessionHelperMocks.getPortalContext,
    requireParentPortalContext: sessionHelperMocks.requireParentPortalContext,
    requireStudentPortalContext: sessionHelperMocks.requireStudentPortalContext,
    requireStaffSession: sessionHelperMocks.requireStaffSession,
  };
});

import { GET as getParentOverview } from "@/app/api/portal/parent/route";
import { GET as getParentChild } from "@/app/api/portal/parent/children/[studentId]/route";
import { GET as getStudentOverview } from "@/app/api/portal/student/route";
import { POST as acceptPortalInviteRoute } from "@/app/api/portal/invitations/accept/route";
import { resolvePortalStudent } from "@/modules/identity/session";

const WORKSPACE_A = "00000000-0000-4000-8000-000000000001";
const CHILD_1 = "40000000-0000-4000-8000-000000000001";
const CHILD_2 = "40000000-0000-4000-8000-000000000002";
const UNLINKED_SAME_TENANT_STUDENT = "40000000-0000-4000-8000-000000000009";
const FOREIGN_TENANT_STUDENT = "50000000-0000-4000-8000-000000000099";

describe("portal tokens, schemas, and permission resolution", () => {
  it("creates high-entropy single-use tokens and hashes them deterministically with SHA-256", () => {
    const first = createPortalInvitationToken();
    const second = createPortalInvitationToken();

    expect(first.token.length).toBeGreaterThanOrEqual(40);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(hashPortalInvitationToken(first.token));
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("sets a 24-hour expiration window on portal invitations", () => {
    const now = new Date("2026-10-31T10:00:00.000Z");
    const expires = portalInvitationExpiresAt(now);
    expect(expires.getTime() - now.getTime()).toBe(PORTAL_INVITATION_TTL_MS);
  });

  it("defaults showPayments to false for parents and strictly forbids showPayments for students", () => {
    const parentDefault = resolvePortalPermissions("parent", undefined);
    expect(parentDefault.showPayments).toBe(false);
    expect(parentDefault.showAttendance).toBe(true);
    expect(parentDefault.showGrades).toBe(true);

    const parentWithPayments = resolvePortalPermissions("parent", {
      showPayments: true,
    });
    expect(parentWithPayments.showPayments).toBe(true);

    const studentAttemptedPayments = resolvePortalPermissions("student", {
      showPayments: true,
      showAttendance: false,
    });
    expect(studentAttemptedPayments.showPayments).toBe(false);
    expect(studentAttemptedPayments.showAttendance).toBe(false);
  });

  it("validates invitation and push subscription schemas strictly", () => {
    const validInvite = issuePortalInvitationSchema.safeParse({
      studentId: CHILD_1,
      kind: "parent",
      email: "  Parent@Example.com ",
      permissions: { showPayments: true },
    });
    expect(validInvite.success).toBe(true);
    if (validInvite.success) {
      expect(validInvite.data.email).toBe("parent@example.com");
    }

    const badToken = acceptPortalInvitationSchema.safeParse({ token: "short" });
    expect(badToken.success).toBe(false);

    const pushSub = upsertPushSubscriptionSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/example-endpoint",
      keys: {
        p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls",
        auth: "tBHItJI5svbpez7KI4CCXg",
      },
    });
    expect(pushSub.success).toBe(true);
    if (pushSub.success) {
      expect(pushSub.data.includeSensitiveDetails).toBe(false);
    }
  });
});

describe("lock-screen-safe Web Push payloads and fallback behavior", () => {
  it("never exposes grades, percentages, balances, or student names when includeSensitiveDetails is false (default)", () => {
    const payloadAr = buildPushNotificationPayload({
      kind: "parent",
      locale: "ar",
      includeSensitiveDetails: false,
      eventType: "grade",
      summaryText: "حصل أحمد على 98/100 (98%) والرصيد المتبقي EGP 450",
      studentId: CHILD_1,
    });

    expect(payloadAr.sensitiveIncluded).toBe(false);
    expect(payloadAr.body).not.toContain("98/100");
    expect(payloadAr.body).not.toContain("98%");
    expect(payloadAr.body).not.toContain("450");
    expect(payloadAr.body).not.toContain("أحمد");
    expect(payloadAr.url).toBe(`/ar/portal/parent?studentId=${CHILD_1}`);
    expect(isLockScreenSafePayload(payloadAr)).toBe(true);

    const payloadEn = buildPushNotificationPayload({
      kind: "student",
      locale: "en",
      includeSensitiveDetails: false,
      eventType: "grade",
      summaryText: "Quiz 3 score: 19/20 (95%)",
    });
    expect(payloadEn.sensitiveIncluded).toBe(false);
    expect(payloadEn.body).not.toContain("19/20");
    expect(payloadEn.body).not.toContain("95%");
    expect(payloadEn.url).toBe("/en/portal/student");
    expect(isLockScreenSafePayload(payloadEn)).toBe(true);
  });

  it("includes scrubbed summary text only when the user explicitly opts in, while still redacting secrets and phone numbers", () => {
    const optedIn = buildPushNotificationPayload({
      kind: "parent",
      locale: "en",
      includeSensitiveDetails: true,
      eventType: "attendance",
      summaryText:
        "Attendance recorded as present. Contact +201012345678 Bearer secret-token-123",
      studentId: CHILD_1,
    });

    expect(optedIn.sensitiveIncluded).toBe(true);
    expect(optedIn.body).toContain("Attendance recorded as present.");
    expect(optedIn.body).not.toContain("+201012345678");
    expect(optedIn.body).not.toContain("secret-token-123");
  });

  it("gracefully falls back without throwing when Web Push VAPID keys are not configured", async () => {
    const result = await dispatchWebPushNotification(
      {
        endpoint: "https://push.example.com/sub/1",
        p256dhKey: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls",
        authKey: "tBHItJI5svbpez7KI4CCXg",
        includeSensitiveDetails: false,
      },
      {
        kind: "parent",
        locale: "ar",
        eventType: "homework",
        summaryText: "واجب جديد",
      },
    );

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("unconfigured");
    expect(result.payload.sensitiveIncluded).toBe(false);
  });
});

describe("role boundaries, multi-child access, revoked links, and tenant isolation across portal APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies a student account attempting to access parent portal routes (403) and vice versa", async () => {
    sessionHelperMocks.requireParentPortalContext.mockRejectedValue(
      new AppError("FORBIDDEN", { messageKey: "errors.portalNoGrant" }),
    );
    const studentTryingParent = await getParentOverview(
      new NextRequest("http://localhost:3000/api/portal/parent"),
    );
    expect(studentTryingParent.status).toBe(403);

    sessionHelperMocks.requireStudentPortalContext.mockRejectedValue(
      new AppError("FORBIDDEN", { messageKey: "errors.portalNoGrant" }),
    );
    const parentTryingStudent = await getStudentOverview(
      new NextRequest("http://localhost:3000/api/portal/student"),
    );
    expect(parentTryingStudent.status).toBe(403);
  });

  it("allows a parent to switch between multiple explicitly linked children while blocking unlinked same-tenant students (403) and foreign-tenant students (404)", async () => {
    const parentPortalContext = {
      user: {
        id: "parent-user-1",
        email: "parent@example.com",
        name: "Parent One",
        emailVerified: true,
      },
      grants: [
        {
          id: "grant-child-1",
          workspaceId: WORKSPACE_A,
          studentId: CHILD_1,
          guardianId: null,
          kind: "parent" as const,
          permissions: {
            showAttendance: true,
            showGrades: true,
            showHomework: true,
            showResources: true,
            showPayments: true,
            showSchedule: true,
            showNotifications: true,
          },
        },
        {
          id: "grant-child-2",
          workspaceId: WORKSPACE_A,
          studentId: CHILD_2,
          guardianId: null,
          kind: "parent" as const,
          permissions: {
            showAttendance: true,
            showGrades: true,
            showHomework: true,
            showResources: true,
            showPayments: false,
            showSchedule: true,
            showNotifications: true,
          },
        },
      ],
      workspaceIds: [WORKSPACE_A],
    };

    sessionHelperMocks.requireParentPortalContext.mockResolvedValue(
      parentPortalContext,
    );

    const resolveStudentMock = async (workspaceId: string, studentId: string) => {
      if (workspaceId !== WORKSPACE_A) return null;
      if (studentId === CHILD_1) {
        return {
          id: CHILD_1,
          workspaceId: WORKSPACE_A,
          firstName: "Youssef",
          lastName: "Hassan",
          grade: "Grade 10",
          enrollments: [],
        };
      }
      if (studentId === CHILD_2) {
        return {
          id: CHILD_2,
          workspaceId: WORKSPACE_A,
          firstName: "Salma",
          lastName: "Hassan",
          grade: "Grade 8",
          enrollments: [],
        };
      }
      if (studentId === UNLINKED_SAME_TENANT_STUDENT) {
        return {
          id: UNLINKED_SAME_TENANT_STUDENT,
          workspaceId: WORKSPACE_A,
          firstName: "Other",
          lastName: "Student",
          grade: "Grade 10",
          enrollments: [],
        };
      }
      return null;
    };

    identityMocks.findPortalStudentProjection.mockImplementation(resolveStudentMock);
    identityMocks.findStudentInWorkspace.mockImplementation(resolveStudentMock);

    portalRepoMocks.loadParentChildDetail.mockImplementation(async (grant) => ({
      grantId: grant.id,
      kind: "parent",
      permissions: resolvePortalPermissions("parent", grant.permissions),
      student: {
        id: grant.studentId,
        firstName: grant.studentId === CHILD_1 ? "Youssef" : "Salma",
        lastName: "Hassan",
        grade: "Grade 10",
      },
      teacher: {
        teachingName: "Mr. Ahmed",
        primarySubject: "Mathematics",
        currency: "EGP",
        timezone: "Africa/Cairo",
      },
      groups: [],
      attendance: {
        summary: {
          present: 10,
          absent: 0,
          late: 0,
          excused: 0,
          total: 10,
          attendanceRate: 100,
        },
        records: [],
      },
      grades: [
        {
          id: "score-published",
          score: 19,
          status: "graded",
          updatedAt: "2026-10-30T10:00:00.000Z",
          assessment: {
            id: "assess-1",
            title: "Published Exam 1",
            type: "paper_exam",
            date: "2026-10-28",
            maxScore: 20,
            groupName: "Group A",
            publishedAt: "2026-10-29T12:00:00.000Z",
          },
        },
      ],
      homework: [],
      resources: [],
      payments:
        grant.studentId === CHILD_1
          ? {
              currency: "EGP",
              balance: {
                expectedMinor: 40000,
                receivedMinor: 40000,
                adjustmentsMinor: 0,
                balanceMinor: 0,
              },
              history: [],
              adjustments: [],
            }
          : null,
      schedule: { upcomingSessions: [], recentChanges: [] },
      notifications: [],
    }));

    // 1. Access Child 1 -> 200 OK with approved payments
    const child1Res = await getParentChild(
      new NextRequest(
        `http://localhost:3000/api/portal/parent/children/${CHILD_1}`,
      ),
      { params: Promise.resolve({ studentId: CHILD_1 }) },
    );
    expect(child1Res.status).toBe(200);
    const child1Body = await child1Res.json();
    expect(child1Body.student.id).toBe(CHILD_1);
    expect(child1Body.payments).not.toBeNull();
    expect(child1Body).not.toHaveProperty("workspaceId");
    expect(child1Body).not.toHaveProperty("notes");

    // 2. Access Child 2 -> 200 OK with payments hidden (showPayments: false on Child 2 grant)
    const child2Res = await getParentChild(
      new NextRequest(
        `http://localhost:3000/api/portal/parent/children/${CHILD_2}`,
      ),
      { params: Promise.resolve({ studentId: CHILD_2 }) },
    );
    expect(child2Res.status).toBe(200);
    const child2Body = await child2Res.json();
    expect(child2Body.student.id).toBe(CHILD_2);
    expect(child2Body.payments).toBeNull();

    // 3. Direct URL/API access to another student in the SAME workspace -> 403 FORBIDDEN
    const unlinkedRes = await getParentChild(
      new NextRequest(
        `http://localhost:3000/api/portal/parent/children/${UNLINKED_SAME_TENANT_STUDENT}`,
      ),
      { params: Promise.resolve({ studentId: UNLINKED_SAME_TENANT_STUDENT }) },
    );
    expect(unlinkedRes.status).toBe(403);

    // 4. Direct URL/API access to a student in ANOTHER workspace (Workspace B) -> 404 NOT_FOUND
    const foreignRes = await getParentChild(
      new NextRequest(
        `http://localhost:3000/api/portal/parent/children/${FOREIGN_TENANT_STUDENT}`,
      ),
      { params: Promise.resolve({ studentId: FOREIGN_TENANT_STUDENT }) },
    );
    expect(foreignRes.status).toBe(404);
  });

  it("enforces role kind in resolvePortalStudent so a student grant cannot be used as a parent grant", async () => {
    const studentPortalContext = {
      userId: "student-user-1",
      user: {
        id: "student-user-1",
        email: "student@example.com",
        name: "Student One",
        emailVerified: true,
      },
      grants: [
        {
          id: "grant-student-1",
          workspaceId: WORKSPACE_A,
          studentId: CHILD_1,
          guardianId: null,
          kind: "student" as const,
          permissions: {},
          expiresAt: null,
        },
      ],
      workspaceIds: [WORKSPACE_A],
      studentIds: new Set([CHILD_1]),
    };

    identityMocks.findPortalStudentProjection.mockResolvedValue({
      id: CHILD_1,
      workspaceId: WORKSPACE_A,
      firstName: "Youssef",
      lastName: "Hassan",
      grade: "Grade 10",
      enrollments: [],
    });
    identityMocks.findStudentInWorkspace.mockResolvedValue({
      id: CHILD_1,
      workspaceId: WORKSPACE_A,
    });

    await expect(
      resolvePortalStudent(studentPortalContext, CHILD_1, "parent"),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const allowedStudent = await resolvePortalStudent(
      studentPortalContext,
      CHILD_1,
      "student",
    );
    expect(allowedStudent.grant.kind).toBe("student");
  });

  it("enforces verified email matching, single-use token state, and non-staff checks on portal invitation acceptance", async () => {
    const { token } = createPortalInvitationToken();

    // 1. Mismatched signed-in email -> 403 FORBIDDEN (prevents linking by guessing or forwarding)
    sessionHelperMocks.getAuthenticatedUser.mockResolvedValue({
      id: "user-wrong-email",
      email: "intruder@example.com",
      name: "Intruder",
      emailVerified: true,
    });
    identityMocks.findUser.mockResolvedValue({
      id: "user-wrong-email",
      email: "intruder@example.com",
      name: "Intruder",
      emailVerified: true,
    });
    identityMocks.findActiveMemberships.mockResolvedValue([]);
    portalRepoMocks.findPortalInvitationByTokenHash.mockResolvedValue({
      id: "inv-1",
      workspaceId: WORKSPACE_A,
      studentId: CHILD_1,
      guardianId: null,
      kind: "parent",
      email: "invited.parent@example.com",
      permissions: {},
      status: "pending",
      expiresAt: new Date(Date.now() + 3600_000),
      lastSentAt: new Date(),
      acceptedAt: null,
      acceptedByUserId: null,
      revokedAt: null,
      createdAt: new Date(),
      workspace: {
        id: WORKSPACE_A,
        name: "Nile Academy",
        teachingName: "Mr. Ahmed",
        primarySubject: "Mathematics",
        status: "active",
        deletedAt: null,
      },
      student: {
        id: CHILD_1,
        firstName: "Youssef",
        lastName: "Hassan",
        grade: "Grade 10",
        archivedAt: null,
        mergedIntoId: null,
      },
    });

    const mismatchRes = await acceptPortalInviteRoute(
      new Request("http://localhost:3000/api/portal/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    expect(mismatchRes.status).toBe(403);
    const mismatchBody = await mismatchRes.json();
    expect(mismatchBody.error.messageKey).toBe(
      "errors.invitationEmailMismatch",
    );

    // 2. Revoked invitation -> 410 GONE
    identityMocks.findUser.mockResolvedValue({
      id: "user-invited",
      email: "invited.parent@example.com",
      name: "Invited Parent",
      emailVerified: true,
    });
    portalRepoMocks.findPortalInvitationByTokenHash.mockResolvedValueOnce({
      id: "inv-1",
      workspaceId: WORKSPACE_A,
      studentId: CHILD_1,
      guardianId: null,
      kind: "parent",
      email: "invited.parent@example.com",
      permissions: {},
      status: "revoked",
      expiresAt: new Date(Date.now() + 3600_000),
      lastSentAt: new Date(),
      acceptedAt: null,
      acceptedByUserId: null,
      revokedAt: new Date(),
      createdAt: new Date(),
      workspace: {
        id: WORKSPACE_A,
        name: "Nile Academy",
        teachingName: "Mr. Ahmed",
        primarySubject: "Mathematics",
        status: "active",
        deletedAt: null,
      },
      student: {
        id: CHILD_1,
        firstName: "Youssef",
        lastName: "Hassan",
        grade: "Grade 10",
        archivedAt: null,
        mergedIntoId: null,
      },
    });

    const revokedRes = await acceptPortalInviteRoute(
      new Request("http://localhost:3000/api/portal/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    expect(revokedRes.status).toBe(409);

    // 3. Already used invitation -> 409 CONFLICT
    portalRepoMocks.findPortalInvitationByTokenHash.mockResolvedValueOnce({
      id: "inv-1",
      workspaceId: WORKSPACE_A,
      studentId: CHILD_1,
      guardianId: null,
      kind: "parent",
      email: "invited.parent@example.com",
      permissions: {},
      status: "accepted",
      expiresAt: new Date(Date.now() + 3600_000),
      lastSentAt: new Date(),
      acceptedAt: new Date(),
      acceptedByUserId: "user-invited",
      revokedAt: null,
      createdAt: new Date(),
      workspace: {
        id: WORKSPACE_A,
        name: "Nile Academy",
        teachingName: "Mr. Ahmed",
        primarySubject: "Mathematics",
        status: "active",
        deletedAt: null,
      },
      student: {
        id: CHILD_1,
        firstName: "Youssef",
        lastName: "Hassan",
        grade: "Grade 10",
        archivedAt: null,
        mergedIntoId: null,
      },
    });

    const usedRes = await acceptPortalInviteRoute(
      new Request("http://localhost:3000/api/portal/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    expect(usedRes.status).toBe(409);
  });
});
