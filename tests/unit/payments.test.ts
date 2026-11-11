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
import { buildSessionCharges } from "@/modules/payments/session-revenue";

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

  it("keeps direct student fee rules alongside session-priced group enrollment", () => {
    const [balance] = calculateStudentBalances({
      students: [{ id: "student-1" }],
      feeRules: [
        {
          studentId: "student-1",
          groupId: null,
          amountMinor: 5_000,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        },
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
      sessionCharges: [{ studentId: "student-1", amountMinor: 6_000 }],
      sessionPricedGroupIds: ["group-1"],
      asOfMonth: "2026-03",
      timezone: "Africa/Cairo",
    });
    // Direct student fee: 5,000 × 3 months = 15,000. Group monthly fee suppressed. Session charges 6,000.
    expect(balance.expectedMinor).toBe(21_000);
  });

  it("respects session price even when group default price is not configured", () => {
    const sessions = [
      {
        id: "s1",
        groupId: "group-1",
        pricePerStudentMinor: 1_300,
        group: { defaultPricePerStudentMinor: null },
      },
    ];
    const marks = [{ studentId: "student-1", sessionId: "s1" }];
    const result = buildSessionCharges(sessions, marks);
    expect(result.charges).toEqual([{ studentId: "student-1", amountMinor: 1_300 }]);
    expect(result.sessionPricedGroupIds).toContain("group-1");
  });

describe("per-session revenue — focused regression for ADR-0025 rules", () => {
  it("charges exactly the present/late marks a caller passes in (the absent/excused filter lives upstream)", () => {
    // The mark value itself is not in the ChargeAttendanceMark input: every call
    // site (payments, reports, dashboard, portal, attendance toggle) queries
    // attendance_mark with mark in ["present","late"] on non-cancelled sessions
    // before invoking this builder. Absent and excused students therefore never
    // produce charges — that is the contract this test encodes.
    const sessions = [
      {
        id: "s1",
        groupId: "group-1",
        pricePerStudentMinor: 1_000,
        group: { defaultPricePerStudentMinor: 0 },
      },
    ];
    const result = buildSessionCharges(sessions, [
      { studentId: "present-1", sessionId: "s1" },
      { studentId: "present-2", sessionId: "s1" },
    ]);
    expect(result.charges).toEqual([
      { studentId: "present-1", amountMinor: 1_000 },
      { studentId: "present-2", amountMinor: 1_000 },
    ]);
  });

  it("a single present mark produces one charge equal to the session price, no group monthly fee", () => {
    const sessions = [
      {
        id: "s1",
        groupId: "group-1", // session-priced via the session itself, no default price
        pricePerStudentMinor: 4_500,
        group: { defaultPricePerStudentMinor: 0 },
      },
    ];
    const result = buildSessionCharges(sessions, [
      { studentId: "student-1", sessionId: "s1" },
    ]);
    expect(result.charges).toEqual([{ studentId: "student-1", amountMinor: 4_500 }]);
    expect(result.sessionPricedGroupIds).toContain("group-1");
  });

  it("direct student-level fees keep accruing while a session-priced group's monthly fee is suppressed", () => {
    // Direct: 5,000 × 3 months = 15,000. Group monthly suppressed. Session: 6,000.
    const [balance] = calculateStudentBalances({
      students: [{ id: "student-1" }],
      feeRules: [
        {
          studentId: "student-1",
          groupId: null,
          amountMinor: 5_000,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        },
        {
          studentId: null,
          groupId: "monthly-group",
          amountMinor: 10_000,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      enrollments: [{
        studentId: "student-1",
        groupId: "monthly-group",
        enrolledAt: new Date("2026-01-10T00:00:00.000Z"),
        leftAt: null,
      }],
      payments: [],
      adjustments: [],
      sessionCharges: [{ studentId: "student-1", amountMinor: 6_000 }],
      sessionPricedGroupIds: ["monthly-group"],
      asOfMonth: "2026-03",
      timezone: "Africa/Cairo",
    });
    expect(balance.expectedMinor).toBe(21_000);
    expect(balance.receivedMinor).toBe(0);
  });

  it("a group monthly fee rule produces no charge for a student with no enrollment in that group", () => {
    const [balance] = calculateStudentBalances({
      students: [{ id: "student-1" }],
      feeRules: [
        {
          studentId: null,
          groupId: "monthly-group",
          amountMinor: 10_000,
          effectiveFrom: new Date("2026-02-01T00:00:00.000Z"),
        },
      ],
      enrollments: [],
      payments: [],
      adjustments: [],
      sessionCharges: [],
      sessionPricedGroupIds: [],
      asOfMonth: "2026-03",
      timezone: "Africa/Cairo",
    });
    expect(balance.expectedMinor).toBe(0);
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
});
