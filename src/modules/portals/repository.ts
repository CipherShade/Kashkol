import type { Prisma } from "@/generated/prisma/client";
import { withPortalInvitationScope, withScope } from "@/lib/db/scope";
import { newUuidV7 } from "@/lib/id";
import type { PortalGrantRow } from "@/modules/identity/repository";
import {
  calculateStudentBalances,
  currentMonthInTimezone,
} from "@/modules/payments/calculations";
import type { Scope } from "@/modules/tenancy/types";
import type {
  PortalPermissions,
  UpdatePushPreferenceInput,
  UpsertPushSubscriptionInput,
} from "./schemas";
import { resolvePortalPermissions } from "./tokens";

export async function findStudentForPortalAccess(scope: Scope, studentId: string) {
  return withScope(scope, (tx) =>
    tx.student.findFirst({
      where: {
        id: studentId,
        workspaceId: scope.workspaceId,
        archivedAt: null,
        mergedIntoId: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        grade: true,
        parentName: true,
        parentPhoneE164: true,
        guardians: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            relation: true,
            phoneE164: true,
            email: true,
            isPrimary: true,
            isAuthorized: true,
          },
        },
        portalGrants: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            portalUserId: true,
            guardianId: true,
            kind: true,
            permissions: true,
            issuedAt: true,
            expiresAt: true,
            revokedAt: true,
            portalUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        portalInvitations: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            guardianId: true,
            kind: true,
            email: true,
            permissions: true,
            status: true,
            expiresAt: true,
            lastSentAt: true,
            acceptedAt: true,
            revokedAt: true,
            createdAt: true,
          },
        },
      },
    }),
  );
}

export async function findPortalInvitationByTokenHash(tokenHash: string) {
  const invitation = await withPortalInvitationScope(tokenHash, (tx) =>
    tx.portalInvitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        workspaceId: true,
        studentId: true,
        guardianId: true,
        kind: true,
        email: true,
        permissions: true,
        status: true,
        issuedByUserId: true,
        expiresAt: true,
        lastSentAt: true,
        acceptedAt: true,
        acceptedByUserId: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
  );

  if (!invitation) {
    return invitation;
  }

  const workspace = await withScope({ workspaceId: invitation.workspaceId }, (tx) =>
    tx.workspace.findFirst({
      where: { id: invitation.workspaceId },
      select: {
        id: true,
        name: true,
        teachingName: true,
        primarySubject: true,
        status: true,
        deletedAt: true,
      },
    }),
  );

  const student = await withScope({ workspaceId: invitation.workspaceId }, (tx) =>
    tx.student.findFirst({
      where: { id: invitation.studentId, archivedAt: null, mergedIntoId: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        grade: true,
        archivedAt: true,
        mergedIntoId: true,
      },
    }),
  );

  return { ...invitation, workspace, student };
}

export async function createOrRotatePortalInvitationTx(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    studentId: string;
    guardianId: string | null;
    kind: "parent" | "student";
    email: string;
    permissions: PortalPermissions;
    tokenHash: string;
    issuedByUserId: string;
    expiresAt: Date;
    now: Date;
  },
) {
  const existingPending = await tx.portalInvitation.findFirst({
    where: {
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      kind: input.kind,
      email: input.email,
      status: "pending",
      revokedAt: null,
    },
    select: { id: true, lastSentAt: true },
  });

  if (existingPending) {
    return tx.portalInvitation.update({
      where: { id: existingPending.id },
      data: {
        guardianId: input.guardianId,
        permissions: input.permissions,
        tokenHash: input.tokenHash,
        issuedByUserId: input.issuedByUserId,
        expiresAt: input.expiresAt,
        lastSentAt: input.now,
      },
      select: {
        id: true,
        studentId: true,
        guardianId: true,
        kind: true,
        email: true,
        permissions: true,
        status: true,
        expiresAt: true,
        lastSentAt: true,
      },
    });
  }

  return tx.portalInvitation.create({
    data: {
      id: newUuidV7(),
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      guardianId: input.guardianId,
      kind: input.kind,
      email: input.email,
      permissions: input.permissions,
      tokenHash: input.tokenHash,
      status: "pending",
      issuedByUserId: input.issuedByUserId,
      expiresAt: input.expiresAt,
      lastSentAt: input.now,
    },
    select: {
      id: true,
      studentId: true,
      guardianId: true,
      kind: true,
      email: true,
      permissions: true,
      status: true,
      expiresAt: true,
      lastSentAt: true,
    },
  });
}

export async function revokePortalInvitationTx(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    studentId: string;
    invitationId: string;
    now: Date;
  },
) {
  const existing = await tx.portalInvitation.findFirst({
    where: {
      id: input.invitationId,
      workspaceId: input.workspaceId,
      studentId: input.studentId,
    },
    select: {
      id: true,
      status: true,
      kind: true,
      email: true,
    },
  });

  if (!existing) return null;

  return tx.portalInvitation.update({
    where: { id: existing.id },
    data: {
      status: "revoked",
      revokedAt: input.now,
    },
    select: {
      id: true,
      status: true,
      kind: true,
      revokedAt: true,
    },
  });
}

export async function acceptPortalInvitationTx(
  tx: Prisma.TransactionClient,
  input: {
    invitationId: string;
    workspaceId: string;
    studentId: string;
    guardianId: string | null;
    kind: "parent" | "student";
    portalUserId: string;
    permissions: PortalPermissions;
    issuedByUserId: string;
    now: Date;
  },
) {
  await tx.portalInvitation.update({
    where: { id: input.invitationId },
    data: {
      status: "accepted",
      acceptedAt: input.now,
      acceptedByUserId: input.portalUserId,
    },
  });

  const existingGrant = await tx.portalGrant.findUnique({
    where: {
      portalUserId_studentId_kind: {
        portalUserId: input.portalUserId,
        studentId: input.studentId,
        kind: input.kind,
      },
    },
    select: { id: true },
  });

  if (existingGrant) {
    return tx.portalGrant.update({
      where: { id: existingGrant.id },
      data: {
        guardianId: input.guardianId,
        permissions: input.permissions,
        issuedBy: input.issuedByUserId,
        issuedAt: input.now,
        revokedAt: null,
        expiresAt: null,
      },
      select: {
        id: true,
        workspaceId: true,
        studentId: true,
        guardianId: true,
        kind: true,
        permissions: true,
      },
    });
  }

  return tx.portalGrant.create({
    data: {
      id: newUuidV7(),
      workspaceId: input.workspaceId,
      portalUserId: input.portalUserId,
      studentId: input.studentId,
      guardianId: input.guardianId,
      kind: input.kind,
      permissions: input.permissions,
      issuedBy: input.issuedByUserId,
      issuedAt: input.now,
    },
    select: {
      id: true,
      workspaceId: true,
      studentId: true,
      guardianId: true,
      kind: true,
      permissions: true,
    },
  });
}

