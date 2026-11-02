import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { AppError } from "@/lib/http/errors";
import { disconnectDb, getDb } from "@/lib/db/client";
import { withScope, withUserScope } from "@/lib/db/scope";
import { insertAuditEvent } from "@/modules/audit/repository";
import { writeAuditEvent } from "@/modules/audit/service";
import { findActiveMemberships, findActivePortalGrants } from "@/modules/identity/repository";
import type { PortalContext } from "@/modules/identity/session";
import { resolvePortalStudent } from "@/modules/identity/session";
import {
  createWorkspace,
  acceptInvitation,
  getWorkspaceOverview,
  listMembers,
  reactivateMember,
  removeMember,
  resolveScope,
  suspendMember,
  updateMemberPermissions,
  updateWorkspaceProfile,
} from "@/modules/tenancy/service";
import { createWorkspaceSchema, updateWorkspaceSchema } from "@/modules/tenancy/schemas";
import { createInvitationToken, hashInvitationToken } from "@/modules/tenancy/invitations";
import type { Scope } from "@/modules/tenancy/types";
import {
  assistantScope,
  createStudent,
  createTestUser,
  deleteStudent,
  deleteTestUser,
  DELTA,
  NILE,
  NILE_ASSISTANT,
  NILE_ASSISTANT_MEMBER,
  NILE_OWNER,
  NILE_OWNER_MEMBER,
  ownerScope,
} from "./helpers";

afterAll(async () => {
  await disconnectDb();
});

const NEW_OWNER_DISPLAY = "New Owner";

function inputFor(name: string) {
  return createWorkspaceSchema.parse({
    name,
    teachingName: "Test Teacher",
    primarySubject: "Mathematics",
    gradesTaught: ["Grade 10"],
    atRiskAfter: 2,
    inactiveAfter: 4,
    locale: "ar",
    theme: "system",
    timezone: "Africa/Cairo",
    currency: "EGP",
  });
}

async function ownerScopeFor(workspaceId: string, userId: string): Promise<Scope> {
  const memberships = await findActiveMemberships(userId);
  const membership = memberships.find((row) => row.workspaceId === workspaceId);
  if (!membership) throw new Error("test membership missing");
  return {
    workspaceId,
    actorUserId: userId,
    actorDisplayName: NEW_OWNER_DISPLAY,
    role: "owner",
    permissions: new Set(),
  };
}

describe("workspace creation and ownership", () => {
  it("creates the workspace, settings, owner membership, checklist, and audit atomically", async () => {
    const user = await createTestUser("workspace-owner");
    const name = `Test Workspace ${user.id.slice(0, 8)}`;

    const created = await createWorkspace(
      { userId: user.id, displayName: NEW_OWNER_DISPLAY },
      inputFor(name),
      { requestId: "test-workspace-create" },
    );

    const [workspace, settings, membership, tasks, audit] = await Promise.all([
      withScope({ workspaceId: created.workspaceId }, (tx) =>
        tx.workspace.findFirst({ where: { id: created.workspaceId } }),
      ),
      withScope({ workspaceId: created.workspaceId }, (tx) =>
        tx.workspaceSettings.findUnique({ where: { workspaceId: created.workspaceId } }),
      ),
      withScope({ workspaceId: created.workspaceId }, (tx) =>
        tx.workspaceMember.findFirst({
          where: { workspaceId: created.workspaceId, userId: user.id },
        }),
      ),
      withScope({ workspaceId: created.workspaceId }, (tx) =>
        tx.onboardingTask.findMany({ where: { workspaceId: created.workspaceId } }),
      ),
      withScope({ workspaceId: created.workspaceId }, (tx) =>
        tx.auditEvent.findFirst({
          where: { workspaceId: created.workspaceId, action: "workspace.created" },
        }),
      ),
    ]);

    expect(workspace?.name).toBe(name);
    expect(settings?.timezone).toBe("Africa/Cairo");
    expect(settings?.atRiskAfter).toBe(2);
    expect(membership?.role).toBe("owner");
    expect(tasks).toHaveLength(4);
    expect(audit?.actorDisplayName).toBe(NEW_OWNER_DISPLAY);

    const memberships = await findActiveMemberships(user.id);
    expect(memberships.map((row) => row.workspaceId)).toContain(created.workspaceId);

    await expect(
      createWorkspace({ userId: user.id, displayName: NEW_OWNER_DISPLAY }, inputFor("Again")),
    ).rejects.toThrow(AppError);
  });

  it("derives the owner scope from the session membership, not from input", async () => {
    const user = await createTestUser("scope-owner");
    const created = await createWorkspace(
      { userId: user.id, displayName: NEW_OWNER_DISPLAY },
      inputFor(`Scope Workspace ${user.id.slice(0, 8)}`),
    );
    const scope = await ownerScopeFor(created.workspaceId, user.id);

    const overview = await getWorkspaceOverview(scope);
    expect(overview.workspace.id).toBe(created.workspaceId);

    const updated = await updateWorkspaceProfile(
      scope,
      updateWorkspaceSchema.parse({
        ...inputFor(overview.workspace.name),
        name: `${overview.workspace.name} Updated`,
        inactiveAfter: 5,
      }),
      { requestId: "test-update" },
    );
    expect(updated.workspace.name).toContain("Updated");
    expect(updated.settings.inactiveAfter).toBe(5);

    const audit = await withScope({ workspaceId: created.workspaceId }, (tx) =>
      tx.auditEvent.findFirst({
        where: { workspaceId: created.workspaceId, action: "settings.updated" },
      }),
    );
    expect(audit).not.toBeNull();
  });
});

