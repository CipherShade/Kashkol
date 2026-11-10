import { withScope } from "@/lib/db/scope";
import { getDb } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";
import type { Scope } from "@/modules/tenancy/types";
import { calculateStudentBalances } from "@/modules/payments/calculations";
import { buildSessionCharges } from "@/modules/payments/session-revenue";
import type { ReportExportQuery, ReportQuery } from "./schemas";

type DateBounds = { from?: Date; toExclusive?: Date; dateFrom?: Date; dateTo?: Date };
type ReportRow = Record<string, string | number | Date | null>;

export async function getReportTimezone(scope: Pick<Scope, "workspaceId">): Promise<string> {
  return withScope(scope, async (tx) => {
    const settings = await tx.workspaceSettings.findUnique({
      where: { workspaceId: scope.workspaceId },
      select: { timezone: true },
    });
    return settings?.timezone ?? "Africa/Cairo";
  });
}

export async function loadReport(
  scope: Pick<Scope, "workspaceId">,
  query: ReportQuery,
  bounds: DateBounds,
  exportLimit?: number,
) {
  return withScope(scope, async (tx) => {
    const settings = await tx.workspaceSettings.findUnique({
      where: { workspaceId: scope.workspaceId },
      select: { timezone: true },
    });
    const timezone = settings?.timezone ?? "Africa/Cairo";
    const offset = exportLimit === undefined ? (query.page - 1) * query.pageSize : 0;
    const take = exportLimit === undefined ? offset + query.pageSize : exportLimit + 1;

    if (query.type === "attendance") {
      const where = {
        workspaceId: scope.workspaceId,
        studentId: query.studentId,
        session: {
          groupId: query.groupId,
          startsAt:
            bounds.from || bounds.toExclusive
              ? { gte: bounds.from, lt: bounds.toExclusive }
              : undefined,
        },
      };
      const [rows, total] = await Promise.all([
        tx.attendanceMark.findMany({
          where,
          include: {
            student: { select: { firstName: true, lastName: true } },
            session: { select: { startsAt: true, status: true, group: { select: { name: true } } } },
          },
          orderBy: [{ session: { startsAt: "desc" } }, { id: "desc" }],
          skip: exportLimit === undefined ? offset : 0,
          take: exportLimit ?? query.pageSize,
        }),
        tx.attendanceMark.count({ where }),
      ]);
      return {
        timezone,
        total,
        items: rows.map(
          (row): ReportRow => ({
            date: row.session.startsAt,
            group: row.session.group.name,
            student: `${row.student.firstName} ${row.student.lastName}`,
            attendance: row.mark,
            sessionStatus: row.session.status,
          }),
        ),
      };
    }

    if (query.type === "enrollment") {
      const where = {
        workspaceId: scope.workspaceId,
        studentId: query.studentId,
        groupId: query.groupId,
        enrolledAt:
          bounds.from || bounds.toExclusive
            ? { gte: bounds.from, lt: bounds.toExclusive }
            : undefined,
      };
      const [rows, total] = await Promise.all([
        tx.enrollment.findMany({
          where,
          include: {
            student: { select: { firstName: true, lastName: true } },
            group: { select: { name: true } },
          },
          orderBy: [{ enrolledAt: "desc" }, { id: "desc" }],
          skip: exportLimit === undefined ? offset : 0,
          take: exportLimit ?? query.pageSize,
        }),
        tx.enrollment.count({ where }),
      ]);
      return {
        timezone,
        total,
        items: rows.map(
          (row): ReportRow => ({
            student: `${row.student.firstName} ${row.student.lastName}`,
            group: row.group.name,
            enrolledOn: row.enrolledAt,
            leftOn: row.leftAt,
          }),
        ),
      };
    }

    if (query.type === "academics") {
      const where = {
        workspaceId: scope.workspaceId,
        studentId: query.studentId,
        assessment: {
          groupId: query.groupId,
          date:
            bounds.dateFrom || bounds.dateTo
              ? { gte: bounds.dateFrom, lte: bounds.dateTo }
              : undefined,
        },
      };
      const [rows, total] = await Promise.all([
        tx.assessmentScore.findMany({
          where,
          include: {
            student: { select: { firstName: true, lastName: true } },
            assessment: { select: { title: true, date: true, maxScore: true, group: { select: { name: true } } } },
          },
          orderBy: [{ assessment: { date: "desc" } }, { id: "desc" }],
          skip: exportLimit === undefined ? offset : 0,
          take: exportLimit ?? query.pageSize,
        }),
        tx.assessmentScore.count({ where }),
      ]);
      return {
        timezone,
        total,
        items: rows.map(
          (row): ReportRow => ({
            date: row.assessment.date,
            group: row.assessment.group.name,
            student: `${row.student.firstName} ${row.student.lastName}`,
            assessment: row.assessment.title,
            score: row.score === null ? null : row.score.toString(),
            maximum: row.assessment.maxScore.toString(),
            status: row.status,
          }),
        ),
      };
    }

    if (query.type === "homework") {
      const where = {
        workspaceId: scope.workspaceId,
        studentId: query.studentId,
        homework: {
          groupId: query.groupId,
          dueAt:
            bounds.from || bounds.toExclusive
              ? { gte: bounds.from, lt: bounds.toExclusive }
              : undefined,
        },
      };
      const [rows, total] = await Promise.all([
        tx.homeworkSubmission.findMany({
          where,
          include: {
            student: { select: { firstName: true, lastName: true } },
            homework: { select: { title: true, dueAt: true, group: { select: { name: true } } } },
          },
          orderBy: [{ homework: { dueAt: "desc" } }, { id: "desc" }],
          skip: exportLimit === undefined ? offset : 0,
          take: exportLimit ?? query.pageSize,
        }),
        tx.homeworkSubmission.count({ where }),
      ]);
      return {
        timezone,
        total,
        items: rows.map(
          (row): ReportRow => ({
            dueDate: row.homework.dueAt,
            group: row.homework.group?.name ?? null,
            student: `${row.student.firstName} ${row.student.lastName}`,
            homework: row.homework.title,
            status: row.status,
            updatedAt: row.updatedAt,
          }),
        ),
      };
    }

    if (query.type === "balances") {
      const asOf = query.to;
      if (!asOf || !bounds.toExclusive) {
        throw new Error("A balance report requires an as-of date");
      }
      const asOfMonth = asOf.slice(0, 7);
      const studentWhere = {
        workspaceId: scope.workspaceId,
        archivedAt: null,
        ...(query.studentId ? { id: query.studentId } : {}),
        ...(query.groupId
          ? { enrollments: { some: { groupId: query.groupId } } }
          : {}),
      };
      const [students, selectedGroup, feeRules, enrollments, pricedSessions, chargedMarks, paymentTotals, adjustmentTotals, sessionPricedGroups] =
        await Promise.all([
          tx.student.findMany({
            where: studentWhere,
            select: { id: true, firstName: true, lastName: true },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
          }),
          query.groupId
            ? tx.group.findFirst({
                where: { id: query.groupId, workspaceId: scope.workspaceId },
                select: { name: true },
              })
            : Promise.resolve(null),
          tx.feeRule.findMany({
            where: { workspaceId: scope.workspaceId, effectiveFrom: { lt: bounds.toExclusive } },
            select: { studentId: true, groupId: true, amountMinor: true, effectiveFrom: true },
          }),
          tx.enrollment.findMany({
            where: { workspaceId: scope.workspaceId },
            select: { studentId: true, groupId: true, enrolledAt: true, leftAt: true },
          }),
          tx.teachingSession.findMany({
            where: {
              workspaceId: scope.workspaceId,
              status: { not: "cancelled" },
              startsAt: { lt: bounds.toExclusive },
            },
            select: {
              id: true,
              groupId: true,
              pricePerStudentMinor: true,
              group: { select: { defaultPricePerStudentMinor: true } },
            },
          }),
          tx.attendanceMark.findMany({
            where: {
              workspaceId: scope.workspaceId,
              student: studentWhere,
              mark: { in: ["present", "late"] },
              session: {
                status: { not: "cancelled" },
                startsAt: { lt: bounds.toExclusive },
              },
            },
            select: { studentId: true, sessionId: true },
          }),
          tx.payment.groupBy({
            by: ["studentId"],
            where: {
              workspaceId: scope.workspaceId,
              student: studentWhere,
              paidOn: { lt: bounds.toExclusive },
              voidedAt: null,
            },
            _sum: { amountMinor: true },
          }),
          tx.paymentAdjustment.groupBy({
            by: ["studentId", "balanceImpact"],
            where: {
              workspaceId: scope.workspaceId,
              student: studentWhere,
              paidOn: { lt: bounds.toExclusive },
            },
            _sum: { amountMinor: true },
          }),
          tx.group.findMany({
            where: { workspaceId: scope.workspaceId, defaultPricePerStudentMinor: { gt: 0 } },
            select: { id: true },
          }),
        ]);
      const paymentByStudent = new Map(
        paymentTotals.map((row) => [row.studentId, row._sum.amountMinor ?? 0]),
      );
      const sessionCharges = buildSessionCharges(
        pricedSessions,
        chargedMarks,
        sessionPricedGroups.map((g) => g.id),
      );
      const balances = calculateStudentBalances({
        students,
        feeRules,
        enrollments,
        payments: students.map((student) => ({
          studentId: student.id,
          amountMinor: paymentByStudent.get(student.id) ?? 0,
          voidedAt: null,
        })),
        adjustments: adjustmentTotals.map((row) => ({
          studentId: row.studentId,
          amountMinor: row._sum.amountMinor ?? 0,
          balanceImpact: row.balanceImpact,
        })),
        sessionCharges: sessionCharges.charges,
        sessionPricedGroupIds: sessionCharges.sessionPricedGroupIds,
        asOfMonth,
        timezone,
      });
      const studentsById = new Map(students.map((student) => [student.id, student]));
      const rows = balances
        .filter(
          (balance) =>
            balance.expectedMinor !== 0 ||
            balance.receivedMinor !== 0 ||
            balance.adjustmentsMinor !== 0,
        )
        .map((balance): ReportRow => {
          const student = studentsById.get(balance.studentId);
          if (!student) throw new Error("Balance report student is missing");
          return {
            asOf,
            student: `${student.firstName} ${student.lastName}`,
            group: selectedGroup?.name ?? null,
            expectedMinor: balance.expectedMinor,
            receivedMinor: balance.receivedMinor,
            adjustmentsMinor: balance.adjustmentsMinor,
            balanceMinor: balance.balanceMinor,
          };
        });
      const total = rows.length;
      const visible = rows.slice(
        exportLimit === undefined ? offset : 0,
        exportLimit === undefined ? offset + query.pageSize : exportLimit,
      );
      return { timezone, total, items: visible };
    }

    const studentFilter = {
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.groupId ? { student: { enrollments: { some: { groupId: query.groupId } } } } : {}),
    };
    const paidOn =
      bounds.dateFrom || bounds.dateTo
        ? { gte: bounds.dateFrom, lte: bounds.dateTo }
        : undefined;
    const paymentWhere = {
      workspaceId: scope.workspaceId,
      ...studentFilter,
      paidOn,
    };
    const adjustmentWhere = {
      workspaceId: scope.workspaceId,
      ...studentFilter,
      paidOn,
    };
    const [paymentRows, adjustmentRows, paymentCount, adjustmentCount] = await Promise.all([
      tx.payment.findMany({
        where: paymentWhere,
        include: { student: { select: { firstName: true, lastName: true } } },
        orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
        take,
      }),
      tx.paymentAdjustment.findMany({
        where: adjustmentWhere,
        include: { student: { select: { firstName: true, lastName: true } } },
        orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
        take,
      }),
      tx.payment.count({ where: paymentWhere }),
      tx.paymentAdjustment.count({ where: adjustmentWhere }),
    ]);
    const items: Array<ReportRow & { sortDate: Date; sortCreated: Date }> = [
      ...paymentRows.map((row) => ({
        date: row.paidOn,
        student: `${row.student.firstName} ${row.student.lastName}`,
        kind: "receipt",
        amountMinor: row.amountMinor,
        balanceImpact: -1,
        period: row.period,
        purpose: row.purpose,
        method: row.methodLabel ?? row.method,
        referenceNumber: row.referenceNumber,
        reason: null,
        status: row.voidedAt ? "voided" : "recorded",
        sortDate: row.paidOn,
        sortCreated: row.createdAt,
      })),
      ...adjustmentRows.map((row) => ({
        date: row.paidOn,
        student: `${row.student.firstName} ${row.student.lastName}`,
        kind: row.kind,
        amountMinor: row.amountMinor,
        balanceImpact: row.balanceImpact,
        period: null,
        purpose: null,
        method: null,
        referenceNumber: null,
        reason: row.reason,
        status: "recorded",
        sortDate: row.paidOn,
        sortCreated: row.createdAt,
      })),
    ];
    items.sort(
      (left, right) =>
        right.sortDate.getTime() - left.sortDate.getTime() ||
        right.sortCreated.getTime() - left.sortCreated.getTime(),
    );
    const visible = items.slice(exportLimit === undefined ? offset : 0, exportLimit === undefined ? offset + query.pageSize : exportLimit);
    return {
      timezone,
      total: paymentCount + adjustmentCount,
      items: visible.map(({ sortDate: _sortDate, sortCreated: _sortCreated, ...row }) => row),
    };
  });
}

