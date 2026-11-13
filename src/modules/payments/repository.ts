import type { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";

export async function loadPaymentDashboard(
  scope: Scope,
  query: { sessionId?: string; page: number; pageSize: number },
) {
  return withScope(scope, async (tx) => {
    const [settings, groups, feeRules, sessionRows, attendanceRows, paymentRows, adjustmentRows, paymentCount, adjustmentCount, collectedTotal, adjustmentTotals, collectedBySession] =
      await Promise.all([
        tx.workspaceSettings.findUnique({
          where: { workspaceId: scope.workspaceId },
          select: { timezone: true },
        }),
        tx.group.findMany({
          where: { workspaceId: scope.workspaceId, archivedAt: null },
          select: { id: true, name: true, defaultPricePerStudentMinor: true },
          orderBy: { name: "asc" },
        }),
        tx.feeRule.findMany({
          where: { workspaceId: scope.workspaceId },
          orderBy: { effectiveFrom: "asc" },
        }),
        tx.teachingSession.findMany({
          where: { workspaceId: scope.workspaceId, status: { not: "cancelled" } },
          select: {
            id: true,
            groupId: true,
            startsAt: true,
            pricePerStudentMinor: true,
            group: { select: { name: true, defaultPricePerStudentMinor: true } },
          },
          orderBy: { startsAt: "desc" },
        }),
        tx.attendanceMark.findMany({
          where: {
            workspaceId: scope.workspaceId,
            mark: { in: ["present", "late"] },
            session: { status: { not: "cancelled" } },
          },
          select: { studentId: true, sessionId: true },
        }),
        tx.payment.findMany({
          where: { workspaceId: scope.workspaceId, ...(query.sessionId ? { sessionId: query.sessionId } : {}), voidedAt: null },
          orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: { id: true, amountMinor: true, voidedAt: true, sessionId: true, purpose: true, method: true, methodLabel: true, paidOn: true, referenceNumber: true, note: true, createdBy: true, session: { select: { id: true, startsAt: true, pricePerStudentMinor: true, group: { select: { id: true, name: true, defaultPricePerStudentMinor: true } } } } },
        }),
        tx.paymentAdjustment.findMany({
          where: { workspaceId: scope.workspaceId },
          orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.payment.count({ where: { workspaceId: scope.workspaceId, ...(query.sessionId ? { sessionId: query.sessionId } : {}), voidedAt: null } }),
        tx.paymentAdjustment.count({ where: { workspaceId: scope.workspaceId } }),
        tx.payment.aggregate({
          where: { workspaceId: scope.workspaceId, ...(query.sessionId ? { sessionId: query.sessionId } : {}), voidedAt: null },
          _sum: { amountMinor: true },
        }),
        tx.paymentAdjustment.groupBy({
          by: ["kind"],
          where: { workspaceId: scope.workspaceId },
          _sum: { amountMinor: true },
        }),
        tx.payment.groupBy({
          by: ["sessionId"],
          where: { workspaceId: scope.workspaceId, voidedAt: null, sessionId: { not: null } },
          _sum: { amountMinor: true },
        }),
      ]);

    return {
      timezone: settings?.timezone ?? "Africa/Cairo",
      groups,
      feeRules,
      sessionRows,
      attendanceRows,
      paymentRows,
      adjustmentRows,
      paymentCount,
      adjustmentCount,
      collectedTotal,
      adjustmentTotals,
      collectedBySession,
    };
  });
}

/** The session that anchors a roster payment, with its effective price. */
export async function findSessionForPaymentTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  sessionId: string,
) {
  return tx.teachingSession.findFirst({
    where: { id: sessionId, workspaceId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      pricePerStudentMinor: true,
      group: { select: { defaultPricePerStudentMinor: true } },
    },
  });
}

/** Every non-voided payment linked to a session, including voided ones. */
export async function findSessionLinkedPaymentsTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  sessionId: string,
) {
  return tx.payment.findMany({
    where: { workspaceId, sessionId },
    select: { id: true, voidedAt: true, amountMinor: true },
  });
}

/** Void a session-linked payment. Payments are never deleted (append-only ledger). */
export async function voidPaymentTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  paymentId: string,
  reason: string,
) {
  await tx.payment.updateMany({
    where: { id: paymentId, workspaceId, voidedAt: null },
    data: { voidedAt: new Date(), voidReason: reason },
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
    /** Optional for session-scoped receipts (ADR-0028). */
    studentId?: string | null;
    sessionId: string;
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

  if (input.studentId != null) {
    const student = await tx.student.findFirst({
      where: { id: input.studentId, workspaceId: input.workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!student) return null;
  }

  const { count } = await tx.payment.createMany({
    skipDuplicates: true,
    data: [{
      id: input.id,
      workspaceId: input.workspaceId,
      studentId: input.studentId ?? null,
      sessionId: input.sessionId,
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
    studentId: string | null;
    sessionId: string | null;
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
    studentId?: string | null;
    sessionId: string;
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
    payment.studentId === (input.studentId ?? null) &&
    payment.sessionId === input.sessionId &&
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
    studentId: string | null;
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

  if (input.studentId != null) {
    const student = await tx.student.findFirst({
      where: { id: input.studentId, workspaceId: input.workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (!student) return null;
  }
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
        ...(input.studentId != null ? { studentId: input.studentId } : {}),
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
      studentId: input.studentId ?? null,
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
    studentId: string | null;
    paymentId: string | null;
    kind: string;
    amountMinor: number;
    balanceImpact: number;
    paidOn: Date;
    reason: string;
  },
  input: {
    studentId: string | null;
    paymentId: string | null;
    kind: "discount" | "refund" | "correction";
    amountMinor: number;
    balanceImpact: -1 | 1;
    paidOn: Date;
    reason: string;
  },
) {
  return (
    adjustment.studentId === (input.studentId ?? null) &&
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
