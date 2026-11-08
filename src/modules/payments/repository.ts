import type { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";

export async function loadPaymentDashboard(
  scope: Scope,
  query: { studentId?: string; page: number; pageSize: number },
) {
  return withScope(scope, async (tx) => {
    const [settings, students, groups, feeRules, enrollments, paymentRows, adjustmentRows, paymentCount, adjustmentCount, paymentTotals, adjustmentTotals] =
      await Promise.all([
        tx.workspaceSettings.findUnique({
          where: { workspaceId: scope.workspaceId },
          select: { timezone: true },
        }),
        tx.student.findMany({
          where: { workspaceId: scope.workspaceId, archivedAt: null },
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        }),
        tx.group.findMany({
          where: { workspaceId: scope.workspaceId, archivedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        tx.feeRule.findMany({
          where: { workspaceId: scope.workspaceId },
          orderBy: { effectiveFrom: "asc" },
        }),
        tx.enrollment.findMany({
          where: { workspaceId: scope.workspaceId },
          select: { studentId: true, groupId: true, enrolledAt: true, leftAt: true },
        }),
        tx.payment.findMany({
          where: { workspaceId: scope.workspaceId, studentId: query.studentId },
          orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.paymentAdjustment.findMany({
          where: { workspaceId: scope.workspaceId, studentId: query.studentId },
          orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.payment.count({ where: { workspaceId: scope.workspaceId, studentId: query.studentId } }),
        tx.paymentAdjustment.count({
          where: { workspaceId: scope.workspaceId, studentId: query.studentId },
        }),
        tx.payment.groupBy({
          by: ["studentId"],
          where: { workspaceId: scope.workspaceId, studentId: query.studentId, voidedAt: null },
          _sum: { amountMinor: true },
        }),
        tx.paymentAdjustment.groupBy({
          by: ["studentId", "balanceImpact", "kind"],
          where: { workspaceId: scope.workspaceId, studentId: query.studentId },
          _sum: { amountMinor: true },
        }),
      ]);

    return {
      timezone: settings?.timezone ?? "Africa/Cairo",
      students,
      groups,
      feeRules,
      enrollments,
      paymentRows,
      adjustmentRows,
      paymentCount,
      adjustmentCount,
      paymentTotals,
      adjustmentTotals,
    };
  });
}

export async function findPaymentByIdTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  paymentId: string,
) {
  return tx.payment.findFirst({ where: { id: paymentId, workspaceId } });
}

export async function getSessionRevenueDataTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  sessionId: string,
) {
  const [session, payments, marks] = await Promise.all([
    tx.teachingSession.findFirst({
      where: { id: sessionId, workspaceId },
      select: {
        id: true,
        pricePerStudentMinor: true,
        group: { select: { defaultPricePerStudentMinor: true } },
      },
    }),
    tx.payment.findMany({
      where: { workspaceId, sessionId },
      select: { amountMinor: true, voidedAt: true },
    }),
    tx.attendanceMark.findMany({
      where: { workspaceId, sessionId, mark: { in: ["present", "late"] } },
      select: { id: true },
    }),
  ]);
  if (!session) return null;
  return {
    pricePerStudentMinor:
      session.pricePerStudentMinor ?? session.group.defaultPricePerStudentMinor ?? null,
    eligibleAttendanceCount: marks.length,
    payments,
  };
}

export async function createPaymentTx(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    workspaceId: string;
    studentId: string;
    sessionId?: string | null;
    amountMinor: number;
    period: string | null;
    purpose: string | null;
    method: "cash" | "transfer" | "other";
    methodLabel: string | null;
    paidOn: Date;
    referenceNumber: string | null;
    note: string | null;
    idempotencyKey: string;
    createdBy: string;
  },
) {
  const prior = await tx.payment.findFirst({
    where: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey },
  });
  if (prior) return { payment: prior, duplicate: true, matches: paymentMatches(prior, input) };

  const student = await tx.student.findFirst({
    where: { id: input.studentId, workspaceId: input.workspaceId, archivedAt: null },
    select: { id: true },
  });
  if (!student) return null;

  const { count } = await tx.payment.createMany({
    skipDuplicates: true,
    data: [{
      id: input.id,
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      sessionId: input.sessionId ?? null,
      period: input.period,
      purpose: input.purpose,
      amountMinor: input.amountMinor,
      currency: "EGP",
      method: input.method,
      methodLabel: input.methodLabel,
      paidOn: input.paidOn,
      referenceNumber: input.referenceNumber,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
      createdBy: input.createdBy,
    }],
  });
  const payment = await tx.payment.findFirst({
    where: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey },
  });
  if (!payment) throw new Error("Payment insert was ignored without a matching idempotency record");
  return { payment, duplicate: count === 0, matches: paymentMatches(payment, input) };
}

function paymentMatches(
  payment: {
    studentId: string;
    sessionId?: string | null;
    amountMinor: number;
    period: string | null;
    purpose: string | null;
    method: string;
    methodLabel: string | null;
    paidOn: Date;
    referenceNumber: string | null;
    note: string | null;
  },
  input: {
    studentId: string;
    sessionId?: string | null;
    amountMinor: number;
    period: string | null;
    purpose: string | null;
    method: "cash" | "transfer" | "other";
    methodLabel: string | null;
    paidOn: Date;
    referenceNumber: string | null;
    note: string | null;
  },
) {
  return (
    payment.studentId === input.studentId &&
    payment.sessionId === (input.sessionId ?? null) &&
    payment.amountMinor === input.amountMinor &&
    payment.period === input.period &&
    payment.purpose === input.purpose &&
    payment.method === input.method &&
    payment.methodLabel === input.methodLabel &&
    payment.paidOn.getTime() === input.paidOn.getTime() &&
    payment.referenceNumber === input.referenceNumber &&
    payment.note === input.note
  );
}

export async function createAdjustmentTx(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    workspaceId: string;
    studentId: string;
    paymentId: string | null;
    kind: "discount" | "refund" | "correction";
    amountMinor: number;
    balanceImpact: -1 | 1;
    paidOn: Date;
    reason: string;
    idempotencyKey: string;
    createdBy: string;
  },
) {
  const prior = await tx.paymentAdjustment.findFirst({
    where: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey },
  });
  if (prior) return { adjustment: prior, duplicate: true, matches: adjustmentMatches(prior, input) };

  const student = await tx.student.findFirst({
    where: { id: input.studentId, workspaceId: input.workspaceId, archivedAt: null },
    select: { id: true },
  });
  if (!student) return null;
  if (input.paymentId) {
    await tx.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${input.workspaceId} || ':' || ${input.paymentId}, 0)
      ) IS NULL AS acquired
    `;
    const payment = await tx.payment.findFirst({
      where: {
        id: input.paymentId,
        workspaceId: input.workspaceId,
        studentId: input.studentId,
      },
      select: { id: true, amountMinor: true },
    });
    if (!payment) return null;
    if (input.kind === "refund") {
      const afterLockDuplicate = await tx.paymentAdjustment.findFirst({
        where: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey },
      });
      if (afterLockDuplicate) {
        return {
          adjustment: afterLockDuplicate,
          duplicate: true,
          matches: adjustmentMatches(afterLockDuplicate, input),
        };
      }
      const refunds = await tx.paymentAdjustment.aggregate({
        where: {
          workspaceId: input.workspaceId,
          paymentId: input.paymentId,
          kind: "refund",
        },
        _sum: { amountMinor: true },
      });
      if ((refunds._sum.amountMinor ?? 0) + input.amountMinor > payment.amountMinor) {
        return { refundExceedsReceived: true as const };
      }
    }
  }

  const { count } = await tx.paymentAdjustment.createMany({
    skipDuplicates: true,
    data: [{
      id: input.id,
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      paymentId: input.paymentId,
      kind: input.kind,
      amountMinor: input.amountMinor,
      balanceImpact: input.balanceImpact,
      currency: "EGP",
      paidOn: input.paidOn,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      createdBy: input.createdBy,
    }],
  });
  const adjustment = await tx.paymentAdjustment.findFirst({
    where: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey },
  });
  if (!adjustment) throw new Error("Adjustment insert was ignored without a matching idempotency record");
  return { adjustment, duplicate: count === 0, matches: adjustmentMatches(adjustment, input) };
}

function adjustmentMatches(
  adjustment: {
    studentId: string;
    paymentId: string | null;
    kind: string;
    amountMinor: number;
    balanceImpact: number;
    paidOn: Date;
    reason: string;
  },
  input: {
    studentId: string;
    paymentId: string | null;
    kind: "discount" | "refund" | "correction";
    amountMinor: number;
    balanceImpact: -1 | 1;
    paidOn: Date;
    reason: string;
  },
) {
  return (
    adjustment.studentId === input.studentId &&
    adjustment.paymentId === input.paymentId &&
    adjustment.kind === input.kind &&
    adjustment.amountMinor === input.amountMinor &&
    adjustment.balanceImpact === input.balanceImpact &&
    adjustment.paidOn.getTime() === input.paidOn.getTime() &&
    adjustment.reason === input.reason
  );
}

export async function createFeeRuleTx(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    workspaceId: string;
    studentId: string | null;
    groupId: string | null;
    amountMinor: number;
    effectiveFrom: Date;
    purpose: string;
    createdBy: string;
  },
) {
  const prior = await tx.feeRule.findFirst({
    where: {
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      groupId: input.groupId,
      effectiveFrom: input.effectiveFrom,
    },
  });
  if (prior) return { rule: prior, duplicate: true };

  if (input.studentId) {
    const student = await tx.student.findFirst({
      where: { id: input.studentId, workspaceId: input.workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!student) return null;
  } else if (input.groupId) {
    const group = await tx.group.findFirst({
      where: { id: input.groupId, workspaceId: input.workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!group) return null;
  } else {
    return null;
  }

  const { count } = await tx.feeRule.createMany({
    skipDuplicates: true,
    data: [{
      id: input.id,
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      groupId: input.groupId,
      amountMinor: input.amountMinor,
      effectiveFrom: input.effectiveFrom,
      purpose: input.purpose,
      createdBy: input.createdBy,
    }],
  });
  const rule = await tx.feeRule.findFirst({
    where: {
      workspaceId: input.workspaceId,
      studentId: input.studentId,
      groupId: input.groupId,
      effectiveFrom: input.effectiveFrom,
    },
  });
  if (!rule) throw new Error("Fee rule insert was ignored without a matching target record");
  return { rule, duplicate: count === 0 };
}