export async function createReportExportJob(
  scope: Scope,
  input: { id: string; query: ReportExportQuery; filename: string },
  onCreated: (tx: Prisma.TransactionClient, jobId: string) => Promise<void>,
) {
  const storedQuery: Prisma.InputJsonObject = {
    type: input.query.type,
    ...(input.query.from ? { from: input.query.from } : {}),
    ...(input.query.to ? { to: input.query.to } : {}),
    ...(input.query.groupId ? { groupId: input.query.groupId } : {}),
    ...(input.query.studentId ? { studentId: input.query.studentId } : {}),
    limit: input.query.limit,
    locale: input.query.locale,
  };
  return withScope(scope, async (tx) => {
    const job = await tx.reportExport.create({
      data: {
        id: input.id,
        workspaceId: scope.workspaceId,
        type: input.query.type,
        query: storedQuery,
        requestedBy: scope.actorUserId,
        filename: input.filename,
      },
      select: { id: true, status: true, createdAt: true },
    });
    await tx.$executeRaw`
      INSERT INTO "report_export_queue" ("job_id", "workspace_id")
      VALUES (${job.id}::uuid, ${scope.workspaceId}::uuid)
    `;
    await onCreated(tx, job.id);
    return job;
  });
}

export async function findReportExport(scope: Scope, exportId: string) {
  return withScope(scope, (tx) =>
    tx.reportExport.findFirst({
      where: { id: exportId, workspaceId: scope.workspaceId },
      select: {
        id: true,
        type: true,
        status: true,
        filename: true,
        storageKey: true,
        failureCode: true,
        createdAt: true,
        completedAt: true,
      },
    }),
  );
}

