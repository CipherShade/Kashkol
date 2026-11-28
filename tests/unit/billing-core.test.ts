import { describe, expect, it } from "vitest";
import {
  computeBillingSummary,
  formatMinorAsEgp,
  formatMinorAsEgpLabel,
} from "@/modules/billing/ledger";
import arMessages from "../../messages/ar.json";
import enMessages from "../../messages/en.json";
import {
  computeChargeMinor,
  computeQualifyingStudents,
  isQualifyingBillingMark,
  qualificationLookupRange,
  type BillingAttendanceRow,
} from "@/modules/billing/qualification";
import {
  normalizeTransactionReference,
  transactionReferenceFingerprint,
} from "@/modules/billing/reference";
import {
  billingConfigUpdateSchema,
  createBillingAdjustmentSchema,
  createBillingExemptionSchema,
  createBillingSubmissionSchema,
  isSafeBillingUrl,
  releaseBillingReferenceSchema,
  reviewBillingSubmissionSchema,
} from "@/modules/billing/schemas";
import { NotificationTypeSchema } from "@/modules/messaging/schemas";
import {
  exemptionCoversDate,
  exemptionCoversMonth,
  exemptionsOverlap,
  isForwardOnlyExemptionExpiration,
  resolveExemptionStatus,
} from "@/modules/billing/exemption";
import {
  cairoDateFromDate,
  cairoMonthDateBounds,
  cairoMonthFromDate,
  cairoMonthRange,
  cairoWallTimeToUtc,
} from "@/modules/billing/time";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOVEMBER = cairoMonthRange("2026-11");

const row = (
  studentId: string,
  markId: string,
  mark: BillingAttendanceRow["mark"],
  sessionStatus: BillingAttendanceRow["sessionStatus"] = "completed",
  startsAt: Date = new Date("2026-11-10T10:00:00.000Z"),
): BillingAttendanceRow => ({ studentId, markId, mark, sessionStatus, startsAt });

