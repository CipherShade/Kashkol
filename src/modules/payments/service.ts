import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { authorize, type Scope } from "@/modules/tenancy/types";
import {
  calculateStudentBalances,
  currentDateInTimezone,
  currentMonthInTimezone,
} from "./calculations";
import {
  createAdjustmentTx,
  createFeeRuleTx,
  createPaymentTx,
  loadPaymentDashboard,
} from "./repository";
import { egpToMinorUnits } from "./schemas";
import type {
  CreateAdjustmentInput,
  CreateFeeRuleInput,
  PaymentQuery,
  RecordPaymentInput,
} from "./schemas";

type RequestContext = { requestId?: string; ipHash?: string | null };

function context(req?: RequestContext) {
  return { requestId: req?.requestId ?? newRequestId(), ipHash: req?.ipHash ?? null };
}

function safeSum(values: number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new AppError("CONFLICT", { messageKey: "payments.errors.totalOutOfRange" });
    }
  }
  return total;
}

export async function getPayments(scope: Scope, query: PaymentQuery, now = new Date()) {
  authorize(scope, "payments", "read");
  const data = await loadPaymentDashboard(scope, query);
  if (query.studentId && !data.students.some((student) => student.id === query.studentId)) {
    throw new AppError("NOT_FOUND");
  }

  const balances = calculateStudentBalances({
    students: data.students,
    feeRules: data.feeRules,
    enrollments: data.enrollments,
    payments: data.paymentTotals.map((row) => ({
      studentId: row.studentId,
      amountMinor: row._sum.amountMinor ?? 0,
      voidedAt: null,
    })),
    adjustments: data.adjustmentTotals.map((row) => ({
      studentId: row.studentId,
      amountMinor: row._sum.amountMinor ?? 0,
      balanceImpact: row.balanceImpact,
    })),
    asOfMonth: currentMonthInTimezone(now, data.timezone),
    timezone: data.timezone,
  });

  const studentById = new Map(data.students.map((student) => [student.id, student]));
  const balancesWithNames = balances
    .flatMap((balance) => {
      const student = studentById.get(balance.studentId);
      return student ? [{ ...balance, student }] : [];
    })
    .filter((balance) => !query.studentId || balance.studentId === query.studentId)
    .sort((left, right) => right.balanceMinor - left.balanceMinor);

  const grossCollectedMinor = safeSum(
    data.paymentTotals.map((row) => row._sum.amountMinor ?? 0),
  );
  const refundedMinor = safeSum(
    data.adjustmentTotals
      .filter((row) => row.kind === "refund")
      .map((row) => row._sum.amountMinor ?? 0),
  );
  const outstandingMinor = safeSum(
    balancesWithNames.filter((balance) => balance.balanceMinor > 0).map((balance) => balance.balanceMinor),
  );
  const creditMinor = safeSum(
    balancesWithNames.filter((balance) => balance.balanceMinor < 0).map((balance) => -balance.balanceMinor),
  );

  return {
    timezone: data.timezone,
    today: currentDateInTimezone(now, data.timezone),
    students: data.students,
    groups: data.groups,
    balances: balancesWithNames,
    feeRules: data.feeRules,
    payments: data.paymentRows,
    adjustments: data.adjustmentRows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      paymentCount: data.paymentCount,
      adjustmentCount: data.adjustmentCount,
    },
    totals: {
      grossCollectedMinor,
      refundedMinor,
      collectedMinor: grossCollectedMinor - refundedMinor,
      outstandingMinor,
      creditMinor,
    },
  };
}