export async function updatePortalGrantPermissionsTx(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    studentId: string;
    grantId: string;
    permissions: PortalPermissions;
  },
) {
  const existing = await tx.portalGrant.findFirst({
    where: {
      id: input.grantId,
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      revokedAt: null,
    },
    select: {
      id: true,
      kind: true,
      permissions: true,
    },
  });
  if (!existing) return null;

  const resolved = resolvePortalPermissions(existing.kind, {
    ...(existing.permissions && typeof existing.permissions === "object"
      ? (existing.permissions as Record<string, unknown>)
      : {}),
    ...input.permissions,
  });

  return tx.portalGrant.update({
    where: { id: existing.id },
    data: { permissions: resolved },
    select: {
      id: true,
      kind: true,
      permissions: true,
      portalUserId: true,
    },
  });
}

export async function revokePortalGrantTx(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    studentId: string;
    grantId: string;
    now: Date;
  },
) {
  const existing = await tx.portalGrant.findFirst({
    where: {
      id: input.grantId,
      workspaceId: input.workspaceId,
      studentId: input.studentId,
    },
    select: {
      id: true,
      portalUserId: true,
      kind: true,
      revokedAt: true,
    },
  });
  if (!existing) return null;

  const updated = await tx.portalGrant.update({
    where: { id: existing.id },
    data: { revokedAt: input.now },
    select: {
      id: true,
      portalUserId: true,
      kind: true,
      revokedAt: true,
    },
  });

  await tx.portalPushSubscription.updateMany({
    where: {
      workspaceId: input.workspaceId,
      portalUserId: existing.portalUserId,
      kind: existing.kind,
      revokedAt: null,
    },
    data: { revokedAt: input.now },
  });

  return updated;
}