describe("billing qualification", () => {
  it("counts only present or late marks on non-cancelled sessions", () => {
    expect(isQualifyingBillingMark(row("s", "m", "present"))).toBe(true);
    expect(isQualifyingBillingMark(row("s", "m", "late"))).toBe(true);
    expect(isQualifyingBillingMark(row("s", "m", "absent"))).toBe(false);
    expect(isQualifyingBillingMark(row("s", "m", "excused"))).toBe(false);
    expect(isQualifyingBillingMark(row("s", "m", "present", "cancelled"))).toBe(false);
  });

  it("requires two distinct qualifying marks per student and de-duplicates mark ids", () => {
    const students = computeQualifyingStudents([
      row("s1", "m1", "present"),
      row("s1", "m1", "present"),
      row("s1", "m2", "late"),
      row("s2", "m3", "present"),
      row("s2", "m4", "absent"),
      row("s3", "m5", "present"),
      row("s3", "m6", "present", "cancelled"),
      row("s4", "m7", "late"),
      row("s4", "m8", "excused"),
      row("s4", "m9", "late"),
    ], NOVEMBER);
    expect(students.map((student) => student.studentId)).toEqual(["s1", "s4"]);
    expect(students[0]?.markIds).toEqual(["m1", "m2"]);
  });

  it("requires two qualifying sessions inside a rolling 30-day window", () => {
    const first = new Date("2026-11-05T10:00:00.000Z");
    const exactlyThirtyDays = new Date(first.getTime() + 30 * DAY_MS);
    const thirtyOneDays = new Date(first.getTime() + 31 * DAY_MS);

    expect(computeQualifyingStudents([
      row("near", "a1", "present", "completed", first),
      row("near", "a2", "late", "completed", exactlyThirtyDays),
    ], NOVEMBER).map((student) => student.studentId)).toEqual(["near"]);

    expect(computeQualifyingStudents([
      row("far", "b1", "present", "completed", first),
      row("far", "b2", "late", "completed", thirtyOneDays),
    ], NOVEMBER)).toEqual([]);
  });

  it("qualifies across a month boundary only when one session is in the billed month", () => {
    const previousMonth = new Date("2026-10-25T10:00:00.000Z");
    const billedMonth = new Date("2026-11-20T10:00:00.000Z");

    expect(computeQualifyingStudents([
      row("boundary", "c1", "present", "completed", previousMonth),
      row("boundary", "c2", "present", "completed", billedMonth),
    ], NOVEMBER).map((student) => student.studentId)).toEqual(["boundary"]);

    expect(computeQualifyingStudents([
      row("previous", "d1", "present", "completed", previousMonth),
      row("previous", "d2", "late", "completed", new Date("2026-10-28T10:00:00.000Z")),
    ], NOVEMBER)).toEqual([]);
  });

  it("clamps the qualification lookup to the activation month", () => {
    const lookup = qualificationLookupRange(
      NOVEMBER,
      cairoMonthRange("2026-10").start,
    );
    expect(lookup.start.getTime()).toBe(NOVEMBER.start.getTime() - 30 * DAY_MS);
    expect(lookup.endExclusive).toEqual(NOVEMBER.endExclusive);

    const fromActivation = qualificationLookupRange(
      NOVEMBER,
      new Date("2026-11-10T00:00:00.000Z"),
    );
    expect(fromActivation.start.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });

  it("computes integer piastre charges without rounding drift", () => {
    expect(computeChargeMinor(0, 99)).toBe(0);
    expect(computeChargeMinor(3, 99)).toBe(297);
    expect(() => computeChargeMinor(-1, 99)).toThrow();
    expect(() => computeChargeMinor(1, 99.5)).toThrow();
  });
});

describe("Cairo billing time", () => {
  it("maps UTC instants to Cairo months across the daylight-saving boundary", () => {
    expect(cairoMonthFromDate(new Date("2026-04-30T20:59:00Z"))).toBe("2026-04");
    expect(cairoMonthFromDate(new Date("2026-04-30T21:00:00Z"))).toBe("2026-05");
    expect(cairoDateFromDate(new Date("2026-10-29T21:00:00Z"))).toBe("2026-10-29");
    expect(cairoMonthFromDate(new Date("2026-11-30T21:59:00Z"))).toBe("2026-11");
  });

  it("uses a half-open UTC range derived from Cairo local midnight", () => {
    expect(cairoMonthRange("2026-05")).toEqual({
      start: new Date("2026-04-30T21:00:00Z"),
      endExclusive: new Date("2026-05-31T21:00:00Z"),
    });
  });

  it("returns inclusive Cairo date bounds for an exemption month", () => {
    expect(cairoMonthDateBounds("2026-02")).toEqual({
      firstDay: "2026-02-01",
      lastDay: "2026-02-28",
    });
  });

  it("chooses the earliest matching instant for an ambiguous Cairo wall time", () => {
    // Egypt falls back from GMT+3 to GMT+2 at 2026-10-29T21:00Z, so local
    // 23:00 occurs twice. The converter must pick the first occurrence.
    expect(
      cairoWallTimeToUtc({ year: 2026, month: 10, day: 29, hour: 23, minute: 0 }),
    ).toEqual(new Date("2026-10-29T20:00:00.000Z"));
  });

  it("moves forward past a nonexistent Cairo wall time during the spring jump", () => {
    // Egypt jumps from 00:00 to 01:00 on 2026-04-24, so local 00:30 does not
    // exist. The converter must land on the first valid instant after it.
    const resolved = cairoWallTimeToUtc({
      year: 2026,
      month: 4,
      day: 24,
      hour: 0,
      minute: 30,
    });
    expect(resolved).toEqual(new Date("2026-04-23T22:30:00.000Z"));
    expect(cairoDateFromDate(resolved)).toBe("2026-04-24");
    expect(cairoMonthFromDate(resolved)).toBe("2026-04");
  });
});

describe("billing exemptions", () => {
  const base = { startDate: "2026-05-01", expiresOn: null, status: "active" as const };

  it("covers dates inclusively and never covers periods after revocation", () => {
    expect(exemptionCoversDate(base, "2026-04-30")).toBe(false);
    expect(exemptionCoversDate(base, "2026-05-01")).toBe(true);
    expect(exemptionCoversDate({ ...base, expiresOn: "2026-05-31" }, "2026-05-31")).toBe(true);
    expect(exemptionCoversDate({ ...base, status: "revoked" }, "2026-05-02")).toBe(false);
    expect(
      exemptionCoversDate(
        { ...base, status: "revoked", revokedOn: "2026-05-15" },
        "2026-05-15",
      ),
    ).toBe(true);
    expect(
      exemptionCoversDate(
        { ...base, status: "revoked", revokedOn: "2026-05-15" },
        "2026-05-16",
      ),
    ).toBe(false);
  });

  it("treats a partial month as non-billable but stops at expiration", () => {
    expect(exemptionCoversMonth({ ...base, startDate: "2026-05-15" }, "2026-05")).toBe(true);
    expect(exemptionCoversMonth({ ...base, expiresOn: "2026-05-31" }, "2026-06")).toBe(false);
  });

  it("does not bill a month retroactively when an exemption is revoked mid-month", () => {
    const revoked = { ...base, status: "revoked" as const, revokedOn: "2026-05-15" };
    expect(exemptionCoversMonth(revoked, "2026-05")).toBe(true);
    expect(exemptionCoversMonth(revoked, "2026-06")).toBe(false);
  });

  it("does not allow an expiration change to reach into an already-covered past", () => {
    expect(isForwardOnlyExemptionExpiration("2026-05-01", "2026-05-20")).toBe(false);
    expect(isForwardOnlyExemptionExpiration("2026-05-20", "2026-05-20")).toBe(true);
    expect(isForwardOnlyExemptionExpiration(null, "2026-05-20")).toBe(true);
  });

  it("resolves lifecycle status from the injected Cairo date", () => {
    expect(resolveExemptionStatus({ ...base, startDate: "2026-06-01" }, "2026-05-31")).toBe("scheduled");
    expect(resolveExemptionStatus(base, "2026-05-01")).toBe("active");
    expect(resolveExemptionStatus({ ...base, expiresOn: "2026-05-31" }, "2026-06-01")).toBe("expired");
    expect(resolveExemptionStatus({ ...base, status: "revoked" }, "2026-05-01")).toBe("revoked");
  });

  it("rejects overlapping active exemptions", () => {
    expect(
      exemptionsOverlap(
        { ...base, expiresOn: "2026-05-31" },
        { startDate: "2026-05-31", expiresOn: "2026-06-30", status: "active" },
      ),
    ).toBe(true);
    expect(
      exemptionsOverlap(
        { ...base, expiresOn: "2026-05-31" },
        { startDate: "2026-06-01", expiresOn: null, status: "active" },
      ),
    ).toBe(false);
  });
});

describe("manual transaction references", () => {
  it("normalizes only whitespace, separators, and case", () => {
    expect(normalizeTransactionReference("  ab-12 34 ")).toBe("AB1234");
    expect(transactionReferenceFingerprint(normalizeTransactionReference("ab-1234"))).toBe(
      transactionReferenceFingerprint(normalizeTransactionReference(" AB1234 ")),
    );
    expect(transactionReferenceFingerprint("AB1234")).toHaveLength(64);
  });
});

describe("billing schemas", () => {
  const submission = {
    invoiceId: "00000000-0000-4000-8000-000000000001",
    reference: "TXN-123456",
    amountMinor: 5000,
    transferredAt: "2026-11-27T10:00:00Z",
    idempotencyKey: "submission-1",
  };

  it("accepts a complete manual submission and rejects unknown fields", () => {
    expect(createBillingSubmissionSchema.safeParse(submission).success).toBe(true);
    expect(
      createBillingSubmissionSchema.safeParse({ ...submission, workspaceId: "other" }).success,
    ).toBe(false);
  });

  it("rejects an exemption that expires before it starts", () => {
    expect(
      createBillingExemptionSchema.safeParse({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        reason: "internal_testing",
        startDate: "2026-06-01",
        expiresOn: "2026-05-31",
        reasonCode: "exemption_created",
      }).success,
    ).toBe(false);
  });

  it("accepts the four real review actions only", () => {
    const baseReview = {
      noteCode: null,
      reasonCode: "review_decision",
      idempotencyKey: "review-1",
    };
    for (const action of ["under_review", "approved", "rejected", "flagged"]) {
      expect(reviewBillingSubmissionSchema.safeParse({ ...baseReview, action }).success).toBe(true);
    }
    expect(reviewBillingSubmissionSchema.safeParse({ ...baseReview, action: "paid" }).success).toBe(
      false,
    );
  });

  it("requires a scoped, keyed, and audited balance adjustment", () => {
    const workspaceId = "00000000-0000-4000-8000-000000000001";
    expect(
      createBillingAdjustmentSchema.safeParse({
        workspaceId,
        direction: "credit",
        amountMinor: 250,
        reasonCode: "manual_adjustment",
        idempotencyKey: "adjustment-1",
      }).success,
    ).toBe(true);
    expect(
      createBillingAdjustmentSchema.safeParse({
        workspaceId,
        direction: "credit",
        amountMinor: 0,
        reasonCode: "manual_adjustment",
        idempotencyKey: "adjustment-1",
      }).success,
    ).toBe(false);
  });

  it("keeps the shared notification schema in step with the database enum", () => {
    const databaseValues = [
      "attendance_present",
      "attendance_absent",
      "attendance_late",
      "attendance_excused",
      "session_cancelled",
      "session_rescheduled",
      "homework_assigned",
      "homework_reminder",
      "exam_result",
      "student_at_risk",
      "session_unrecorded",
      "homework_due_soon",
      "assessment_pending_grades",
      "backup_ready",
      "export_ready",
      "billing_invoice_issued",
      "billing_submission_approved",
      "billing_submission_rejected",
      "billing_submission_flagged",
      "general",
    ];
    expect([...NotificationTypeSchema.options].sort()).toEqual(databaseValues.sort());
  });
});

describe("billing ledger projection", () => {
  const invoice = { id: "inv-1", number: "KSH-202611-ABC", totalMinor: 5000 };

  it("computes carried balance, paid amount, and outstanding amount from records", () => {
    const summary = computeBillingSummary(
      [
        {
          entryType: "usage_charge",
          direction: "debit",
          amountMinor: 2000,
          sourceType: "snapshot",
          sourceId: "carried",
        },
        {
          entryType: "usage_charge",
          direction: "debit",
          amountMinor: 5000,
          sourceType: "snapshot",
          sourceId: "snap-1",
        },
        {
          entryType: "invoice_allocation",
          direction: "credit",
          amountMinor: 5000,
          sourceType: "invoice",
          sourceId: "inv-1",
        },
        {
          entryType: "payment_credit",
          direction: "credit",
          amountMinor: 5000,
          sourceType: "submission",
          sourceId: "sub-1",
        },
      ],
      [invoice],
      [{ id: "sub-1", invoiceId: "inv-1", status: "approved" }],
    );

    expect(summary).toMatchObject({
      unbilledMinor: 2000,
      invoicedMinor: 5000,
      paidMinor: 5000,
      outstandingMinor: 2000,
    });
    expect(summary.invoices[0]).toMatchObject({
      state: "paid",
      paidMinor: 5000,
      outstandingMinor: 0,
    });
  });

  it("uses every record for totals, not only the first display page", () => {
    const entries: Array<{
      id: string;
      entryType: "usage_charge" | "payment_credit";
      direction: "debit" | "credit";
      amountMinor: number;
      sourceType: string;
      sourceId: string;
    }> = Array.from({ length: 250 }, (_, index) => ({
      id: `charge-${index}`,
      entryType: "usage_charge" as const,
      direction: "debit" as const,
      amountMinor: 99,
      sourceType: "snapshot",
      sourceId: `student-${index}`,
    }));
    entries.push({
      id: "credit-old",
      entryType: "payment_credit",
      direction: "credit",
      amountMinor: 9900,
      sourceType: "submission",
      sourceId: "sub-old",
    });
    const invoices = Array.from({ length: 120 }, (_, index) => ({
      id: `inv-${index}`,
      number: `KSH-${index}`,
      totalMinor: 9900,
    }));
    const submissions = [
      ...Array.from({ length: 110 }, (_, index) => ({
        id: `sub-${index}`,
        invoiceId: `inv-${index}`,
        status: "submitted" as const,
      })),
      { id: "sub-old", invoiceId: "inv-110", status: "approved" as const },
    ];

    const summary = computeBillingSummary(entries, invoices, submissions);
    expect(summary.unbilledMinor).toBe(250 * 99);
    expect(summary.paidMinor).toBe(9900);
    expect(summary.invoices.find((view) => view.id === "inv-110")).toMatchObject({
      state: "paid",
      paidMinor: 9900,
      outstandingMinor: 0,
    });
  });

  it("consumes negative adjustments exactly once", () => {
    const summary = computeBillingSummary(
      [
        { entryType: "usage_charge", direction: "debit", amountMinor: 5000, sourceType: "snapshot", sourceId: "snap-1" },
        { entryType: "adjustment", direction: "credit", amountMinor: 2000, sourceType: "admin", sourceId: "adj-1" },
        { entryType: "invoice_allocation", direction: "credit", amountMinor: 5000, sourceType: "invoice", sourceId: "inv-1" },
        { entryType: "invoice_allocation", direction: "debit", amountMinor: 2000, sourceType: "invoice", sourceId: "inv-1" },
      ],
      [invoice],
      [],
    );
    expect(summary.unbilledMinor).toBe(0);
  });

  it("never treats an unverified submission as payment", () => {
    const summary = computeBillingSummary(
      [
        {
          entryType: "payment_credit",
          direction: "credit",
          amountMinor: 5000,
          sourceType: "submission",
          sourceId: "sub-2",
        },
      ],
      [invoice],
      [
        { id: "sub-2", invoiceId: "inv-1", status: "submitted" },
        { id: "sub-3", invoiceId: "inv-1", status: "flagged" },
      ],
    );
    expect(summary.paidMinor).toBe(0);
    expect(summary.invoices[0]?.state).toBe("awaiting_verification");
  });

  it("formats piastres without floating-point drift", () => {
    expect(formatMinorAsEgp(99)).toBe("0.99");
    expect(formatMinorAsEgp(5000)).toBe("50.00");
    expect(formatMinorAsEgp(1007)).toBe("10.07");
  });

  it("puts the currency in the server-provided label instead of the component", () => {
    expect(formatMinorAsEgpLabel(99)).toContain("0.99");
    expect(formatMinorAsEgpLabel(99)).toContain("EGP");
    expect(formatMinorAsEgpLabel(5000, "ar-EG")).toContain("EGP");
  });

  it("localizes every newly thrown billing error key in both catalogues", () => {
    const keys = [
      "errors.noRetroactiveExpiration",
      "errors.billingReferenceReleased",
      "errors.billingReferenceNotActive",
      "errors.billingReferenceOwnerMismatch",
      "errors.invalidBillingUrl",
      "PlatformBilling.labels.listTruncated",
    ];
    const catalogues = {
      en: enMessages as unknown as Record<string, Record<string, unknown>>,
      ar: arMessages as unknown as Record<string, Record<string, unknown>>,
    };
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      for (const key of keys) {
        const [section, name] = key.split(".");
        expect(catalogue[section]?.[name], `${locale}.${key}`).toBeTruthy();
      }
    }
  });

  it("allocates invoice credits oldest-first and keeps only the remainder available", () => {
    const summary = computeBillingSummary(
      [
        {
          id: "credit-entry",
          entryType: "invoice_credit",
          direction: "credit",
          amountMinor: 250,
          sourceType: "manual_adjustment",
          sourceId: "adj-1",
        },
      ],
      [
        { id: "old", number: "KSH-OLD", totalMinor: 99 },
        { id: "new", number: "KSH-NEW", totalMinor: 99 },
      ],
      [],
      [
        { invoiceId: "old", ledgerEntryId: "credit-entry", amountMinor: 99 },
        { invoiceId: "new", ledgerEntryId: "credit-entry", amountMinor: 99 },
      ],
    );
    expect(summary.invoices.map((entry) => entry.creditedMinor)).toEqual([99, 99]);
    expect(summary.invoices.map((entry) => entry.state)).toEqual(["credited", "credited"]);
    expect(summary.creditedMinor).toBe(198);
    expect(summary.availableCreditMinor).toBe(52);
    expect(summary.outstandingMinor).toBe(0);
  });

  it("cancels a verified payment with a signed reversal without fabricating payment", () => {
    const summary = computeBillingSummary(
      [
        {
          entryType: "payment_credit",
          direction: "credit",
          amountMinor: 99,
          sourceType: "submission",
          sourceId: "sub-1",
        },
        {
          entryType: "payment_reversal",
          direction: "debit",
          amountMinor: 99,
          sourceType: "reference_release",
          sourceId: "sub-1",
        },
      ],
      [invoice],
      [{ id: "sub-1", invoiceId: "inv-1", status: "approved" }],
    );
    expect(summary.paidMinor).toBe(0);
    expect(summary.invoices[0]?.state).toBe("unpaid");
    expect(summary.availableCreditMinor).toBe(0);
  });
});