describe("cross-tenant isolation on the core domain tables", () => {
  it("cannot read or mutate another workspace's student", async () => {
    const studentA = await createStudent(NILE, "Tenant A Student");
    const studentB = await createStudent(DELTA, "Tenant B Student");
    try {
      const crossRead = await withScope({ workspaceId: NILE }, (tx) =>
        tx.student.findFirst({ where: { id: studentB } }),
      );
      expect(crossRead).toBeNull();

      await expect(
        withScope({ workspaceId: NILE }, (tx) =>
          tx.student.update({ where: { id: studentB }, data: { firstName: "Hacked" } }),
        ),
      ).rejects.toThrow();

      const untouched = await withScope({ workspaceId: DELTA }, (tx) =>
        tx.student.findFirst({ where: { id: studentB } }),
      );
      expect(untouched?.firstName).toBe("Tenant B Student");
    } finally {
      await deleteStudent(NILE, studentA);
      await deleteStudent(DELTA, studentB);
    }
  });

  it("rejects a payment that points at another workspace's student", async () => {
    const foreignStudent = await createStudent(DELTA, "Foreign Student");
    try {
      await expect(
        withScope({ workspaceId: NILE }, (tx) =>
          tx.payment.create({
            data: {
              workspaceId: NILE,
              studentId: foreignStudent,
              period: "2026-10",
              amountMinor: 50_000,
              currency: "EGP",
              method: "cash",
              paidOn: new Date("2026-10-01T00:00:00.000Z"),
              createdBy: NILE_OWNER,
            },
          }),
        ),
      ).rejects.toThrow();
    } finally {
      await deleteStudent(DELTA, foreignStudent);
    }
  });

  it("writes and reads the full domain chain inside one tenant only", async () => {
    const studentId = await createStudent(NILE, "Domain Student");
    const subjectId = randomUUID();
    const groupId = randomUUID();
    const sessionId = randomUUID();
    const assessmentId = randomUUID();
    const fileId = randomUUID();

    try {
      await withScope({ workspaceId: NILE }, async (tx) => {
        await tx.subject.create({
          data: { id: subjectId, workspaceId: NILE, name: "رياضيات" },
        });
        await tx.group.create({
          data: {
            id: groupId,
            workspaceId: NILE,
            subjectId,
            name: "Group A",
            weekday: 6,
            startTime: new Date("1970-01-01T16:00:00.000Z"),
            endTime: new Date("1970-01-01T18:00:00.000Z"),
            color: "indigo",
          },
        });
        await tx.enrollment.create({
          data: { workspaceId: NILE, groupId, studentId },
        });
        await tx.teachingSession.create({
          data: {
            id: sessionId,
            workspaceId: NILE,
            groupId,
            startsAt: new Date("2026-11-01T16:00:00.000Z"),
            endsAt: new Date("2026-11-01T18:00:00.000Z"),
          },
        });
        await tx.attendanceMark.create({
          data: {
            workspaceId: NILE,
            sessionId,
            studentId,
            mark: "present",
            recordedBy: NILE_OWNER,
          },
        });
        await tx.assessment.create({
          data: {
            id: assessmentId,
            workspaceId: NILE,
            groupId,
            title: "Quiz 1",
            date: new Date("2026-11-02T00:00:00.000Z"),
            maxScore: 100,
          },
        });
        await tx.assessmentScore.create({
          data: {
            workspaceId: NILE,
            assessmentId,
            studentId,
            score: 85,
            status: "graded",
            updatedBy: NILE_OWNER,
          },
        });
        await tx.payment.create({
          data: {
            workspaceId: NILE,
            studentId,
            period: "2026-10",
            amountMinor: 50_000,
            currency: "EGP",
            method: "cash",
            paidOn: new Date("2026-10-01T00:00:00.000Z"),
            createdBy: NILE_OWNER,
          },
        });
        await tx.file.create({
          data: {
            id: fileId,
            workspaceId: NILE,
            scope: "students",
            studentId,
            title: "worksheet",
            storageKey: `ws/${NILE}/${randomUUID()}.pdf`,
            sizeBytes: 1024,
            mime: "application/pdf",
            uploadedBy: NILE_OWNER,
          },
        });
      });

      const counts = await withScope({ workspaceId: DELTA }, async (tx) => ({
        subjects: await tx.subject.count({ where: { id: subjectId } }),
        groups: await tx.group.count({ where: { id: groupId } }),
        sessions: await tx.teachingSession.count({ where: { id: sessionId } }),
        assessments: await tx.assessment.count({ where: { id: assessmentId } }),
        files: await tx.file.count({ where: { id: fileId } }),
      }));
      expect(counts).toEqual({
        subjects: 0,
        groups: 0,
        sessions: 0,
        assessments: 0,
        files: 0,
      });

      const ownCounts = await withScope({ workspaceId: NILE }, async (tx) => ({
        marks: await tx.attendanceMark.count({ where: { studentId } }),
        scores: await tx.assessmentScore.count({ where: { studentId } }),
        payments: await tx.payment.count({ where: { studentId } }),
        files: await tx.file.count({ where: { studentId } }),
      }));
      expect(ownCounts).toEqual({ marks: 1, scores: 1, payments: 1, files: 1 });
    } finally {
      await withScope({ workspaceId: NILE }, async (tx) => {
        await tx.file.deleteMany({ where: { workspaceId: NILE, studentId } });
        // Payments are append-only; do not attempt to delete.
        await tx.assessmentScore.deleteMany({ where: { workspaceId: NILE, studentId } });
        await tx.attendanceMark.deleteMany({ where: { workspaceId: NILE, studentId } });
        await tx.assessment.deleteMany({ where: { workspaceId: NILE, id: assessmentId } });
        await tx.teachingSession.deleteMany({ where: { workspaceId: NILE, id: sessionId } });
        await tx.enrollment.deleteMany({ where: { workspaceId: NILE, studentId } });
        await tx.group.deleteMany({ where: { workspaceId: NILE, id: groupId } });
        await tx.subject.deleteMany({ where: { workspaceId: NILE, id: subjectId } });
      });
      await deleteStudent(NILE, studentId);
    }
  });
});

