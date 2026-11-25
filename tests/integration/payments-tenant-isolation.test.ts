import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import { withScope, type DbTransactionClient } from "@/lib/db/scope";
import { newRequestId } from "@/lib/http/request-id";
import { writeAuditEvent } from "@/modules/audit/service";
import { createPaymentTx } from "@/modules/payments/repository";
import { DELTA, NILE } from "./helpers";

class RollbackFixture extends Error {}

afterAll(async () => {
  await disconnectDb();
});

async function createSession(tx: DbTransactionClient, workspaceId: string) {
  const groupId = randomUUID();
  const sessionId = randomUUID();
  await tx.group.create({
    data: {
      id: groupId,
      workspaceId,
      name: "Isolation Group",
      scheduleSlots: {
        create: { weekday: 1, startTime: new Date("1970-01-01T16:00:00.000Z") },
      },
    },
  });
  await tx.teachingSession.create({
    data: {
      id: sessionId,
      workspaceId,
      groupId,
      startsAt: new Date("2026-10-29T16:00:00.000Z"),
      status: "completed",
    },
  });
  return sessionId;
}

describe("collected receipt tenant isolation", () => {
  it("isolates a receipt and its audit event by workspace", async () => {
    const paymentId = randomUUID();
    const requestId = newRequestId();

    await expect(
      withScope({ workspaceId: NILE }, async (tx) => {
        const sessionId = await createSession(tx, NILE);
        await tx.payment.create({
          data: {
            id: paymentId,
            workspaceId: NILE,
            sessionId,
            amountMinor: 1250,
            currency: "EGP",
            method: "cash",
            paidOn: new Date("2026-10-29T00:00:00.000Z"),
            idempotencyKey: randomUUID(),
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
          await tx.auditEvent.findMany({
            where: { workspaceId: NILE, entityId: paymentId, requestId },
          }),
        ).toHaveLength(0);
        throw new RollbackFixture();
      }),
    ).rejects.toBeInstanceOf(RollbackFixture);
  });

  it("keeps receipt retries idempotent without any amendment path", async () => {
    const paymentId = randomUUID();
    const paymentKey = randomUUID();
    const paidOn = new Date("2026-10-29T00:00:00.000Z");
    const actorUserId = "10000000-0000-4000-8000-000000000001";

    let failure: unknown;
    try {
      await withScope({ workspaceId: NILE }, async (tx) => {
        const sessionId = await createSession(tx, NILE);
        const input = {
          id: paymentId,
          workspaceId: NILE,
          sessionId,
          amountMinor: 10_000,
          method: "cash" as const,
          methodLabel: null,
          paidOn,
          note: null,
          idempotencyKey: paymentKey,
          createdBy: actorUserId,
        };
        const first = await createPaymentTx(tx, input);
        const retry = await createPaymentTx(tx, { ...input, id: randomUUID() });
        expect(first?.duplicate).toBe(false);
        expect(retry).toMatchObject({ duplicate: true, matches: true });
        expect(retry?.payment.id).toBe(paymentId);
        expect(await tx.payment.count({ where: { workspaceId: NILE, sessionId } })).toBe(1);
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
