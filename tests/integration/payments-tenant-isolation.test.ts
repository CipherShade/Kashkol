import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { newRequestId } from "@/lib/http/request-id";
import { writeAuditEvent } from "@/modules/audit/service";
import { createAdjustmentTx, createPaymentTx } from "@/modules/payments/repository";
import { DELTA, NILE } from "./helpers";

class RollbackFixture extends Error {}

afterAll(async () => {
  await disconnectDb();
});

describe("payment ledger tenant isolation", () => {
  it("isolates receipts, adjustments, fee rules, and their audit event by workspace", async () => {
    const studentId = randomUUID();
    const paymentId = randomUUID();
    const adjustmentId = randomUUID();
    const feeRuleId = randomUUID();
    const groupId = randomUUID();
    const sessionId = randomUUID();
    const requestId = newRequestId();

    await expect(
      withScope({ workspaceId: NILE }, async (tx) => {
        await tx.student.create({
          data: { id: studentId, workspaceId: NILE, firstName: "Ledger", lastName: "Isolation" },
        });
        await tx.group.create({
          data: {
            id: groupId,
            workspaceId: NILE,
            name: "Isolation Group",
            scheduleSlots: {
              create: {
                weekday: 1,
                startTime: new Date("1970-01-01T16:00:00.000Z"),
              },
            },
          },
        });
        await tx.teachingSession.create({
          data: {
            id: sessionId,
            workspaceId: NILE,
            groupId,
            startsAt: new Date("2026-10-29T16:00:00.000Z"),
            status: "completed",
          },
        });
        await tx.payment.create({
          data: {
            id: paymentId,
            workspaceId: NILE,
            sessionId,
            amountMinor: 1250,
            currency: "EGP",
            method: "cash",
            paidOn: new Date("2026-10-29T00:00:00.000Z"),
            purpose: "test receipt",
            idempotencyKey: randomUUID(),
            createdBy: "10000000-0000-4000-8000-000000000001",
          },
        });
        await tx.paymentAdjustment.create({
          data: {
            id: adjustmentId,
            workspaceId: NILE,
            paymentId,
            kind: "refund",
            amountMinor: 250,
            balanceImpact: 1,
            currency: "EGP",
            paidOn: new Date("2026-10-29T00:00:00.000Z"),
            reason: "test correction",
            idempotencyKey: randomUUID(),
            createdBy: "10000000-0000-4000-8000-000000000001",
          },
        });
        await tx.feeRule.create({
          data: {
            id: feeRuleId,
            workspaceId: NILE,
            groupId,
            amountMinor: 5000,
            effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
            purpose: "monthly tuition",
            createdBy: "10000000-0000-4000-8000-000000000001",
          },
        });
        await writeAuditEvent(tx, {
          workspaceId: NILE,
          actorUserId: null,
          actorDisplayName: "Isolation test",
          actorType: "system",
          entityType: "payment",
          entityId: paymentId,
          action: "payment.recorded",
          requestId,
        });

        await tx.$executeRaw`SELECT set_config('app.workspace_id', ${DELTA}, true)`;
        expect(await tx.payment.findMany({ where: { workspaceId: NILE } })).toHaveLength(0);
        expect(
          await tx.paymentAdjustment.findMany({ where: { workspaceId: NILE } }),
        ).toHaveLength(0);
        expect(await tx.feeRule.findMany({ where: { workspaceId: NILE } })).toHaveLength(0);
        expect(
          await tx.auditEvent.findMany({
            where: { workspaceId: NILE, entityId: paymentId, requestId },
          }),
        ).toHaveLength(0);
        throw new RollbackFixture();
      }),
    ).rejects.toBeInstanceOf(RollbackFixture);
  });

  it("keeps payment retries idempotent and caps separate refunds at the receipt amount", async () => {
    const studentId = randomUUID();
    const paymentId = randomUUID();
    const paymentKey = randomUUID();
    const refundKey = randomUUID();
    const correctionKey = randomUUID();
    const groupId = randomUUID();
    const sessionId = randomUUID();
    const paidOn = new Date("2026-10-29T00:00:00.000Z");
    const actorUserId = "10000000-0000-4000-8000-000000000001";

    let failure: unknown;
    try {
      await withScope({ workspaceId: NILE }, async (tx) => {
        await tx.student.create({
          data: { id: studentId, workspaceId: NILE, firstName: "Ledger", lastName: "Retry" },
        });
        await tx.group.create({
          data: {
            id: groupId,
            workspaceId: NILE,
            name: "Retry Group",
            scheduleSlots: {
              create: {
                weekday: 1,
                startTime: new Date("1970-01-01T16:00:00.000Z"),
              },
            },
          },
        });
        await tx.teachingSession.create({
          data: {
            id: sessionId,
            workspaceId: NILE,
            groupId,
            startsAt: new Date("2026-10-29T16:00:00.000Z"),
            status: "completed",
          },
        });
        const paymentInput = {
          id: paymentId,
          workspaceId: NILE,
          studentId: null,
          sessionId,
          amountMinor: 10_000,
          period: "2026-10",
          purpose: "Session receipt",
          method: "cash" as const,
          methodLabel: null,
          paidOn,
          referenceNumber: null,
          note: null,
          idempotencyKey: paymentKey,
          createdBy: actorUserId,
        };
        const firstPayment = await createPaymentTx(tx, paymentInput);
        const retryPayment = await createPaymentTx(tx, { ...paymentInput, id: randomUUID() });
        expect(firstPayment?.duplicate).toBe(false);
        expect(retryPayment?.duplicate).toBe(true);
        expect(retryPayment?.payment.id).toBe(paymentId);

        const refundInput = {
          id: randomUUID(),
          workspaceId: NILE,
          studentId: null,
          paymentId,
          kind: "refund" as const,
          amountMinor: 8_000,
          balanceImpact: 1 as const,
          paidOn,
          reason: "Returned part of the payment",
          idempotencyKey: refundKey,
          createdBy: actorUserId,
        };
        const refund = await createAdjustmentTx(tx, refundInput);
        const refundRetry = await createAdjustmentTx(tx, {
          ...refundInput,
          id: randomUUID(),
        });
        const excessRefund = await createAdjustmentTx(tx, {
          ...refundInput,
          id: randomUUID(),
          amountMinor: 2_001,
          idempotencyKey: randomUUID(),
          reason: "Would exceed receipt",
        });
        const correction = await createAdjustmentTx(tx, {
          ...refundInput,
          id: randomUUID(),
          kind: "correction",
          amountMinor: 100,
          balanceImpact: -1,
          idempotencyKey: correctionKey,
          reason: "Corrected the due amount",
        });

        expect(refund).toMatchObject({ duplicate: false, matches: true });
        expect(refundRetry).toMatchObject({ duplicate: true, matches: true });
        expect(excessRefund).toEqual({ refundExceedsReceived: true });
        expect(correction).toMatchObject({ duplicate: false, matches: true });
        expect(await tx.payment.count({ where: { workspaceId: NILE, sessionId } })).toBe(1);
        expect(
          await tx.paymentAdjustment.count({ where: { workspaceId: NILE, paymentId } }),
        ).toBe(2);
        throw new RollbackFixture();
      });
    } catch (error) {
      failure = error;
    }
    if (!(failure instanceof RollbackFixture)) {
      const message = failure instanceof Error ? failure.message : String(failure);
      throw new Error(`Expected transaction rollback, received: ${message}`);
    }
  });
});