describe("Arabic search", () => {
  it("folds diacritics and alef variants for name search and has trigram GIN indexes", async () => {
    const withDiacritics = await createStudent(NILE, "أَحْمَد", "عبد الرحمن");
    const withoutDiacritics = await createStudent(NILE, "احمد", "محمود");
    try {
      const rows = await withScope(
        { workspaceId: NILE },
        (tx) =>
          tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "student"
          WHERE "workspace_id" = ${NILE}::uuid
            AND "search_key" LIKE '%' || "normalize_arabic"(${"أحمد"}) || '%'
          ORDER BY "id"
        `,
      );
      const ids = rows.map((row) => row.id);
      expect(ids).toContain(withDiacritics);
      expect(ids).toContain(withoutDiacritics);

      const phonetic = await withScope(
        { workspaceId: NILE },
        (tx) =>
          tx.$queryRaw<Array<{ normalized: string; phonetic: string }>>`
          SELECT "normalize_arabic"(${"أَحْمَد"}) AS normalized,
                 "phonetic_arabic"(${"أَحْمَد"}) AS phonetic
        `,
      );
      expect(phonetic[0]?.normalized).toBe("احمد");
      expect(phonetic[0]?.phonetic).toBe("اهمد");

      const indexes = await getDb().$queryRaw<Array<{ indexname: string }>>`
        SELECT "indexname" FROM "pg_indexes"
        WHERE "schemaname" = 'public' AND "indexname" LIKE '%trgm%'
      `;
      const names = indexes.map((row) => row.indexname);
      expect(names).toContain("student_search_key_trgm_idx");
      expect(names).toContain("subject_phonetic_key_trgm_idx");
      expect(names).toContain("group_search_key_trgm_idx");
    } finally {
      await deleteStudent(NILE, withDiacritics);
      await deleteStudent(NILE, withoutDiacritics);
    }
  });
});

describe("assistant and owner-only authorisation", () => {
  it("denies owner-only operations to an assistant even with an over-granted scope", async () => {
    const assistant = await assistantScope();

    await expect(listMembers(assistant)).rejects.toThrow(AppError);
    await expect(
      updateMemberPermissions(assistant, NILE_ASSISTANT_MEMBER, [
        { resource: "students", action: "read" },
      ]),
    ).rejects.toThrow(AppError);
    await expect(removeMember(assistant, NILE_ASSISTANT_MEMBER)).rejects.toThrow(AppError);
  });

  describe("assistant invitation acceptance", () => {
    it("binds a verified invited email to one workspace and consumes the invitation once", async () => {
      const invitee = await createTestUser("invitation-accept");
      const invitationId = randomUUID();
      const token = createInvitationToken();
      try {
        await withScope({ workspaceId: NILE }, (tx) =>
          tx.workspaceInvitation.create({
            data: {
              id: invitationId,
              workspaceId: NILE,
              email: invitee.email,
              role: "assistant",
              grants: [{ resource: "students", action: "read" }],
              tokenHash: hashInvitationToken(token),
              status: "pending",
              invitedByUserId: NILE_OWNER,
              expiresAt: new Date(Date.now() + 60_000),
              lastSentAt: new Date(),
            },
          }),
        );

        const accepted = await acceptInvitation(
          {
            userId: invitee.id,
            email: invitee.email,
            displayName: "Verified Invitee",
            emailVerified: true,
          },
          token,
          { requestId: "test-invitation-accepted" },
        );
        expect(accepted.workspaceId).toBe(NILE);

        const member = await withScope({ workspaceId: NILE }, async (tx) => ({
          member: await tx.workspaceMember.findFirst({
            where: { workspaceId: NILE, userId: invitee.id },
            select: { id: true, role: true, status: true },
          }),
          invitation: await tx.workspaceInvitation.findUnique({
            where: { id: invitationId },
            select: { status: true },
          }),
        }));
        expect(member.member).toMatchObject({ role: "assistant", status: "active" });
        expect(member.invitation?.status).toBe("accepted");
        await expect(
          acceptInvitation(
            {
              userId: invitee.id,
              email: invitee.email,
              displayName: "Verified Invitee",
              emailVerified: true,
            },
            token,
          ),
        ).rejects.toMatchObject({ messageKey: "team.errors.invitationUsed" });

        const audit = await withScope({ workspaceId: NILE }, (tx) =>
          tx.auditEvent.findFirst({
            where: { action: "team.invitation_accepted", requestId: "test-invitation-accepted" },
          }),
        );
        expect(audit?.actorDisplayName).toBe("Verified Invitee");
      } finally {
        await withScope({ workspaceId: NILE }, async (tx) => {
          const member = await tx.workspaceMember.findFirst({
            where: { workspaceId: NILE, userId: invitee.id },
            select: { id: true },
          });
          if (member) {
            await tx.permissionGrant.deleteMany({ where: { workspaceId: NILE, memberId: member.id } });
            await tx.workspaceMember.deleteMany({ where: { workspaceId: NILE, id: member.id } });
          }
          await tx.workspaceInvitation.deleteMany({
            where: { workspaceId: NILE, id: invitationId },
          });
        });
        await deleteTestUser(invitee);
      }
    });

    it("rejects expired, unverified, mismatched-email, and cross-workspace acceptance", async () => {
      const invitee = await createTestUser("invitation-invalid");
      const expiredId = randomUUID();
      const foreignId = randomUUID();
      const expiredToken = createInvitationToken();
      const foreignToken = createInvitationToken();
      try {
        await withScope({ workspaceId: NILE }, async (tx) => {
          await tx.workspaceInvitation.create({
            data: {
              id: expiredId,
              workspaceId: NILE,
              email: invitee.email,
              role: "assistant",
              tokenHash: hashInvitationToken(expiredToken),
              status: "pending",
              invitedByUserId: NILE_OWNER,
              expiresAt: new Date(Date.now() - 1),
              lastSentAt: new Date(Date.now() - 60_000),
            },
          });
          await tx.workspaceInvitation.create({
            data: {
              id: foreignId,
              workspaceId: NILE,
              email: invitee.email,
              role: "assistant",
              tokenHash: hashInvitationToken(foreignToken),
              status: "pending",
              invitedByUserId: NILE_OWNER,
              expiresAt: new Date(Date.now() + 60_000),
              lastSentAt: new Date(),
            },
          });
        });
        await withScope({ workspaceId: DELTA }, (tx) =>
          tx.workspaceMember.create({
            data: {
              workspaceId: DELTA,
              userId: invitee.id,
              role: "assistant",
              status: "active",
            },
          }),
        );

        await expect(
          acceptInvitation(
            {
              userId: invitee.id,
              email: invitee.email,
              displayName: "Invitee",
              emailVerified: true,
            },
            expiredToken,
          ),
        ).rejects.toMatchObject({ messageKey: "team.errors.invitationExpired" });
        await expect(
          acceptInvitation(
            {
              userId: invitee.id,
              email: "someone-else@kashkol.test",
              displayName: "Invitee",
              emailVerified: true,
            },
            foreignToken,
          ),
        ).rejects.toMatchObject({ messageKey: "team.errors.invitationEmailMismatch" });
        await expect(
          acceptInvitation(
            {
              userId: invitee.id,
              email: invitee.email,
              displayName: "Invitee",
              emailVerified: false,
            },
            foreignToken,
          ),
        ).rejects.toMatchObject({ messageKey: "errors.emailNotVerified" });
        await expect(
          acceptInvitation(
            {
              userId: invitee.id,
              email: invitee.email,
              displayName: "Invitee",
              emailVerified: true,
            },
            foreignToken,
          ),
        ).rejects.toMatchObject({ messageKey: "team.errors.activeWorkspace" });
      } finally {
        await withScope({ workspaceId: NILE }, (tx) =>
          tx.workspaceInvitation.deleteMany({
            where: { workspaceId: NILE, id: { in: [expiredId, foreignId] } },
          }),
        );
        await withScope({ workspaceId: DELTA }, (tx) =>
          tx.workspaceMember.deleteMany({ where: { workspaceId: DELTA, userId: invitee.id } }),
        );
        await deleteTestUser(invitee);
      }
    });
  });

  it("lets an assistant hold settings:write but never team:write", async () => {
    const owner = ownerScope();
    const original = await withScope({ workspaceId: NILE }, (tx) =>
      tx.permissionGrant.findMany({
        where: { workspaceId: NILE, memberId: NILE_ASSISTANT_MEMBER },
        select: { resource: true, action: true },
      }),
    );

    try {
      await expect(
        updateMemberPermissions(owner, NILE_ASSISTANT_MEMBER, [
          { resource: "team", action: "write" },
        ]),
      ).rejects.toThrow(AppError);

      await updateMemberPermissions(
        owner,
        NILE_ASSISTANT_MEMBER,
        [...original, { resource: "settings", action: "write" }],
        { requestId: "test-grant" },
      );

      const audit = await withScope({ workspaceId: NILE }, (tx) =>
        tx.auditEvent.findFirst({
          where: { workspaceId: NILE, action: "team.permissions_changed" },
          orderBy: { createdAt: "desc" },
        }),
      );
      expect(audit).not.toBeNull();

      const assistant = await assistantScope();
      const before = await getWorkspaceOverview(owner);
      const updated = await updateWorkspaceProfile(
        assistant,
        updateWorkspaceSchema.parse({
          ...inputFor(before.workspace.name),
          teachingName: before.workspace.teachingName,
          primarySubject: before.workspace.primarySubject ?? undefined,
          gradesTaught: before.workspace.gradesTaught,
          atRiskAfter: before.settings.atRiskAfter,
          inactiveAfter: before.settings.inactiveAfter,
          locale: before.settings.locale,
          theme: before.settings.theme,
          timezone: before.settings.timezone,
          currency: before.settings.currency,
          name: before.workspace.name,
        }),
        { requestId: "test-assistant-settings" },
      );
      expect(updated.workspace.id).toBe(NILE);
    } finally {
      await updateMemberPermissions(owner, NILE_ASSISTANT_MEMBER, original);
    }
  });

  it("removes an assistant within the transaction, revokes their sessions, and audits it", async () => {
    const memberUser = await createTestUser("removed-assistant");
    const memberId = randomUUID();
    try {
      await withScope({ workspaceId: NILE }, async (tx) => {
        await tx.workspaceMember.create({
          data: {
            id: memberId,
            workspaceId: NILE,
            userId: memberUser.id,
            role: "assistant",
            status: "active",
          },
        });
        await tx.permissionGrant.create({
          data: {
            workspaceId: NILE,
            memberId,
            resource: "students",
            action: "read",
          },
        });
      });
      await getDb().session.create({
        data: {
          id: randomUUID(),
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
          userId: memberUser.id,
        },
      });

      await removeMember(ownerScope(), memberId, { requestId: "test-remove-member" });

      const member = await withScope({ workspaceId: NILE }, (tx) =>
        tx.workspaceMember.findUnique({ where: { id: memberId } }),
      );
      expect(member?.status).toBe("removed");
      expect(await getDb().session.count({ where: { userId: memberUser.id } })).toBe(0);
      await expect(resolveScope(memberUser.id, NILE)).rejects.toThrow(AppError);

      const audit = await withScope({ workspaceId: NILE }, (tx) =>
        tx.auditEvent.findFirst({
          where: {
            workspaceId: NILE,
            action: "team.member_removed",
            requestId: "test-remove-member",
          },
        }),
      );
      expect(audit).not.toBeNull();
    } finally {
      await withScope({ workspaceId: NILE }, (tx) =>
        tx.permissionGrant.deleteMany({ where: { workspaceId: NILE, memberId } }),
      );
      await withScope({ workspaceId: NILE }, (tx) =>
        tx.workspaceMember.deleteMany({ where: { workspaceId: NILE, id: memberId } }),
      );
      await deleteTestUser(memberUser);
    }
  });

  it("suspends and reactivates an assistant while revoking sessions immediately", async () => {
    const memberUser = await createTestUser("suspended-assistant");
    const memberId = randomUUID();
    try {
      await withScope({ workspaceId: NILE }, async (tx) => {
        await tx.workspaceMember.create({
          data: {
            id: memberId,
            workspaceId: NILE,
            userId: memberUser.id,
            role: "assistant",
            status: "active",
          },
        });
        await tx.permissionGrant.create({
          data: {
            workspaceId: NILE,
            memberId,
            resource: "students",
            action: "read",
          },
        });
      });
      await getDb().session.create({
        data: {
          id: randomUUID(),
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
          userId: memberUser.id,
        },
      });

      await suspendMember(ownerScope(), memberId, { requestId: "test-suspend-member" });
      const suspendedMemberships = await findActiveMemberships(memberUser.id);
      expect(suspendedMemberships).toHaveLength(0);
      expect(await getDb().session.count({ where: { userId: memberUser.id } })).toBe(0);
      await expect(resolveScope(memberUser.id, NILE)).rejects.toThrow(AppError);

      await reactivateMember(ownerScope(), memberId, { requestId: "test-reactivate-member" });
      await expect(resolveScope(memberUser.id, NILE)).resolves.toMatchObject({ role: "assistant" });
    } finally {
      await withScope({ workspaceId: NILE }, async (tx) => {
        await tx.permissionGrant.deleteMany({ where: { workspaceId: NILE, memberId } });
        await tx.workspaceMember.deleteMany({ where: { workspaceId: NILE, id: memberId } });
      });
      await deleteTestUser(memberUser);
    }
  });

  it("refuses to change or remove the owner, and the self policy hides other members", async () => {
    const owner = ownerScope();
    await expect(
      updateMemberPermissions(owner, NILE_OWNER_MEMBER, [{ resource: "students", action: "read" }]),
    ).rejects.toThrow(AppError);
    await expect(removeMember(owner, NILE_OWNER_MEMBER)).rejects.toThrow(AppError);
    await expect(
      withUserScope(NILE_ASSISTANT, (tx) =>
        tx.workspaceMember.findMany({ where: { userId: NILE_OWNER } }),
      ),
    ).resolves.toHaveLength(0);
  });
});

describe("portal links and scoped access", () => {
  it("lets a parent reach only the linked student and never the workspace", async () => {
    const parent = await createTestUser("parent");
    const linkedStudent = await createStudent(NILE, "Linked Child");
    const otherStudent = await createStudent(NILE, "Other Child");
    const grantId = randomUUID();

    try {
      await withScope({ workspaceId: NILE }, (tx) =>
        tx.portalGrant.create({
          data: {
            id: grantId,
            workspaceId: NILE,
            portalUserId: parent.id,
            studentId: linkedStudent,
            kind: "parent",
            issuedBy: NILE_OWNER,
          },
        }),
      );

      const grants = await findActivePortalGrants(parent.id, new Date());
      expect(grants).toHaveLength(1);
      expect(grants[0]?.studentId).toBe(linkedStudent);

      const portal: PortalContext = {
        userId: parent.id,
        grants,
        workspaceIds: [...new Set(grants.map((grant) => grant.workspaceId))],
        studentIds: new Set(grants.map((grant) => grant.studentId)),
      };

      const own = await resolvePortalStudent(portal, linkedStudent);
      expect(own.student.id).toBe(linkedStudent);

      await expect(resolvePortalStudent(portal, otherStudent)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(resolvePortalStudent(portal, randomUUID())).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      // A portal-only account has no staff membership, and cannot manufacture
      // a staff scope from the linked workspace id.
      expect(await findActiveMemberships(parent.id)).toHaveLength(0);
      const forgedScope: Scope = {
        workspaceId: NILE,
        actorUserId: parent.id,
        actorDisplayName: "Parent",
        role: "assistant",
        permissions: new Set(),
      };
      await expect(getWorkspaceOverview(forgedScope)).rejects.toThrow(AppError);
      await expect(
        updateWorkspaceProfile(forgedScope, updateWorkspaceSchema.parse(inputFor("Hijacked"))),
      ).rejects.toThrow(AppError);
    } finally {
      await withScope({ workspaceId: NILE }, (tx) =>
        tx.portalGrant.deleteMany({ where: { workspaceId: NILE, portalUserId: parent.id } }),
      );
      await deleteStudent(NILE, linkedStudent);
      await deleteStudent(NILE, otherStudent);
      await deleteTestUser(parent);
    }
  });

  it("does not expose portal grants to another user's user scope", async () => {
    const portalUser = await createTestUser("portal");
    const student = await createStudent(NILE, "Portal Child");
    try {
      await withScope({ workspaceId: NILE }, (tx) =>
        tx.portalGrant.create({
          data: {
            workspaceId: NILE,
            portalUserId: portalUser.id,
            studentId: student,
            kind: "student",
            issuedBy: NILE_OWNER,
          },
        }),
      );
      await expect(findActivePortalGrants(portalUser.id, new Date())).resolves.toHaveLength(1);
      await expect(findActivePortalGrants(NILE_OWNER, new Date())).resolves.toHaveLength(0);
    } finally {
      await withScope({ workspaceId: NILE }, (tx) =>
        tx.portalGrant.deleteMany({ where: { workspaceId: NILE, portalUserId: portalUser.id } }),
      );
      await deleteStudent(NILE, student);
      await deleteTestUser(portalUser);
    }
  });
});

describe("audit infrastructure", () => {
  it("rolls the mutation back when the audit insert fails", async () => {
    const studentId = randomUUID();
    await expect(
      withScope({ workspaceId: NILE }, async (tx) => {
        await tx.student.create({
          data: { id: studentId, workspaceId: NILE, firstName: "Rollback", lastName: "Test" },
        });
        await insertAuditEvent(tx, {
          workspaceId: NILE,
          actorUserId: NILE_OWNER,
          actorDisplayName: "Owner",
          actorType: "user",
          entityType: "student",
          entityId: studentId,
          action: "",
          requestId: "test-atomicity",
          ipHash: null,
        });
      }),
    ).rejects.toThrow();

    const rolledBack = await withScope({ workspaceId: NILE }, (tx) =>
      tx.student.findUnique({ where: { id: studentId } }),
    );
    expect(rolledBack).toBeNull();
  });

  it("redacts credentials, contact data, and note bodies from the stored diff", async () => {
    const requestId = `test-redaction-${Date.now()}`;
    await withScope({ workspaceId: NILE }, (tx) =>
      writeAuditEvent(tx, {
        workspaceId: NILE,
        actorUserId: NILE_OWNER,
        actorDisplayName: "Owner",
        actorType: "user",
        entityType: "student",
        entityId: randomUUID(),
        action: "test.redaction",
        requestId,
        diff: {
          firstName: "Visible",
          password: "KashkolDev!2026",
          resetToken: "token-value",
          email: "parent@example.com",
          phone: "+201234567890",
          note: "private note body",
        },
      }),
    );

    const event = await withScope({ workspaceId: NILE }, (tx) =>
      tx.auditEvent.findFirst({ where: { workspaceId: NILE, requestId } }),
    );
    const serialised = JSON.stringify(event?.diff);
    expect(serialised).toContain("Visible");
    expect(serialised).not.toContain("KashkolDev!2026");
    expect(serialised).not.toContain("token-value");
    expect(serialised).not.toContain("parent@example.com");
    expect(serialised).not.toContain("+201234567890");
    expect(serialised).not.toContain("private note body");
  });

  it("keeps the revision chain append-only for the application role", async () => {
    const markId = randomUUID();
    const revisionId = randomUUID();
    const studentId = await createStudent(NILE, "Revision Student");
    const groupId = randomUUID();
    const sessionId = randomUUID();

    // The revision row is intentionally not deleted: the application role has
    // no DELETE privilege on the chain, which is the property under test.
    await withScope({ workspaceId: NILE }, async (tx) => {
      await tx.group.create({
        data: {
          id: groupId,
          workspaceId: NILE,
          name: "Revision Group",
          weekday: 0,
          startTime: new Date("1970-01-01T10:00:00.000Z"),
          color: "indigo",
        },
      });
      await tx.teachingSession.create({
        data: {
          id: sessionId,
          workspaceId: NILE,
          groupId,
          startsAt: new Date("2026-11-03T10:00:00.000Z"),
        },
      });
      await tx.attendanceMark.create({
        data: {
          id: markId,
          workspaceId: NILE,
          sessionId,
          studentId,
          mark: "absent",
          recordedBy: NILE_OWNER,
        },
      });
      await tx.attendanceRevision.create({
        data: {
          id: revisionId,
          workspaceId: NILE,
          sessionId,
          studentId,
          attendanceMarkId: markId,
          newMark: "present",
          actorId: NILE_OWNER,
        },
      });
    });

    await expect(
      withScope({ workspaceId: NILE }, (tx) =>
        tx.attendanceRevision.update({
          where: { id: revisionId },
          data: { reason: "changed" },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withScope({ workspaceId: NILE }, (tx) =>
        tx.attendanceRevision.delete({ where: { id: revisionId } }),
      ),
    ).rejects.toThrow();
  });
});
