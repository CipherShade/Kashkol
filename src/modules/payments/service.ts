import { AppError } from "@/lib/http/errors";
import { newRequestId } from "@/lib/http/request-id";
import { newUuidV7 } from "@/lib/id";
import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import { assertOwner, type Scope } from "@/modules/tenancy/types";
import { currentDateInTimezone } from "./calculations";
import { createPaymentTx, getSessionRevenueDataTx, loadPaymentDashboard } from "./repository";
import { buildSessionRevenueSummary } from "./session-revenue";
import { egpToMinorUnits } from "./schemas";
import type { PaymentQuery, RecordPaymentInput } from "./schemas";

type RequestContext = { requestId?: string; ipHash?: string | null };

function context(req?: RequestContext) {
  return { requestId: req?.requestId ?? newRequestId(), ipHash: req?.ipHash ?? null };
}

/** Money is the workspace owner's alone; assistants cannot see or record it. */
function assertMoneyViewer(scope: Scope): void {
  assertOwner(scope);
}

export async function getPayments(scope: Scope, query: PaymentQuery, now = new Date()) {
  assertMoneyViewer(scope);
  const data = await loadPaymentDashboard(scope, query);

  const collectedBySession = new Map<string, number>();
  for (const payment of data.paymentRows) {
    collectedBySession.set(
      payment.sessionId,
      (collectedBySession.get(payment.sessionId) ?? 0) + payment.amountMinor,
    );
  }

  const sessions = data.sessionRows.map((session) => ({
    id: session.id,
    groupId: session.groupId,
    groupName: session.group?.name ?? "",
    gradeLabel: session.gradeLabel,
    startsAt: session.startsAt.toISOString(),
    cancelled: session.status === "cancelled",
    pricePerStudentMinor: session.pricePerStudentMinor,
    collectedRevenueMinor: collectedBySession.get(session.id) ?? 0,
  }));

  return {
    timezone: data.timezone,
    today: currentDateInTimezone(now, data.timezone),
    groups: data.groups,
    sessions,
    payments: data.paymentRows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      paymentCount: data.paymentCount,
    },
    totals: {
      collectedMinor: data.collectedTotal._sum.amountMinor ?? 0,
    },
  };
}

export async function recordPayment(
  scope: Scope,
  input: RecordPaymentInput,
  req?: RequestContext,
) {
  assertMoneyViewer(scope);
  if (!scope.actorUserId) throw new AppError("FORBIDDEN");
  const log = context(req);

  return withScope(scope, async (tx) => {
    const saved = await createPaymentTx(tx, {
      id: newUuidV7(),
      workspaceId: scope.workspaceId,
      sessionId: input.sessionId,
      amountMinor: egpToMinorUnits(input.amount),
      method: input.method,
      methodLabel: input.methodLabel ?? null,
      paidOn: new Date(`${input.paidOn}T00:00:00.000Z`),
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
          sessionId: input.sessionId,
          amountMinor: saved.payment.amountMinor,
          method: saved.payment.method,
        },
        requestId: log.requestId,
        ipHash: log.ipHash,
      });
    }
    return { payment: saved.payment, duplicate: saved.duplicate };
  });
}

export async function getSessionRevenueSummary(scope: Scope, sessionId: string) {
  assertMoneyViewer(scope);
  return withScope(scope, async (tx) => {
    const data = await getSessionRevenueDataTx(tx, scope.workspaceId, sessionId);
    if (!data) throw new AppError("NOT_FOUND");
    return buildSessionRevenueSummary(data.payments);
  });
}
