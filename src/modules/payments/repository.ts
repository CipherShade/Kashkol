import type { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";

/**
 * Reads and writes for owner-only collected session receipts.
 *
 * The physical schema contains only session-linked, non-voided receipts
 * (`ADR-0043`). No projection, adjustment, or legacy money field is available.
 */
export async function loadPaymentDashboard(
  scope: Scope,
  query: { sessionId?: string; page: number; pageSize: number },
) {
  return withScope(scope, async (tx) => {
    const sessionFilter = query.sessionId ? { sessionId: query.sessionId } : {};
    const [settings, groups, sessionRows, paymentRows, paymentCount, collectedTotal] =
      await Promise.all([
        tx.workspaceSettings.findUnique({
          where: { workspaceId: scope.workspaceId },
          select: { timezone: true },
        }),
        tx.group.findMany({
          where: { workspaceId: scope.workspaceId, archivedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        tx.teachingSession.findMany({
          where: { workspaceId: scope.workspaceId },
          select: {
            id: true,
            groupId: true,
            gradeLabel: true,
            startsAt: true,
            status: true,
            pricePerStudentMinor: true,
            group: { select: { name: true } },
          },
          orderBy: { startsAt: "desc" },
        }),
        tx.payment.findMany({
          where: { workspaceId: scope.workspaceId, ...sessionFilter },
          orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            amountMinor: true,
            sessionId: true,
            method: true,
            methodLabel: true,
            paidOn: true,
            note: true,
            createdBy: true,
            session: {
              select: {
                id: true,
                startsAt: true,
                group: { select: { id: true, name: true } },
              },
            },
          },
        }),
        tx.payment.count({ where: { workspaceId: scope.workspaceId, ...sessionFilter } }),
        tx.payment.aggregate({
          where: { workspaceId: scope.workspaceId, ...sessionFilter },
          _sum: { amountMinor: true },
        }),
      ]);

    return {
      timezone: settings?.timezone ?? "Africa/Cairo",
      groups,
      sessionRows,
      paymentRows,
      paymentCount,
      collectedTotal,
    };
  });
}

/** The session that anchors a receipt. Cancelled sessions cannot earn money. */
export async function findSessionForPaymentTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  sessionId: string,
) {
  return tx.teachingSession.findFirst({
    where: { id: sessionId, workspaceId, status: { not: "cancelled" } },
    select: { id: true, status: true, startsAt: true },
  });
}

/** Load the receipts needed for a session's collected total. */
export async function getSessionRevenueDataTx(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  sessionId: string,
) {
  const [session, payments] = await Promise.all([
    tx.teachingSession.findFirst({
      where: { id: sessionId, workspaceId },
      select: { id: true },
    }),
    tx.payment.findMany({
      where: { workspaceId, sessionId },
      select: { amountMinor: true },
    }),
  ]);
  if (!session) return null;
  return { payments };
}

export async function createPaymentTx(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    workspaceId: string;
    sessionId: string;
    amountMinor: number;
    method: "cash" | "transfer" | "other";
    methodLabel: string | null;
    paidOn: Date;
    note: string | null;
    idempotencyKey: string;
    createdBy: string;
  },
) {
  const prior = await tx.payment.findFirst({
    where: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey },
  });
  if (prior) return { payment: prior, duplicate: true, matches: paymentMatches(prior, input) };

  const session = await findSessionForPaymentTx(tx, input.workspaceId, input.sessionId);
  if (!session) return null;

  const { count } = await tx.payment.createMany({
    skipDuplicates: true,
    data: [
      {
        id: input.id,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        amountMinor: input.amountMinor,
        currency: "EGP",
        method: input.method,
        methodLabel: input.methodLabel,
        paidOn: input.paidOn,
        note: input.note,
        idempotencyKey: input.idempotencyKey,
        createdBy: input.createdBy,
      },
    ],
  });
  const payment = await tx.payment.findFirst({
    where: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey },
  });
  if (!payment) throw new Error("Payment insert was ignored without a matching idempotency record");
  return { payment, duplicate: count === 0, matches: paymentMatches(payment, input) };
}

function paymentMatches(
  payment: {
    sessionId: string | null;
    amountMinor: number;
    method: string;
    methodLabel: string | null;
    paidOn: Date;
    note: string | null;
  },
  input: {
    sessionId: string;
    amountMinor: number;
    method: "cash" | "transfer" | "other";
    methodLabel: string | null;
    paidOn: Date;
    note: string | null;
  },
) {
  return (
    payment.sessionId === input.sessionId &&
    payment.amountMinor === input.amountMinor &&
    payment.method === input.method &&
    payment.methodLabel === input.methodLabel &&
    payment.paidOn.getTime() === input.paidOn.getTime() &&
    payment.note === input.note
  );
}