function formatTimeUtc(value: Date | null): string | null {
  if (!value) return null;
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export async function loadParentLinkedChildren(grants: PortalGrantRow[]) {
  const parentGrants = grants.filter((grant) => grant.kind === "parent");
  const children: Array<{
    grantId: string;
    studentId: string;
    firstName: string;
    lastName: string;
    grade: string | null;
    teachingName: string;
    primarySubject: string | null;
    groups: Array<{ id: string; name: string; grade: string | null }>;
    unreadNotificationsCount: number;
    permissions: PortalPermissions;
  }> = [];

  for (const grant of parentGrants) {
    const permissions = resolvePortalPermissions("parent", grant.permissions);
    const row = await withScope({ workspaceId: grant.workspaceId }, async (tx) => {
      const student = await tx.student.findFirst({
        where: {
          id: grant.studentId,
          workspaceId: grant.workspaceId,
          archivedAt: null,
          mergedIntoId: null,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          grade: true,
          workspace: {
            select: {
              teachingName: true,
              primarySubject: true,
              status: true,
              deletedAt: true,
            },
          },
          enrollments: {
            where: { leftAt: null, group: { archivedAt: null } },
            select: {
              group: {
                select: {
                  id: true,
                  name: true,
                  grade: true,
                },
              },
            },
          },
        },
      });

      if (
        !student ||
        student.workspace.status !== "active" ||
        student.workspace.deletedAt !== null
      ) {
        return null;
      }

      const unreadNotificationsCount = permissions.showNotifications
        ? await tx.notification.count({
            where: {
              workspaceId: grant.workspaceId,
              studentId: grant.studentId,
              isRead: false,
              OR: [
                { guardianId: null },
                ...(grant.guardianId ? [{ guardianId: grant.guardianId }] : []),
              ],
            },
          })
        : 0;

      return {
        grantId: grant.id ?? grant.studentId,
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.grade,
        teachingName: student.workspace.teachingName,
        primarySubject: student.workspace.primarySubject,
        groups: student.enrollments.map((enrollment) => enrollment.group),
        unreadNotificationsCount,
        permissions,
      };
    });

    if (row) {
      children.push(row);
    }
  }

  return children;
}

export async function loadParentChildDetail(
  grant: PortalGrantRow,
  now: Date = new Date(),
) {
  const permissions = resolvePortalPermissions("parent", grant.permissions);

  return withScope({ workspaceId: grant.workspaceId }, async (tx) => {
    const student = await tx.student.findFirst({
      where: {
        id: grant.studentId,
        workspaceId: grant.workspaceId,
        archivedAt: null,
        mergedIntoId: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        grade: true,
        workspace: {
          select: {
            teachingName: true,
            primarySubject: true,
            status: true,
            deletedAt: true,
            settings: {
              select: {
                currency: true,
                timezone: true,
              },
            },
          },
        },
        enrollments: {
          where: { leftAt: null, group: { archivedAt: null } },
          select: {
            groupId: true,
            enrolledAt: true,
            leftAt: true,
            group: {
              select: {
                id: true,
                name: true,
                grade: true,
                room: true,
                weekday: true,
                startTime: true,
                endTime: true,
                subject: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (
      !student ||
      student.workspace.status !== "active" ||
      student.workspace.deletedAt !== null
    ) {
      return null;
    }

    const activeGroupIds = student.enrollments.map((entry) => entry.groupId);
    const currency = student.workspace.settings?.currency ?? "EGP";
    const timezone = student.workspace.settings?.timezone ?? "Africa/Cairo";

    const groups = student.enrollments.map((entry) => ({
      id: entry.group.id,
      name: entry.group.name,
      grade: entry.group.grade,
      room: entry.group.room,
      weekday: entry.group.weekday,
      startTime: formatTimeUtc(entry.group.startTime),
      endTime: formatTimeUtc(entry.group.endTime),
      subjectName: entry.group.subject?.name ?? student.workspace.primarySubject ?? null,
    }));

    // 1. Permitted Attendance
    let attendance: {
      summary: {
        present: number;
        absent: number;
        late: number;
        excused: number;
        total: number;
        attendanceRate: number | null;
      };
      records: Array<{
        id: string;
        mark: "present" | "absent" | "late" | "excused";
        recordedAt: string;
        session: {
          id: string;
          startsAt: string;
          endsAt: string | null;
          status: string;
          groupName: string;
        };
      }>;
    } | null = null;

    if (permissions.showAttendance) {
      const marks = await tx.attendanceMark.findMany({
        where: {
          workspaceId: grant.workspaceId,
          studentId: student.id,
        },
        orderBy: { session: { startsAt: "desc" } },
        take: 60,
        select: {
          id: true,
          mark: true,
          recordedAt: true,
          session: {
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              status: true,
              group: { select: { name: true } },
            },
          },
        },
      });

      const counts = { present: 0, absent: 0, late: 0, excused: 0 };
      for (const m of marks) {
        counts[m.mark] += 1;
      }
      const total = marks.length;
      const attended = counts.present + counts.late;
      const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : null;

      attendance = {
        summary: { ...counts, total, attendanceRate },
        records: marks.map((m) => ({
          id: m.id,
          mark: m.mark,
          recordedAt: m.recordedAt.toISOString(),
          session: {
            id: m.session.id,
            startsAt: m.session.startsAt.toISOString(),
            endsAt: m.session.endsAt?.toISOString() ?? null,
            status: m.session.status,
            groupName: m.session.group.name,
          },
        })),
      };
    }

    // 2. Relevant (Published) Grades ONLY (`assessment.lockedAt !== null`)
    let grades: Array<{
      id: string;
      score: number | null;
      status: "graded" | "missing" | "excused" | "not_taken";
      updatedAt: string;
      assessment: {
        id: string;
        title: string;
        type: string;
        date: string;
        maxScore: number;
        groupName: string;
        publishedAt: string;
      };
    }> | null = null;

    if (permissions.showGrades) {
      const scoreRows = await tx.assessmentScore.findMany({
        where: {
          workspaceId: grant.workspaceId,
          studentId: student.id,
          assessment: {
            lockedAt: { not: null },
          },
        },
        orderBy: { assessment: { date: "desc" } },
        take: 50,
        select: {
          id: true,
          score: true,
          status: true,
          updatedAt: true,
          assessment: {
            select: {
              id: true,
              title: true,
              type: true,
              date: true,
              maxScore: true,
              lockedAt: true,
              group: { select: { name: true } },
            },
          },
        },
      });

      grades = scoreRows
        .filter((row) => row.assessment.lockedAt !== null)
        .map((row) => ({
          id: row.id,
          score: row.score !== null ? Number(row.score) : null,
          status: row.status,
          updatedAt: row.updatedAt.toISOString(),
          assessment: {
            id: row.assessment.id,
            title: row.assessment.title,
            type: row.assessment.type,
            date: row.assessment.date.toISOString().slice(0, 10),
            maxScore: Number(row.assessment.maxScore),
            groupName: row.assessment.group.name,
            publishedAt: row.assessment.lockedAt!.toISOString(),
          },
        }));
    }

    // 3. Assigned Homework (excluding teacherFeedback private notes)
    let homework: Array<{
      id: string;
      title: string;
      instructions: string | null;
      dueAt: string;
      maxScore: number | null;
      groupName: string | null;
      submission: {
        status: "not_submitted" | "submitted" | "late" | "excused";
        score: number | null;
        submittedAt: string | null;
      };
      resources: Array<{
        fileId: string;
        title: string;
        mime: string;
        sizeBytes: number;
        downloadUrl: string;
      }>;
    }> | null = null;

    if (permissions.showHomework) {
      const homeworkRows = await tx.homework.findMany({
        where: {
          workspaceId: grant.workspaceId,
          status: "active",
          archivedAt: null,
          OR: [
            ...(activeGroupIds.length > 0 ? [{ groupId: { in: activeGroupIds } }] : []),
            { submissions: { some: { studentId: student.id } } },
          ],
        },
        orderBy: { dueAt: "desc" },
        take: 40,
        select: {
          id: true,
          title: true,
          instructions: true,
          dueAt: true,
          maxScore: true,
          group: { select: { name: true } },
          submissions: {
            where: { studentId: student.id },
            select: {
              status: true,
              score: true,
              submittedAt: true,
            },
          },
          resources: {
            where: {
              file: {
                deletedAt: null,
                archivedAt: null,
                scanStatus: "clean",
                scope: { in: ["students", "groups"] },
              },
            },
            select: {
              file: {
                select: {
                  id: true,
                  title: true,
                  mime: true,
                  sizeBytes: true,
                },
              },
            },
          },
        },
      });

      homework = homeworkRows.map((hw) => {
        const sub = hw.submissions[0];
        return {
          id: hw.id,
          title: hw.title,
          instructions: hw.instructions,
          dueAt: hw.dueAt.toISOString(),
          maxScore: hw.maxScore !== null ? Number(hw.maxScore) : null,
          groupName: hw.group?.name ?? null,
          submission: {
            status: sub?.status ?? "not_submitted",
            score: sub?.score !== null && sub?.score !== undefined ? Number(sub.score) : null,
            submittedAt: sub?.submittedAt?.toISOString() ?? null,
          },
          resources: hw.resources.map((res) => ({
            fileId: res.file.id,
            title: res.file.title,
            mime: res.file.mime,
            sizeBytes: res.file.sizeBytes,
            downloadUrl: `/api/portal/files/${res.file.id}/download`,
          })),
        };
      });
    }

    // 4. Published Clean Learning Resources
    let resources: Array<{
      id: string;
      title: string;
      description: string | null;
      topic: string | null;
      mime: string;
      sizeBytes: number;
      subjectName: string | null;
      createdAt: string;
      downloadUrl: string;
    }> | null = null;

    if (permissions.showResources) {
      const fileRows = await tx.file.findMany({
        where: {
          workspaceId: grant.workspaceId,
          deletedAt: null,
          archivedAt: null,
          scanStatus: "clean",
          OR: [
            {
              scope: "students",
              studentAccesses: { some: { studentId: student.id } },
            },
            ...(activeGroupIds.length > 0
              ? [
                  {
                    scope: "groups" as const,
                    groupAccesses: { some: { groupId: { in: activeGroupIds } } },
                  },
                ]
              : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          description: true,
          topic: true,
          mime: true,
          sizeBytes: true,
          createdAt: true,
          subject: { select: { name: true } },
        },
      });

      resources = fileRows.map((file) => ({
        id: file.id,
        title: file.title,
        description: file.description,
        topic: file.topic,
        mime: file.mime,
        sizeBytes: file.sizeBytes,
        subjectName: file.subject?.name ?? null,
        createdAt: file.createdAt.toISOString(),
        downloadUrl: `/api/portal/files/${file.id}/download`,
      }));
    }

    let videos: Array<{
      id: string;
      title: string;
      description: string | null;
      topic: string | null;
      durationSeconds: number | null;
      thumbnailUrl: string | null;
      subjectName: string | null;
      publishedAt: string | null;
      playbackEndpoint: string;
    }> | null = null;

    if (permissions.showResources) {
      const videoRows = tx.videoLesson
        ? await tx.videoLesson.findMany({
            where: {
              workspaceId: grant.workspaceId,
              deletedAt: null,
              archivedAt: null,
              publicationStatus: "published",
              assetStatus: "ready",
              OR: [
                {
                  scope: "students",
                  studentAccesses: { some: { studentId: student.id } },
                },
                ...(activeGroupIds.length > 0
                  ? [
                      {
                        scope: "groups" as const,
                        groupAccesses: { some: { groupId: { in: activeGroupIds } } },
                      },
                    ]
                  : []),
              ],
            },
            orderBy: { createdAt: "desc" },
            take: 30,
            select: {
              id: true,
              title: true,
              description: true,
              topic: true,
              durationSeconds: true,
              thumbnailPath: true,
              publishedAt: true,
              subject: { select: { name: true } },
            },
          })
        : [];

      videos = videoRows.map((v) => ({
        id: v.id,
        title: v.title,
        description: v.description,
        topic: v.topic,
        durationSeconds: v.durationSeconds,
        thumbnailUrl: v.thumbnailPath,
        subjectName: v.subject?.name ?? null,
        publishedAt: v.publishedAt?.toISOString() ?? null,
        playbackEndpoint: `/api/portal/videos/${v.id}/playback`,
      }));
    }

    // 5. Approved Payment & Balance Data (only when `permissions.showPayments === true`)
    let payments: {
      currency: string;
      balance: {
        expectedMinor: number;
        receivedMinor: number;
        adjustmentsMinor: number;
        balanceMinor: number;
      };
      history: Array<{
        id: string;
        period: string | null;
        amountMinor: number;
        currency: string;
        method: string;
        methodLabel: string | null;
        paidOn: string;
        purpose: string | null;
        referenceNumber: string | null;
      }>;
      adjustments: Array<{
        id: string;
        kind: string;
        amountMinor: number;
        balanceImpact: number;
        currency: string;
        paidOn: string;
        reason: string;
      }>;
    } | null = null;

    if (permissions.showPayments) {
      const [allEnrollments, paymentRows, adjustmentRows, feeRuleRows] = await Promise.all([
        tx.enrollment.findMany({
          where: { workspaceId: grant.workspaceId, studentId: student.id },
          select: {
            studentId: true,
            groupId: true,
            enrolledAt: true,
            leftAt: true,
          },
        }),
        tx.payment.findMany({
          where: {
            workspaceId: grant.workspaceId,
            studentId: student.id,
            voidedAt: null,
          },
          orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            studentId: true,
            period: true,
            amountMinor: true,
            currency: true,
            method: true,
            methodLabel: true,
            paidOn: true,
            purpose: true,
            referenceNumber: true,
            voidedAt: true,
          },
        }),
        tx.paymentAdjustment.findMany({
          where: {
            workspaceId: grant.workspaceId,
            studentId: student.id,
          },
          orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            studentId: true,
            kind: true,
            amountMinor: true,
            balanceImpact: true,
            currency: true,
            paidOn: true,
            reason: true,
          },
        }),
        tx.feeRule.findMany({
          where: {
            workspaceId: grant.workspaceId,
            OR: [
              { studentId: student.id },
              ...(activeGroupIds.length > 0 ? [{ groupId: { in: activeGroupIds } }] : []),
            ],
          },
          select: {
            studentId: true,
            groupId: true,
            amountMinor: true,
            effectiveFrom: true,
          },
        }),
      ]);

      const asOfMonth = currentMonthInTimezone(now, timezone);
      const computed = calculateStudentBalances({
        students: [{ id: student.id }],
        feeRules: feeRuleRows,
        enrollments: allEnrollments,
        payments: paymentRows,
        adjustments: adjustmentRows,
        asOfMonth,
        timezone,
      })[0] ?? {
        studentId: student.id,
        expectedMinor: 0,
        receivedMinor: 0,
        adjustmentsMinor: 0,
        balanceMinor: 0,
      };

      payments = {
        currency,
        balance: {
          expectedMinor: computed.expectedMinor,
          receivedMinor: computed.receivedMinor,
          adjustmentsMinor: computed.adjustmentsMinor,
          balanceMinor: computed.balanceMinor,
        },
        history: paymentRows.map((p) => ({
          id: p.id,
          period: p.period,
          amountMinor: p.amountMinor,
          currency: p.currency,
          method: p.method,
          methodLabel: p.methodLabel,
          paidOn: p.paidOn.toISOString().slice(0, 10),
          purpose: p.purpose,
          referenceNumber: p.referenceNumber,
        })),
        adjustments: adjustmentRows.map((adj) => ({
          id: adj.id,
          kind: adj.kind,
          amountMinor: adj.amountMinor,
          balanceImpact: adj.balanceImpact,
          currency: adj.currency,
          paidOn: adj.paidOn.toISOString().slice(0, 10),
          reason: adj.reason,
        })),
      };
    }

    // 6. Schedule & Schedule Changes
    let schedule: {
      upcomingSessions: Array<{
        id: string;
        startsAt: string;
        endsAt: string | null;
        status: string;
        room: string | null;
        location: string | null;
        groupName: string;
        cancelledAt: string | null;
        isRescheduled: boolean;
      }>;
      recentChanges: Array<{
        id: string;
        sessionId: string;
        groupName: string;
        changeType: "cancelled" | "rescheduled";
        startsAt: string;
        createdAt: string;
      }>;
    } | null = null;

    if (permissions.showSchedule) {
      const lookback = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sessionRows =
        activeGroupIds.length > 0
          ? await tx.teachingSession.findMany({
              where: {
                workspaceId: grant.workspaceId,
                groupId: { in: activeGroupIds },
                startsAt: { gte: lookback },
              },
              orderBy: { startsAt: "asc" },
              take: 30,
              select: {
                id: true,
                startsAt: true,
                endsAt: true,
                status: true,
                room: true,
                location: true,
                cancelledAt: true,
                group: { select: { name: true } },
                sessionRevisions: {
                  orderBy: { createdAt: "desc" },
                  take: 3,
                  select: {
                    id: true,
                    createdAt: true,
                  },
                },
              },
            })
          : [];

      const recentChanges: Array<{
        id: string;
        sessionId: string;
        groupName: string;
        changeType: "cancelled" | "rescheduled";
        startsAt: string;
        createdAt: string;
      }> = [];

      for (const s of sessionRows) {
        if (s.status === "cancelled" && s.cancelledAt) {
          recentChanges.push({
            id: `cancel-${s.id}`,
            sessionId: s.id,
            groupName: s.group.name,
            changeType: "cancelled",
            startsAt: s.startsAt.toISOString(),
            createdAt: s.cancelledAt.toISOString(),
          });
        } else if (s.sessionRevisions.length > 0) {
          recentChanges.push({
            id: s.sessionRevisions[0].id,
            sessionId: s.id,
            groupName: s.group.name,
            changeType: "rescheduled",
            startsAt: s.startsAt.toISOString(),
            createdAt: s.sessionRevisions[0].createdAt.toISOString(),
          });
        }
      }

      schedule = {
        upcomingSessions: sessionRows.map((s) => ({
          id: s.id,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt?.toISOString() ?? null,
          status: s.status,
          room: s.room,
          location: s.location,
          groupName: s.group.name,
          cancelledAt: s.cancelledAt?.toISOString() ?? null,
          isRescheduled: s.sessionRevisions.length > 0,
        })),
        recentChanges,
      };
    }

    // 7. Private Notifications for this child/guardian
    let notifications: Array<{
      id: string;
      type: string;
      title: string;
      body: string;
      isRead: boolean;
      readAt: string | null;
      createdAt: string;
    }> | null = null;

    if (permissions.showNotifications) {
      const notificationRows = await tx.notification.findMany({
        where: {
          workspaceId: grant.workspaceId,
          studentId: student.id,
          OR: [
            { guardianId: null },
            ...(grant.guardianId ? [{ guardianId: grant.guardianId }] : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          isRead: true,
          readAt: true,
          createdAt: true,
        },
      });

      notifications = notificationRows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      }));
    }

    return {
      grantId: grant.id ?? grant.studentId,
      kind: "parent" as const,
      permissions,
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.grade,
      },
      teacher: {
        teachingName: student.workspace.teachingName,
        primarySubject: student.workspace.primarySubject,
        currency,
        timezone,
      },
      groups,
      attendance,
      grades,
      homework,
      resources,
      videos,
      payments,
      schedule,
      notifications,
    };
  });
}

export async function loadStudentPortalDetail(
  grant: PortalGrantRow,
  now: Date = new Date(),
) {
  const permissions = resolvePortalPermissions("student", grant.permissions);

  return withScope({ workspaceId: grant.workspaceId }, async (tx) => {
    const student = await tx.student.findFirst({
      where: {
        id: grant.studentId,
        workspaceId: grant.workspaceId,
        archivedAt: null,
        mergedIntoId: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        grade: true,
        workspace: {
          select: {
            teachingName: true,
            primarySubject: true,
            status: true,
            deletedAt: true,
            settings: {
              select: {
                timezone: true,
              },
            },
          },
        },
        enrollments: {
          where: { leftAt: null, group: { archivedAt: null } },
          select: {
            groupId: true,
            group: {
              select: {
                id: true,
                name: true,
                grade: true,
                room: true,
                weekday: true,
                startTime: true,
                endTime: true,
                subject: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (
      !student ||
      student.workspace.status !== "active" ||
      student.workspace.deletedAt !== null
    ) {
      return null;
    }

    const activeGroupIds = student.enrollments.map((entry) => entry.groupId);
    const timezone = student.workspace.settings?.timezone ?? "Africa/Cairo";

    const groups = student.enrollments.map((entry) => ({
      id: entry.group.id,
      name: entry.group.name,
      grade: entry.group.grade,
      room: entry.group.room,
      weekday: entry.group.weekday,
      startTime: formatTimeUtc(entry.group.startTime),
      endTime: formatTimeUtc(entry.group.endTime),
      subjectName: entry.group.subject?.name ?? student.workspace.primarySubject ?? null,
    }));

    // 1. Upcoming Sessions & Schedule
    let upcomingSessions: Array<{
      id: string;
      startsAt: string;
      endsAt: string | null;
      status: string;
      room: string | null;
      location: string | null;
      groupName: string;
      cancelledAt: string | null;
      isRescheduled: boolean;
    }> | null = null;

    if (permissions.showSchedule) {
      const lookback = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sessionRows =
        activeGroupIds.length > 0
          ? await tx.teachingSession.findMany({
              where: {
                workspaceId: grant.workspaceId,
                groupId: { in: activeGroupIds },
                startsAt: { gte: lookback },
              },
              orderBy: { startsAt: "asc" },
              take: 25,
              select: {
                id: true,
                startsAt: true,
                endsAt: true,
                status: true,
                room: true,
                location: true,
                cancelledAt: true,
                group: { select: { name: true } },
                sessionRevisions: {
                  select: { id: true },
                  take: 1,
                },
              },
            })
          : [];

      upcomingSessions = sessionRows.map((s) => ({
        id: s.id,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt?.toISOString() ?? null,
        status: s.status,
        room: s.room,
        location: s.location,
        groupName: s.group.name,
        cancelledAt: s.cancelledAt?.toISOString() ?? null,
        isRescheduled: s.sessionRevisions.length > 0,
      }));
    }

    // 2. Own Attendance (where allowed)
    let attendance: {
      summary: {
        present: number;
        absent: number;
        late: number;
        excused: number;
        total: number;
        attendanceRate: number | null;
      };
      records: Array<{
        id: string;
        mark: "present" | "absent" | "late" | "excused";
        recordedAt: string;
        session: {
          id: string;
          startsAt: string;
          endsAt: string | null;
          status: string;
          groupName: string;
        };
      }>;
    } | null = null;

    if (permissions.showAttendance) {
      const marks = await tx.attendanceMark.findMany({
        where: {
          workspaceId: grant.workspaceId,
          studentId: student.id,
        },
        orderBy: { session: { startsAt: "desc" } },
        take: 60,
        select: {
          id: true,
          mark: true,
          recordedAt: true,
          session: {
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              status: true,
              group: { select: { name: true } },
            },
          },
        },
      });

      const counts = { present: 0, absent: 0, late: 0, excused: 0 };
      for (const m of marks) {
        counts[m.mark] += 1;
      }
      const total = marks.length;
      const attended = counts.present + counts.late;
      const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : null;

      attendance = {
        summary: { ...counts, total, attendanceRate },
        records: marks.map((m) => ({
          id: m.id,
          mark: m.mark,
          recordedAt: m.recordedAt.toISOString(),
          session: {
            id: m.session.id,
            startsAt: m.session.startsAt.toISOString(),
            endsAt: m.session.endsAt?.toISOString() ?? null,
            status: m.session.status,
            groupName: m.session.group.name,
          },
        })),
      };
    }

    // 3. Assigned Homework (excluding teacherFeedback private notes)
    let homework: Array<{
      id: string;
      title: string;
      instructions: string | null;
      dueAt: string;
      maxScore: number | null;
      groupName: string | null;
      submission: {
        status: "not_submitted" | "submitted" | "late" | "excused";
        score: number | null;
        submittedAt: string | null;
      };
      resources: Array<{
        fileId: string;
        title: string;
        mime: string;
        sizeBytes: number;
        downloadUrl: string;
      }>;
    }> | null = null;

    if (permissions.showHomework) {
      const homeworkRows = await tx.homework.findMany({
        where: {
          workspaceId: grant.workspaceId,
          status: "active",
          archivedAt: null,
          OR: [
            ...(activeGroupIds.length > 0 ? [{ groupId: { in: activeGroupIds } }] : []),
            { submissions: { some: { studentId: student.id } } },
          ],
        },
        orderBy: { dueAt: "asc" },
        take: 40,
        select: {
          id: true,
          title: true,
          instructions: true,
          dueAt: true,
          maxScore: true,
          group: { select: { name: true } },
          submissions: {
            where: { studentId: student.id },
            select: {
              status: true,
              score: true,
              submittedAt: true,
            },
          },
          resources: {
            where: {
              file: {
                deletedAt: null,
                archivedAt: null,
                scanStatus: "clean",
                scope: { in: ["students", "groups"] },
              },
            },
            select: {
              file: {
                select: {
                  id: true,
                  title: true,
                  mime: true,
                  sizeBytes: true,
                },
              },
            },
          },
        },
      });

      homework = homeworkRows.map((hw) => {
        const sub = hw.submissions[0];
        return {
          id: hw.id,
          title: hw.title,
          instructions: hw.instructions,
          dueAt: hw.dueAt.toISOString(),
          maxScore: hw.maxScore !== null ? Number(hw.maxScore) : null,
          groupName: hw.group?.name ?? null,
          submission: {
            status: sub?.status ?? "not_submitted",
            score: sub?.score !== null && sub?.score !== undefined ? Number(sub.score) : null,
            submittedAt: sub?.submittedAt?.toISOString() ?? null,
          },
          resources: hw.resources.map((res) => ({
            fileId: res.file.id,
            title: res.file.title,
            mime: res.file.mime,
            sizeBytes: res.file.sizeBytes,
            downloadUrl: `/api/portal/files/${res.file.id}/download`,
          })),
        };
      });
    }

    // 4. Published Grades ONLY (`assessment.lockedAt !== null`)
    let grades: Array<{
      id: string;
      score: number | null;
      status: "graded" | "missing" | "excused" | "not_taken";
      updatedAt: string;
      assessment: {
        id: string;
        title: string;
        type: string;
        date: string;
        maxScore: number;
        groupName: string;
        publishedAt: string;
      };
    }> | null = null;

    if (permissions.showGrades) {
      const scoreRows = await tx.assessmentScore.findMany({
        where: {
          workspaceId: grant.workspaceId,
          studentId: student.id,
          assessment: {
            lockedAt: { not: null },
          },
        },
        orderBy: { assessment: { date: "desc" } },
        take: 50,
        select: {
          id: true,
          score: true,
          status: true,
          updatedAt: true,
          assessment: {
            select: {
              id: true,
              title: true,
              type: true,
              date: true,
              maxScore: true,
              lockedAt: true,
              group: { select: { name: true } },
            },
          },
        },
      });

      grades = scoreRows
        .filter((row) => row.assessment.lockedAt !== null)
        .map((row) => ({
          id: row.id,
          score: row.score !== null ? Number(row.score) : null,
          status: row.status,
          updatedAt: row.updatedAt.toISOString(),
          assessment: {
            id: row.assessment.id,
            title: row.assessment.title,
            type: row.assessment.type,
            date: row.assessment.date.toISOString().slice(0, 10),
            maxScore: Number(row.assessment.maxScore),
            groupName: row.assessment.group.name,
            publishedAt: row.assessment.lockedAt!.toISOString(),
          },
        }));
    }

    // 5. Shared Clean Learning Materials
    let resources: Array<{
      id: string;
      title: string;
      description: string | null;
      topic: string | null;
      mime: string;
      sizeBytes: number;
      subjectName: string | null;
      createdAt: string;
      downloadUrl: string;
    }> | null = null;

    if (permissions.showResources) {
      const fileRows = await tx.file.findMany({
        where: {
          workspaceId: grant.workspaceId,
          deletedAt: null,
          archivedAt: null,
          scanStatus: "clean",
          OR: [
            {
              scope: "students",
              studentAccesses: { some: { studentId: student.id } },
            },
            ...(activeGroupIds.length > 0
              ? [
                  {
                    scope: "groups" as const,
                    groupAccesses: { some: { groupId: { in: activeGroupIds } } },
                  },
                ]
              : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          description: true,
          topic: true,
          mime: true,
          sizeBytes: true,
          createdAt: true,
          subject: { select: { name: true } },
        },
      });

      resources = fileRows.map((file) => ({
        id: file.id,
        title: file.title,
        description: file.description,
        topic: file.topic,
        mime: file.mime,
        sizeBytes: file.sizeBytes,
        subjectName: file.subject?.name ?? null,
        createdAt: file.createdAt.toISOString(),
        downloadUrl: `/api/portal/files/${file.id}/download`,
      }));
    }

    let videos: Array<{
      id: string;
      title: string;
      description: string | null;
      topic: string | null;
      durationSeconds: number | null;
      thumbnailUrl: string | null;
      subjectName: string | null;
      publishedAt: string | null;
      playbackEndpoint: string;
    }> | null = null;

    if (permissions.showResources) {
      const videoRows = tx.videoLesson
        ? await tx.videoLesson.findMany({
            where: {
              workspaceId: grant.workspaceId,
              deletedAt: null,
              archivedAt: null,
              publicationStatus: "published",
              assetStatus: "ready",
              OR: [
                {
                  scope: "students",
                  studentAccesses: { some: { studentId: student.id } },
                },
                ...(activeGroupIds.length > 0
                  ? [
                      {
                        scope: "groups" as const,
                        groupAccesses: { some: { groupId: { in: activeGroupIds } } },
                      },
                    ]
                  : []),
              ],
            },
            orderBy: { createdAt: "desc" },
            take: 30,
            select: {
              id: true,
              title: true,
              description: true,
              topic: true,
              durationSeconds: true,
              thumbnailPath: true,
              publishedAt: true,
              subject: { select: { name: true } },
            },
          })
        : [];

      videos = videoRows.map((v) => ({
        id: v.id,
        title: v.title,
        description: v.description,
        topic: v.topic,
        durationSeconds: v.durationSeconds,
        thumbnailUrl: v.thumbnailPath,
        subjectName: v.subject?.name ?? null,
        publishedAt: v.publishedAt?.toISOString() ?? null,
        playbackEndpoint: `/api/portal/videos/${v.id}/playback`,
      }));
    }

    // 6. Student's Own In-App Notifications (`guardianId: null`)
    let notifications: Array<{
      id: string;
      type: string;
      title: string;
      body: string;
      isRead: boolean;
      readAt: string | null;
      createdAt: string;
    }> | null = null;

    if (permissions.showNotifications) {
      const notificationRows = await tx.notification.findMany({
        where: {
          workspaceId: grant.workspaceId,
          studentId: student.id,
          guardianId: null,
        },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          isRead: true,
          readAt: true,
          createdAt: true,
        },
      });

      notifications = notificationRows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      }));
    }

    return {
      grantId: grant.id ?? grant.studentId,
      kind: "student" as const,
      permissions,
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.grade,
      },
      teacher: {
        teachingName: student.workspace.teachingName,
        primarySubject: student.workspace.primarySubject,
        timezone,
      },
      groups,
      upcomingSessions,
      attendance,
      homework,
      grades,
      resources,
      videos,
      notifications,
    };
  });
}

export async function submitStudentHomeworkInScope(
  grant: PortalGrantRow,
  portalUserId: string,
  homeworkId: string,
  now: Date = new Date(),
) {
  return withScope({ workspaceId: grant.workspaceId }, async (tx) => {
    const enrollments = await tx.enrollment.findMany({
      where: {
        workspaceId: grant.workspaceId,
        studentId: grant.studentId,
        leftAt: null,
        group: { archivedAt: null },
      },
      select: { groupId: true },
    });
    const activeGroupIds = enrollments.map((e) => e.groupId);

    const homework = await tx.homework.findFirst({
      where: {
        id: homeworkId,
        workspaceId: grant.workspaceId,
        status: "active",
        archivedAt: null,
        OR: [
          ...(activeGroupIds.length > 0 ? [{ groupId: { in: activeGroupIds } }] : []),
          { submissions: { some: { studentId: grant.studentId } } },
        ],
      },
      select: {
        id: true,
        dueAt: true,
      },
    });

    if (!homework) return null;

    const status = now.getTime() > homework.dueAt.getTime() ? "late" : "submitted";

    const submission = await tx.homeworkSubmission.upsert({
      where: {
        homeworkId_studentId: {
          homeworkId: homework.id,
          studentId: grant.studentId,
        },
      },
      create: {
        id: newUuidV7(),
        workspaceId: grant.workspaceId,
        homeworkId: homework.id,
        studentId: grant.studentId,
        status,
        submittedAt: now,
        updatedBy: portalUserId,
      },
      update: {
        status,
        submittedAt: now,
        updatedBy: portalUserId,
      },
      select: {
        id: true,
        homeworkId: true,
        status: true,
        submittedAt: true,
      },
    });

    return {
      homeworkId: submission.homeworkId,
      status: submission.status,
      submittedAt: submission.submittedAt?.toISOString() ?? now.toISOString(),
    };
  });
}

export async function listPortalNotificationsForGrants(grants: PortalGrantRow[]) {
  const results: Array<{
    id: string;
    studentId: string;
    studentName: string;
    type: string;
    title: string;
    body: string;
    isRead: boolean;
    readAt: string | null;
    createdAt: string;
  }> = [];

  for (const grant of grants) {
    const permissions = resolvePortalPermissions(grant.kind, grant.permissions);
    if (!permissions.showNotifications) continue;

    const rows = await withScope({ workspaceId: grant.workspaceId }, (tx) =>
      tx.notification.findMany({
        where: {
          workspaceId: grant.workspaceId,
          studentId: grant.studentId,
          ...(grant.kind === "student"
            ? { guardianId: null }
            : {
                OR: [
                  { guardianId: null },
                  ...(grant.guardianId ? [{ guardianId: grant.guardianId }] : []),
                ],
              }),
        },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          studentId: true,
          type: true,
          title: true,
          body: true,
          isRead: true,
          readAt: true,
          createdAt: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    );

    for (const row of rows) {
      if (!results.some((existing) => existing.id === row.id)) {
        results.push({
          id: row.id,
          studentId: row.studentId,
          studentName: `${row.student.firstName} ${row.student.lastName}`.trim(),
          type: row.type,
          title: row.title,
          body: row.body,
          isRead: row.isRead,
          readAt: row.readAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        });
      }
    }
  }

  return results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function markPortalNotificationReadForGrants(
  grants: PortalGrantRow[],
  notificationId: string,
  now: Date = new Date(),
) {
  for (const grant of grants) {
    const permissions = resolvePortalPermissions(grant.kind, grant.permissions);
    if (!permissions.showNotifications) continue;

    const updated = await withScope({ workspaceId: grant.workspaceId }, async (tx) => {
      const existing = await tx.notification.findFirst({
        where: {
          id: notificationId,
          workspaceId: grant.workspaceId,
          studentId: grant.studentId,
          ...(grant.kind === "student"
            ? { guardianId: null }
            : {
                OR: [
                  { guardianId: null },
                  ...(grant.guardianId ? [{ guardianId: grant.guardianId }] : []),
                ],
              }),
        },
        select: { id: true },
      });
      if (!existing) return null;

      return tx.notification.update({
        where: { id: existing.id },
        data: { isRead: true, readAt: now },
        select: {
          id: true,
          isRead: true,
          readAt: true,
        },
      });
    });

    if (updated) {
      return {
        id: updated.id,
        isRead: updated.isRead,
        readAt: updated.readAt?.toISOString() ?? now.toISOString(),
      };
    }
  }

  return null;
}

export async function listPortalPushSubscriptionsForUser(
  grants: PortalGrantRow[],
  portalUserId: string,
) {
  const workspaceIds = [...new Set(grants.map((g) => g.workspaceId))];
  const subscriptions: Array<{
    id: string;
    kind: "parent" | "student";
    endpoint: string;
    includeSensitiveDetails: boolean;
    createdAt: string;
    updatedAt: string;
  }> = [];

  for (const workspaceId of workspaceIds) {
    const rows = await withScope({ workspaceId }, (tx) =>
      tx.portalPushSubscription.findMany({
        where: {
          workspaceId,
          portalUserId,
          revokedAt: null,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          kind: true,
          endpoint: true,
          includeSensitiveDetails: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );

    for (const row of rows) {
      if (!subscriptions.some((sub) => sub.endpoint === row.endpoint)) {
        subscriptions.push({
          id: row.id,
          kind: row.kind,
          endpoint: row.endpoint,
          includeSensitiveDetails: row.includeSensitiveDetails,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        });
      }
    }
  }

  return subscriptions;
}

export async function upsertPortalPushSubscriptionForUser(
  grants: PortalGrantRow[],
  portalUserId: string,
  input: UpsertPushSubscriptionInput,
  userAgent?: string | null,
) {
  const workspaceMap = new Map<string, "parent" | "student">();
  for (const grant of grants) {
    if (!workspaceMap.has(grant.workspaceId)) {
      workspaceMap.set(grant.workspaceId, grant.kind);
    }
  }

  let saved: {
    id: string;
    kind: "parent" | "student";
    endpoint: string;
    includeSensitiveDetails: boolean;
  } | null = null;

  for (const [workspaceId, kind] of workspaceMap.entries()) {
    const row = await withScope({ workspaceId }, (tx) =>
      tx.portalPushSubscription.upsert({
        where: {
          workspaceId_portalUserId_endpoint: {
            workspaceId,
            portalUserId,
            endpoint: input.endpoint,
          },
        },
        create: {
          id: newUuidV7(),
          workspaceId,
          portalUserId,
          kind,
          endpoint: input.endpoint,
          p256dhKey: input.keys.p256dh,
          authKey: input.keys.auth,
          includeSensitiveDetails: input.includeSensitiveDetails,
          userAgent: userAgent?.slice(0, 255) ?? null,
        },
        update: {
          kind,
          p256dhKey: input.keys.p256dh,
          authKey: input.keys.auth,
          includeSensitiveDetails: input.includeSensitiveDetails,
          userAgent: userAgent?.slice(0, 255) ?? null,
          revokedAt: null,
        },
        select: {
          id: true,
          kind: true,
          endpoint: true,
          includeSensitiveDetails: true,
        },
      }),
    );

    if (!saved) saved = row;
  }

  return saved;
}

export async function updatePortalPushPreferenceForUser(
  grants: PortalGrantRow[],
  portalUserId: string,
  input: UpdatePushPreferenceInput,
) {
  const workspaceIds = [...new Set(grants.map((g) => g.workspaceId))];
  let updatedCount = 0;

  for (const workspaceId of workspaceIds) {
    const result = await withScope({ workspaceId }, (tx) =>
      tx.portalPushSubscription.updateMany({
        where: {
          workspaceId,
          portalUserId,
          endpoint: input.endpoint,
          revokedAt: null,
        },
        data: {
          includeSensitiveDetails: input.includeSensitiveDetails,
        },
      }),
    );
    updatedCount += result.count;
  }

  return updatedCount > 0;
}

export async function deletePortalPushSubscriptionForUser(
  grants: PortalGrantRow[],
  portalUserId: string,
  endpoint: string,
  now: Date = new Date(),
) {
  const workspaceIds = [...new Set(grants.map((g) => g.workspaceId))];
  let revokedCount = 0;

  for (const workspaceId of workspaceIds) {
    const result = await withScope({ workspaceId }, (tx) =>
      tx.portalPushSubscription.updateMany({
        where: {
          workspaceId,
          portalUserId,
          endpoint,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      }),
    );
    revokedCount += result.count;
  }

  return revokedCount > 0;
}
