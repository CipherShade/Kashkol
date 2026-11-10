import { describe, expect, it } from "vitest";
import {
  calculateStudentBalances,
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

describe("manual payment currency and balances", () => {
  it("converts EGP decimal strings to integer piastres without rounding", () => {
    expect(egpToMinorUnits("0.1")).toBe(10);
    expect(egpToMinorUnits("12.34")).toBe(1234);
    expect(minorUnitsToEgp(1234)).toBe("12.34");
    expect(recordPaymentSchema.safeParse({
      studentId: "00000000-0000-4000-8000-000000000002",
      amount: "12.345",
      purpose: "October",
      method: "cash",
      paidOn: "2026-10-29",
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
    }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({
      studentId: "00000000-0000-4000-8000-000000000002",
      amount: "1e2",
      purpose: "October",
      method: "cash",
      paidOn: "2026-10-29",
      idempotencyKey: "00000000-0000-4000-8000-000000000003",
    }).success).toBe(false);
  });

  it("computes partial monthly-fee balances from piastre transactions", () => {
    const result = calculateStudentBalances({
      students: [{ id: "student-1" }],
      feeRules: [
        {
          studentId: null,
          groupId: "group-1",
          amountMinor: 10_000,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      enrollments: [
        {
          studentId: "student-1",
          groupId: "group-1",
          enrolledAt: new Date("2026-01-10T00:00:00.000Z"),
          leftAt: null,
        },
      ],
      payments: [{ studentId: "student-1", amountMinor: 12_500, voidedAt: null }],
      adjustments: [],
      asOfMonth: "2026-03",
      timezone: "Africa/Cairo",
    });
    expect(result[0]).toMatchObject({
      expectedMinor: 30_000,
      receivedMinor: 12_500,
      balanceMinor: 17_500,
    });
  });

  it("applies discounts, refunds, and corrections as separate signed records", () => {
    const [balance] = calculateStudentBalances({
      students: [{ id: "student-1" }],
      feeRules: [
        {
          studentId: "student-1",
          groupId: null,
          amountMinor: 10_000,
          effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
        },
      ],
      enrollments: [],
      payments: [{ studentId: "student-1", amountMinor: 10_000, voidedAt: null }],
      adjustments: [
        { studentId: "student-1", amountMinor: 2_000, balanceImpact: -1 },
        { studentId: "student-1", amountMinor: 3_000, balanceImpact: 1 },
        { studentId: "student-1", amountMinor: 1_000, balanceImpact: 1 },
      ],
      asOfMonth: "2026-10",
      timezone: "Africa/Cairo",
    });
    expect(balance).toMatchObject({
      expectedMinor: 10_000,
      receivedMinor: 10_000,
      adjustmentsMinor: 2_000,
      balanceMinor: 2_000,
    });
  });

  it("keeps overpayments as credit and makes monthly dues independent of attendance", () => {
    const [balance] = calculateStudentBalances({
      students: [{ id: "student-1" }],
      feeRules: [
        {
          studentId: "student-1",
          groupId: null,
          amountMinor: 2_500,
          effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
        },
      ],
      enrollments: [],
      payments: [{ studentId: "student-1", amountMinor: 3_000, voidedAt: null }],
      adjustments: [],
      asOfMonth: "2026-10",
      timezone: "Africa/Cairo",
    });
    expect(balance.balanceMinor).toBe(-500);
  });

  it("does not alter monthly dues for cancelled or make-up sessions", () => {
    const [balance] = calculateStudentBalances({
      students: [{ id: "student-1" }],
      feeRules: [{
        studentId: null,
        groupId: "group-1",
        amountMinor: 10_000,
        effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
      }],
      enrollments: [{
        studentId: "student-1",
        groupId: "group-1",
        enrolledAt: new Date("2026-10-01T00:00:00.000Z"),
        leftAt: null,
      }],
      payments: [],
      adjustments: [],
      asOfMonth: "2026-10",
      timezone: "Africa/Cairo",
    });
    expect(balance).toMatchObject({ expectedMinor: 10_000, balanceMinor: 10_000 });
  });

  it("bills session-priced groups per attended session instead of monthly", () => {
    const [balance] = calculateStudentBalances({
      students: [{ id: "student-1" }],
      feeRules: [
        {
          studentId: null,
          groupId: "group-1",
          amountMinor: 10_000,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      enrollments: [
        {
          studentId: "student-1",
          groupId: "group-1",
          enrolledAt: new Date("2026-01-10T00:00:00.000Z"),
          leftAt: null,
        },
      ],
      payments: [{ studentId: "student-1", amountMinor: 15_000, voidedAt: null }],
      adjustments: [],
      sessionCharges: [
        { studentId: "student-1", amountMinor: 5_000 },
        { studentId: "student-1", amountMinor: 5_000 },
        { studentId: "student-1", amountMinor: 5_000 },
      ],
      sessionPricedGroupIds: ["group-1"],
      asOfMonth: "2026-03",
      timezone: "Africa/Cairo",
    });
    expect(balance).toMatchObject({
      expectedMinor: 15_000,
      receivedMinor: 15_000,
      balanceMinor: 0,
    });
  });

  it("does not charge a session-priced group before any session is attended", () => {
    const [balance] = calculateStudentBalances({
      students: [{ id: "student-1" }],
      feeRules: [
        {
          studentId: null,
          groupId: "group-1",
          amountMinor: 10_000,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      enrollments: [
        {
          studentId: "student-1",
          groupId: "group-1",
          enrolledAt: new Date("2026-01-10T00:00:00.000Z"),
          leftAt: null,
        },
      ],
      payments: [],
      adjustments: [],
      sessionCharges: [],
      sessionPricedGroupIds: ["group-1"],
      asOfMonth: "2026-03",
      timezone: "Africa/Cairo",
    });
    expect(balance.expectedMinor).toBe(0);
  });

  it("keeps a monthly group fee when a student also attends session-priced sessions", () => {
    const [balance] = calculateStudentBalances({
      students: [{ id: "student-1" }],
      feeRules: [
        {
          studentId: null,
          groupId: "monthly-group",
          amountMinor: 10_000,
          effectiveFrom: new Date("2026-02-01T00:00:00.000Z"),
        },
        {
          studentId: null,
          groupId: "session-group",
          amountMinor: 99_999,
          effectiveFrom: new Date("2026-02-01T00:00:00.000Z"),
        },
      ],
      enrollments: [
        {
          studentId: "student-1",
          groupId: "monthly-group",
          enrolledAt: new Date("2026-02-01T00:00:00.000Z"),
          leftAt: null,
        },
        {
          studentId: "student-1",
          groupId: "session-group",
          enrolledAt: new Date("2026-02-01T00:00:00.000Z"),
          leftAt: null,
        },
      ],
      payments: [],
      adjustments: [],
      sessionCharges: [{ studentId: "student-1", amountMinor: 5_000 }],
      sessionPricedGroupIds: ["session-group"],
      asOfMonth: "2026-03",
      timezone: "Africa/Cairo",
    });
    expect(balance.expectedMinor).toBe(25_000); // 10,000 × 2 months + 5,000 session
  });

  it("ignores voided payments when settling session charges", () => {
    const [balance] = calculateStudentBalances({
      students: [{ id: "student-1" }],
      feeRules: [],
      enrollments: [],
      payments: [
        { studentId: "student-1", amountMinor: 5_000, voidedAt: new Date("2026-03-01T00:00:00.000Z") },
      ],
      adjustments: [],
      sessionCharges: [{ studentId: "student-1", amountMinor: 5_000 }],
      sessionPricedGroupIds: [],
      asOfMonth: "2026-03",
      timezone: "Africa/Cairo",
    });
    expect(balance).toMatchObject({ expectedMinor: 5_000, receivedMinor: 0, balanceMinor: 5_000 });
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
        studentId: "00000000-0000-4000-8000-000000000002",
        amount: "1.00",
        purpose: "October",
        method: "cash",
        paidOn: "2026-10-29",
        idempotencyKey: "00000000-0000-4000-8000-000000000003",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
