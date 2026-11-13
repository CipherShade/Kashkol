import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { getPortalContext, requireParentPortalContext, requireStudentPortalContext } from "@/modules/identity/session";
import {
  acceptPortalInvitation,
  getParentChildPortalView,
  getParentPortalOverview,
  getStudentPortalAccess,
  getStudentPortalOverview,
  inspectPortalInvitation,
  issuePortalInvitation,
  revokeStudentPortalGrant,
  submitStudentHomework,
  updateStudentPortalGrantPermissions,
} from "@/modules/portals";
import {
  cookieFrom,
  createStudent,
  createTestUser,
  deleteStudent,
  deleteTestUser,
  DELTA,
  NILE,
  NILE_OWNER,
  ownerScope,
  signIn,
} from "./helpers";

afterAll(async () => {
  await disconnectDb();
});

describe("parent and student portals end-to-end against PostgreSQL RLS", () => {
  it("links a verified parent to multiple children, enforces published-only grades and clean-only resources, hides private notes, and blocks unlinked/cross-tenant students", async () => {
    const parentUser = await createTestUser("parent-portal");
    const studentUser = await createTestUser("student-portal");
    const intruderUser = await createTestUser("intruder-portal");

    const child1Id = await createStudent(NILE, "Child One");
    const child2Id = await createStudent(NILE, "Child Two");
    const unlinkedSameWorkspaceId = await createStudent(NILE, "Unlinked Student");
    const foreignTenantStudentId = await createStudent(DELTA, "Foreign Tenant Student");

    const groupId = randomUUID();
    const sessionId = randomUUID();
    const publishedAssessmentId = randomUUID();
    const draftAssessmentId = randomUUID();
    const homeworkId = randomUUID();
    const cleanFileId = randomUUID();
    const teacherOnlyFileId = randomUUID();
    const pendingScanFileId = randomUUID();

    try {
      // Seed academic, attendance, file, payment, and private note records in NILE
      await withScope({ workspaceId: NILE }, async (tx) => {
        await tx.group.create({
          data: {
            id: groupId,
            workspaceId: NILE,
            name: "Grade 10 Physics",
            weekday: 1,
            startTime: new Date("1970-01-01T16:00:00.000Z"),
            teacherNote: "CONFIDENTIAL_GROUP_TEACHER_NOTE",
          },
        });

        await tx.enrollment.createMany({
          data: [
            { workspaceId: NILE, groupId, studentId: child1Id },
            { workspaceId: NILE, groupId, studentId: child2Id },
          ],
        });

        await tx.teachingSession.create({
          data: {
            id: sessionId,
            workspaceId: NILE,
            groupId,
            startsAt: new Date(Date.now() + 2 * 3600_000),
            status: "scheduled",
            notes: "CONFIDENTIAL_SESSION_NOTE",
          },
        });

        await tx.attendanceMark.create({
          data: {
            workspaceId: NILE,
            sessionId,
            studentId: child1Id,
            mark: "present",
            recordedBy: NILE_OWNER,
          },
        });

        // 1. Published assessment (lockedAt !== null) -> MUST appear
        await tx.assessment.create({
          data: {
            id: publishedAssessmentId,
            workspaceId: NILE,
            groupId,
            title: "Published Midterm",
            date: new Date("2026-10-25"),
            maxScore: 50,
            note: "CONFIDENTIAL_ASSESSMENT_NOTE",
          },
        });
        await tx.assessmentScore.create({
          data: {
            workspaceId: NILE,
            assessmentId: publishedAssessmentId,
            studentId: child1Id,
            score: 48,
            status: "graded",
            note: "CONFIDENTIAL_SCORE_NOTE",
            updatedBy: NILE_OWNER,
          },
        });
        await tx.assessment.update({
          where: { workspaceId: NILE, id: publishedAssessmentId },
          data: { lockedAt: new Date("2026-10-26T12:00:00.000Z") },
        });

        // 2. Unpublished draft assessment (lockedAt === null) -> MUST NOT appear
        await tx.assessment.create({
          data: {
            id: draftAssessmentId,
            workspaceId: NILE,
            groupId,
            title: "Unpublished Draft Quiz",
            date: new Date("2026-10-28"),
            maxScore: 20,
            lockedAt: null,
          },
        });
        await tx.assessmentScore.create({
          data: {
            workspaceId: NILE,
            assessmentId: draftAssessmentId,
            studentId: child1Id,
            score: 15,
            status: "graded",
            updatedBy: NILE_OWNER,
          },
        });

        // 3. Homework with private teacherFeedback
        await tx.homework.create({
          data: {
            id: homeworkId,
            workspaceId: NILE,
            groupId,
            title: "Chapter 3 Problems",
            instructions: "Solve problems 1 to 10",
            dueAt: new Date(Date.now() + 86400_000),
            maxScore: 10,
            status: "active",
            createdBy: NILE_OWNER,
          },
        });
        await tx.homeworkSubmission.create({
          data: {
            workspaceId: NILE,
            homeworkId,
            studentId: child1Id,
            status: "not_submitted",
            teacherFeedback: "CONFIDENTIAL_HOMEWORK_FEEDBACK",
            updatedBy: NILE_OWNER,
          },
        });

        // 4. Private student note
        await tx.studentNote.create({
          data: {
            workspaceId: NILE,
            studentId: child1Id,
            body: "CONFIDENTIAL_STUDENT_NOTE_BODY",
            authorId: NILE_OWNER,
          },
        });

        // 5. Files: one clean group file, one teacher_only file, one pending-scan file
        await tx.file.create({
          data: {
            id: cleanFileId,
            workspaceId: NILE,
            scope: "groups",
            groupId,
            title: "Clean Revision Sheet",
            storageKey: `test/${cleanFileId}.pdf`,
            sizeBytes: 2048,
            mime: "application/pdf",
            scanStatus: "clean",
            uploadedBy: NILE_OWNER,
            groupAccesses: {
              create: { groupId },
            },
          },
        });

        await tx.file.create({
          data: {
            id: teacherOnlyFileId,
            workspaceId: NILE,
            scope: "teacher_only",
            title: "Private Answer Key",
            storageKey: `test/${teacherOnlyFileId}.pdf`,
            sizeBytes: 2048,
            mime: "application/pdf",
            scanStatus: "clean",
            uploadedBy: NILE_OWNER,
          },
        });

        await tx.file.create({
          data: {
            id: pendingScanFileId,
            workspaceId: NILE,
            scope: "students",
            studentId: child1Id,
            title: "Unscanned Worksheet",
            storageKey: `test/${pendingScanFileId}.pdf`,
            sizeBytes: 2048,
            mime: "application/pdf",
            scanStatus: "pending",
            uploadedBy: NILE_OWNER,
            studentAccesses: {
              create: { studentId: child1Id },
            },
          },
        });

        // 6. Payment with internal note
        await tx.payment.create({
          data: {
            workspaceId: NILE,
            studentId: child1Id,
            period: "2026-10",
            amountMinor: 35000,
            currency: "EGP",
            method: "cash",
            paidOn: new Date("2026-10-05"),
            purpose: "October Tuition",
            note: "CONFIDENTIAL_PAYMENT_NOTE",
            createdBy: NILE_OWNER,
          },
        });
      });

      const scope = ownerScope();

      // Issue parent invitations for Child 1 and Child 2
      const inviteChild1 = await issuePortalInvitation(scope, {
        studentId: child1Id,
        kind: "parent",
        email: parentUser.email,
      });
      const token1 = inviteChild1.verificationPath.split("/").pop()!;

      const inviteChild2 = await issuePortalInvitation(scope, {
        studentId: child2Id,
        kind: "parent",
        email: parentUser.email,
      });
      const token2 = inviteChild2.verificationPath.split("/").pop()!;

      // Inspect token before acceptance -> shows first name only, no workspaceId or studentId
      const inspected = await inspectPortalInvitation(token1);
      expect(inspected.studentFirstName).toBe("Child One");
      expect(inspected).not.toHaveProperty("workspaceId");
      expect(inspected).not.toHaveProperty("studentId");

      // Intruder with different email cannot accept the parent's invitation
      await expect(
        acceptPortalInvitation(intruderUser.id, { token: token1 }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        messageKey: "errors.invitationEmailMismatch",
      });

      // Verified parent accepts both invitations
      await acceptPortalInvitation(parentUser.id, { token: token1 });
      await acceptPortalInvitation(parentUser.id, { token: token2 });

      // Re-using the single-use token is rejected
      await expect(
        acceptPortalInvitation(parentUser.id, { token: token1 }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        messageKey: "errors.invitationUsed",
      });

      // Sign in as parent to obtain session cookie & PortalContext
      const parentSignIn = await signIn(parentUser.email, parentUser.password);
      const parentHeaders = new Headers({ cookie: cookieFrom(parentSignIn) });
      const parentContext = await requireParentPortalContext(parentHeaders);

      // Parent cannot access Student Portal context
      await expect(requireStudentPortalContext(parentHeaders)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      // Parent overview returns both linked children and Child 1 detail
      const parentOverview = await getParentPortalOverview(parentContext, child1Id);
      expect(parentOverview.children.map((c) => c.studentId)).toEqual(
        expect.arrayContaining([child1Id, child2Id]),
      );
      expect(parentOverview.children).toHaveLength(2);

      const detail1 = parentOverview.activeChild;
      expect(detail1.student.id).toBe(child1Id);
      // Only published assessment appears; draft assessment is absent
      expect(detail1.grades).toHaveLength(1);
      expect(detail1.grades?.[0].assessment.title).toBe("Published Midterm");
      // Only clean shared file appears; teacher_only and pending-scan files are absent
      expect(detail1.resources).toHaveLength(1);
      expect(detail1.resources?.[0].title).toBe("Clean Revision Sheet");
      // Approved payments never appear in any portal payload (ADR-0028)
      expect(detail1).not.toHaveProperty("payments");

      // Verify zero leakage of private notes across the entire serialized payload
      const serializedParent = JSON.stringify(parentOverview);
      expect(serializedParent).not.toContain("CONFIDENTIAL_");
      expect(serializedParent).not.toContain(NILE);

      // Parent switches to Child 2 -> payments are not exposed either
      const detail2 = await getParentChildPortalView(parentContext, child2Id);
      expect(detail2.student.id).toBe(child2Id);
      expect(detail2).not.toHaveProperty("payments");

      // Parent attempting direct access to unlinked student in same workspace -> 403 FORBIDDEN
      await expect(
        getParentChildPortalView(parentContext, unlinkedSameWorkspaceId),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      // Parent attempting direct access to foreign workspace student -> 404 NOT_FOUND
      await expect(
        getParentChildPortalView(parentContext, foreignTenantStudentId),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      // Now issue & accept a Student Portal invitation for Child 1
      const studentInvite = await issuePortalInvitation(scope, {
        studentId: child1Id,
        kind: "student",
        email: studentUser.email,
      });
      const studentToken = studentInvite.verificationPath.split("/").pop()!;
      await acceptPortalInvitation(studentUser.id, { token: studentToken });

      const studentSignIn = await signIn(studentUser.email, studentUser.password);
      const studentHeaders = new Headers({ cookie: cookieFrom(studentSignIn) });
      const studentContext = await requireStudentPortalContext(studentHeaders);

      // Student cannot access Parent Portal context
      await expect(requireParentPortalContext(studentHeaders)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      const studentOverview = await getStudentPortalOverview(studentContext);
      expect(studentOverview.student.id).toBe(child1Id);
      expect(studentOverview.grades).toHaveLength(1);
      expect(studentOverview.grades?.[0].assessment.title).toBe("Published Midterm");
      expect(studentOverview.resources).toHaveLength(1);
      expect(JSON.stringify(studentOverview)).not.toContain("CONFIDENTIAL_");
      expect(studentOverview).not.toHaveProperty("payments");

      // Student submits their own homework
      const submittedHw = await submitStudentHomework(
        studentContext,
        homeworkId,
        child1Id,
      );
      expect(submittedHw.status).toBe("submitted");

      // Teacher disables showAttendance on the student grant and verifies it takes effect immediately
      const accessList = await getStudentPortalAccess(scope, child1Id);
      const activeStudentGrant = accessList.grants.find(
        (g) => g.kind === "student" && g.status === "active",
      )!;
      await updateStudentPortalGrantPermissions(
        scope,
        child1Id,
        activeStudentGrant.id,
        { permissions: { showAttendance: false } },
      );

      const refreshedStudentContext = await requireStudentPortalContext(studentHeaders);
      const updatedStudentView = await getStudentPortalOverview(refreshedStudentContext);
      expect(updatedStudentView.attendance).toBeNull();

      // Teacher revokes the student grant -> immediately invalidates sessions and blocks access
      await revokeStudentPortalGrant(scope, child1Id, activeStudentGrant.id);
      await expect(getPortalContext(studentHeaders)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    } finally {
      await withScope({ workspaceId: NILE }, async (tx) => {
        await tx.portalInvitation.deleteMany({
          where: { studentId: { in: [child1Id, child2Id] } },
        });
        await tx.portalGrant.deleteMany({
          where: { studentId: { in: [child1Id, child2Id] } },
        });
        await tx.fileGroupAccess.deleteMany({ where: { groupId } });
        await tx.fileStudentAccess.deleteMany({ where: { studentId: child1Id } });
        await tx.file.deleteMany({
          where: { id: { in: [cleanFileId, teacherOnlyFileId, pendingScanFileId] } },
        });
        // student_note has no DELETE grant for kashkol_app; skip cleanup.
        await tx.homeworkSubmission.deleteMany({ where: { homeworkId } });
        await tx.homework.deleteMany({ where: { id: homeworkId } });
        await tx.assessmentScore.deleteMany({
          where: {
            assessmentId: { in: [publishedAssessmentId, draftAssessmentId] },
          },
        });
        await tx.assessment.deleteMany({
          where: { id: { in: [publishedAssessmentId, draftAssessmentId] } },
        });
        await tx.attendanceMark.deleteMany({ where: { sessionId } });
        await tx.teachingSession.deleteMany({ where: { id: sessionId } });
        await tx.enrollment.deleteMany({ where: { groupId } });
        await tx.group.deleteMany({ where: { id: groupId } });
      });

      await deleteStudent(NILE, child1Id);
      await deleteStudent(NILE, child2Id);
      await deleteStudent(NILE, unlinkedSameWorkspaceId);
      await deleteStudent(DELTA, foreignTenantStudentId);
      await deleteTestUser(parentUser);
      await deleteTestUser(studentUser);
      await deleteTestUser(intruderUser);
    }
  });
});