export async function recordPayment(
  scope: Scope,
  input: RecordPaymentInput,
  req?: RequestContext,
) {
  authorize(scope, "payments", "write");
  if (!scope.actorUserId) throw new AppError("FORBIDDEN");
  const log = context(req);

  return withScope(scope, async (tx) => {
    const saved = await createPaymentTx(tx, {
      id: newUuidV7(),
      workspaceId: scope.workspaceId,
      studentId: input.studentId,
      amountMinor: egpToMinorUnits(input.amount),
      period: input.period ?? null,
      purpose: input.purpose ?? null,
      method: input.method,
      methodLabel: input.methodLabel ?? null,
      paidOn: new Date(`${input.paidOn}T00:00:00.000Z`),
      referenceNumber: input.referenceNumber ?? null,
      note: input.note ?? null,
      idempotencyKey: input.idempotencyKey,
      createdBy: scope.actorUserId,
    });
    if (!saved) throw new AppError("NOT_FOUND");
    if (!saved.matches) {
      throw new AppError("CONFLICT", { messageKey: "payments.errors.duplicateMismatch" });
    }
    if (!saved.duplicate) {
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "payment",
        entityId: saved.payment.id,
        action: "payment.recorded",
        diff: {
          studentId: input.studentId,
          amountMinor: saved.payment.amountMinor,
          period: saved.payment.period,
          purpose: saved.payment.purpose,
          method: saved.payment.method,
        },
        requestId: log.requestId,
        ipHash: log.ipHash,
      });
    }
    return { payment: saved.payment, duplicate: saved.duplicate };
  });
}

export async function createPaymentAdjustment(
  scope: Scope,
  input: CreateAdjustmentInput,
  req?: RequestContext,
) {
  authorize(scope, "payments", "write");
  if (!scope.actorUserId) throw new AppError("FORBIDDEN");
  const log = context(req);
  const balanceImpact =
    input.kind === "discount"
      ? -1
      : input.kind === "refund"
        ? 1
        : input.direction === "increase_due"
          ? 1
          : -1;

  return withScope(scope, async (tx) => {
    const saved = await createAdjustmentTx(tx, {
      id: newUuidV7(),
      workspaceId: scope.workspaceId,
      studentId: input.studentId,
      paymentId: input.paymentId ?? null,
      kind: input.kind,
      amountMinor: egpToMinorUnits(input.amount),
      balanceImpact,
      paidOn: new Date(`${input.paidOn}T00:00:00.000Z`),
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      createdBy: scope.actorUserId,
    });
    if (!saved) throw new AppError("NOT_FOUND");
    if ("refundExceedsReceived" in saved) {
      throw new AppError("VALIDATION_FAILED", {
        fields: { amount: ["refundExceedsReceived"] },
      });
    }
    if (!saved.matches) {
      throw new AppError("CONFLICT", { messageKey: "payments.errors.duplicateMismatch" });
    }
    if (!saved.duplicate) {
      await writeAuditEvent(tx, {
        workspaceId: scope.workspaceId,
        actorUserId: scope.actorUserId,
        actorDisplayName: scope.actorDisplayName,
        actorType: "user",
        entityType: "payment_adjustment",
        entityId: saved.adjustment.id,
        action: `payment.${input.kind}_recorded`,
        diff: {
          studentId: input.studentId,
          paymentId: input.paymentId ?? null,
          amountMinor: saved.adjustment.amountMinor,
          balanceImpact: saved.adjustment.balanceImpact,
        },
        requestId: log.requestId,
        ipHash: log.ipHash,
      });
    }
    return { adjustment: saved.adjustment, duplicate: saved.duplicate };
  });
}

export async function createFeeRule(
  scope: Scope,
  input: CreateFeeRuleInput,
  req?: RequestContext,
) {
  authorize(scope, "payments", "write");
  if (!scope.actorUserId) throw new AppError("FORBIDDEN");
  const log = context(req);
  const effectiveFrom = new Date(`${input.effectiveFrom}-01T00:00:00.000Z`);

  return withScope(scope, async (tx) => {
    const saved = await createFeeRuleTx(tx, {
      id: newUuidV7(),
      workspaceId: scope.workspaceId,
      studentId: input.studentId ?? null,
      groupId: input.groupId ?? null,
      amountMinor: egpToMinorUnits(input.amount),
      effectiveFrom,
      purpose: input.purpose,
      createdBy: scope.actorUserId,
    });
    if (!saved) throw new AppError("NOT_FOUND");
    if (saved.duplicate) {
      throw new AppError("CONFLICT", { messageKey: "payments.errors.feeRuleAlreadyExists" });
    }
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "fee_rule",
      entityId: saved.rule.id,
      action: "payment.fee_rule_recorded",
      diff: {
        studentId: input.studentId ?? null,
        groupId: input.groupId ?? null,
        amountMinor: saved.rule.amountMinor,
        effectiveFrom: input.effectiveFrom,
      },
      requestId: log.requestId,
      ipHash: log.ipHash,
    });
    return saved.rule;
  });
}