export async function claimReportExportJobs(limit: number) {
  const db = getDb();
  return db.$transaction((tx) =>
    tx.$queryRaw<Array<{ job_id: string; workspace_id: string }>>`
      WITH candidates AS (
        SELECT "job_id"
        FROM "report_export_queue"
        WHERE "status" = 'queued'
          OR ("status" = 'processing' AND "locked_at" < NOW() - INTERVAL '5 minutes')
        ORDER BY "created_at"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "report_export_queue" AS queue
      SET "status" = 'processing',
          "locked_at" = NOW(),
          "attempts" = queue."attempts" + 1
      FROM candidates
      WHERE queue."job_id" = candidates."job_id"
      RETURNING queue."job_id", queue."workspace_id"
    `,
  );
}

export async function findReportExportForWorker(workspaceId: string, exportId: string) {
  return withScope({ workspaceId }, (tx) =>
    tx.reportExport.findFirst({
      where: { id: exportId, workspaceId },
      select: {
        id: true,
        type: true,
        query: true,
        status: true,
        requestedBy: true,
        filename: true,
      },
    }),
  );
}

export async function canUserReadReport(
  workspaceId: string,
  userId: string,
  resource: "attendance" | "students" | "grades" | "homework" | "payments",
) {
  return withScope({ workspaceId }, async (tx) => {
    const member = await tx.workspaceMember.findFirst({
      where: { workspaceId, userId, status: "active" },
      select: { id: true, role: true },
    });
    if (!member) return false;
    if (member.role === "owner") return true;
    const grants = await tx.permissionGrant.findMany({
      where: {
        workspaceId,
        memberId: member.id,
        action: "read",
        resource: { in: [resource, "exports"] },
      },
      select: { resource: true },
    });
    const held = new Set(grants.map((grant) => grant.resource));
    return held.has(resource) && held.has("exports");
  });
}

export async function completeReportExport(
  workspaceId: string,
  exportId: string,
  storageKey: string,
  onCompleted: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  return withScope({ workspaceId }, async (tx) => {
    const result = await tx.reportExport.updateMany({
      where: { id: exportId, workspaceId, status: { in: ["queued", "processing"] } },
      data: { status: "ready", storageKey, completedAt: new Date(), failureCode: null },
    });
    if (result.count) await onCompleted(tx);
    return result;
  });
}

export async function failReportExport(
  workspaceId: string,
  exportId: string,
  failureCode: string,
  onFailed: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  return withScope({ workspaceId }, async (tx) => {
    const result = await tx.reportExport.updateMany({
      where: { id: exportId, workspaceId, status: { in: ["queued", "processing"] } },
      data: { status: "failed", failureCode, completedAt: new Date() },
    });
    if (result.count) await onFailed(tx);
    return result;
  });
}

export async function removeReportExportQueueEntry(jobId: string, workspaceId: string) {
  const db = getDb();
  return db.$executeRaw`
    DELETE FROM "report_export_queue"
    WHERE "job_id" = ${jobId}::uuid AND "workspace_id" = ${workspaceId}::uuid
  `;
}
