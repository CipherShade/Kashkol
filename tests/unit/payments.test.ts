import { describe, expect, it } from "vitest";
import {
  currentDateInTimezone,
  currentMonthInTimezone,
} from "@/modules/payments/calculations";
import {
  egpToMinorUnits,
  minorUnitsToEgp,
  recordPaymentSchema,
} from "@/modules/payments/schemas";
import { getPayments, recordPayment } from "@/modules/payments/service";
import { AppError } from "@/lib/http/errors";
import type { Scope } from "@/modules/tenancy/types";

const owner: Scope = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  actorUserId: "10000000-0000-4000-8000-000000000001",
  actorDisplayName: "Owner",
  role: "owner",
  permissions: new Set(),
};

const assistant: Scope = {
  ...owner,
  actorUserId: "10000000-0000-4000-8000-000000000002",
  role: "assistant",
  permissions: new Set(),
};

const sessionId = "00000000-0000-4000-8000-00000000000a";

describe("manual payment currency and timezone handling", () => {
  it("converts EGP decimal strings to integer piastres without rounding", () => {
    expect(egpToMinorUnits("0.1")).toBe(10);
    expect(egpToMinorUnits("12.34")).toBe(1234);
    expect(minorUnitsToEgp(1234)).toBe("12.34");
    expect(recordPaymentSchema.safeParse({
      sessionId,
      amount: "12.345",
      purpose: "October",
      method: "cash",
      paidOn: "2026-10-29",
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
    }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({
      sessionId,
      amount: "1e2",
      purpose: "October",
      method: "cash",
      paidOn: "2026-10-29",
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
    }).success).toBe(false);
  });

  it("requires a session id on every recorded receipt (ADR-0028)", () => {
    const missingSession = recordPaymentSchema.safeParse({
      amount: "10.00",
      purpose: "Session receipt",
      method: "cash",
      paidOn: "2026-10-29",
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
    });
    expect(missingSession.success).toBe(false);

    const withSession = recordPaymentSchema.safeParse({
      sessionId,
      amount: "10.00",
      purpose: "Session receipt",
      method: "cash",
      paidOn: "2026-10-29",
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
    });
    expect(withSession.success).toBe(true);
  });

  it("uses the workspace timezone for local dates and months", () => {
    const now = new Date("2026-10-28T22:30:00.000Z");
    expect(currentDateInTimezone(now, "Africa/Cairo")).toBe("2026-10-29");
    expect(currentMonthInTimezone(now, "Africa/Cairo")).toBe("2026-10");
  });
});

describe("payment authorization", () => {
  it("denies assistants without explicit payment grants before reading or writing", async () => {
    await expect(getPayments(assistant, { page: 1, pageSize: 25 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<AppError>);
    await expect(
      recordPayment(assistant, {
        sessionId,
        amount: "1.00",
        purpose: "October",
        method: "cash",
        paidOn: "2026-10-29",
        idempotencyKey: "00000000-0000-4000-8000-000000000003",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