describe("billing remediation schemas", () => {
  it("rejects non-network URL schemes that Zod's url() would otherwise accept", () => {
    const base = {
      thresholdMinor: 5000,
      instapayHandle: "instapay@example.test",
      reasonCode: "config_change" as const,
    };
    expect(billingConfigUpdateSchema.safeParse({ ...base, instapayLink: "https://example.test/pay" }).success).toBe(true);
    expect(billingConfigUpdateSchema.safeParse({ ...base, instapayLink: "" }).success).toBe(true);
    expect(billingConfigUpdateSchema.safeParse({ ...base, instapayLink: "javascript:alert(1)" }).success).toBe(false);
    expect(billingConfigUpdateSchema.safeParse({ ...base, instapayLink: "data:text/html,x" }).success).toBe(false);
    // The same guard is reapplied when a stored config version is projected.
    expect(isSafeBillingUrl("https://example.test/pay")).toBe(true);
    expect(isSafeBillingUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeBillingUrl("data:text/html,x")).toBe(false);
  });

  it("requires coded audit reasons and a named submission for reference release", () => {
    const base = {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      submissionId: "00000000-0000-4000-8000-000000000002",
    };
    expect(releaseBillingReferenceSchema.safeParse({ ...base, reasonCode: "duplicate_reported" }).success).toBe(true);
    expect(releaseBillingReferenceSchema.safeParse({ ...base, reasonCode: "free text" }).success).toBe(false);
    expect(releaseBillingReferenceSchema.safeParse({ reasonCode: "duplicate_reported" }).success).toBe(false);
  });
});

describe("billing revocation dates", () => {
  it("keeps a revoked exemption effective through its revocation Cairo date only", () => {
    const exemption = {
      startDate: "2026-06-01",
      expiresOn: null,
      status: "revoked" as const,
      revokedOn: "2026-06-15",
    };
    expect(exemptionCoversDate(exemption, "2026-06-15")).toBe(true);
    expect(exemptionCoversDate(exemption, "2026-06-16")).toBe(false);
    expect(exemptionCoversDate(exemption, "2026-05-31")).toBe(false);
  });

  it("does not cover a month when a scheduled exemption is revoked before it starts", () => {
    const exemption = {
      startDate: "2026-11-25",
      expiresOn: null,
      status: "revoked" as const,
      revokedOn: "2026-11-22",
    };
    expect(exemptionCoversDate(exemption, "2026-11-25")).toBe(false);
    expect(exemptionCoversMonth(exemption, "2026-11")).toBe(false);
  });
});
