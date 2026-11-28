import { z } from "zod";

export const cairoMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "errors.invalidBillingMonth");

export const cairoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "errors.invalidBillingDate")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: "errors.invalidBillingDate",
  });

const uuid = z.string().uuid();

/**
 * Zod's `.url()` accepts non-network schemes such as `javascript:` and `data:`.
 * Only an absolute HTTPS URL may be stored as an InstaPay link.
 */
export function isSafeBillingUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const safeHttpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine(isSafeBillingUrl, "errors.invalidBillingUrl");

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "errors.invalidTransferDate" });

export const billingAuditReasonCodeSchema = z.enum([
  "config_change",
  "exemption_created",
  "exemption_updated",
  "exemption_revoked",
  "manual_adjustment",
  "review_decision",
  "automatic_lifecycle",
  "reference_release",
  "threshold_reached",
]);

export type BillingAuditReasonCode = z.infer<typeof billingAuditReasonCodeSchema>;

export const billingConfigUpdateSchema = z
  .object({
    thresholdMinor: z.number().int().min(0).max(100_000_000),
    instapayHandle: z.string().trim().min(1).max(120),
    instapayLink: z.union([z.literal(""), safeHttpsUrl]),
    qrStorageKey: z.string().trim().max(500).nullable().optional(),
    reasonCode: billingAuditReasonCodeSchema,
  })
  .strict();

export type BillingConfigUpdateInput = z.infer<typeof billingConfigUpdateSchema>;

export const billingQuerySchema = z
  .object({
    month: cairoMonthSchema.optional(),
  })
  .strict();

export const createBillingSubmissionSchema = z
  .object({
    invoiceId: uuid,
    reference: z.string().trim().min(6).max(64),
    amountMinor: z.number().int().positive().max(100_000_000),
    transferredAt: isoDateTime,
    evidenceFileId: uuid.nullable().optional(),
    idempotencyKey: z.string().trim().min(8).max(120),
  })
  .strict();

export type CreateBillingSubmissionInput = z.infer<typeof createBillingSubmissionSchema>;

export const billingExemptionReasonSchema = z.enum([
  "internal_testing",
  "beta_tester",
  "testimonial",
  "promotional",
  "partner",
  "custom",
]);

export const createBillingExemptionSchema = z
  .object({
    workspaceId: uuid,
    reason: billingExemptionReasonSchema,
    notes: z.string().trim().max(500).nullable().optional(),
    startDate: cairoDateSchema,
    expiresOn: cairoDateSchema.nullable().optional(),
    reasonCode: billingAuditReasonCodeSchema,
  })
  .strict()
  .refine(
    (input) => !input.expiresOn || input.expiresOn >= input.startDate,
    { message: "errors.invalidExemptionPeriod", path: ["expiresOn"] },
  );

export type CreateBillingExemptionInput = z.infer<typeof createBillingExemptionSchema>;

export const updateBillingExemptionSchema = z
  .object({
    reason: billingExemptionReasonSchema.optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    expiresOn: cairoDateSchema.nullable().optional(),
    reasonCode: billingAuditReasonCodeSchema,
  })
  .strict();

export type UpdateBillingExemptionInput = z.infer<typeof updateBillingExemptionSchema>;

export const reviewBillingSubmissionSchema = z
  .object({
    action: z.enum(["under_review", "approved", "rejected", "flagged"]),
    noteCode: z
      .enum(["amount_mismatch", "reference_not_found", "duplicate_reference", "other"])
      .nullable()
      .optional(),
    reasonCode: billingAuditReasonCodeSchema,
    idempotencyKey: z.string().trim().min(8).max(120),
  })
  .strict();

export type ReviewBillingSubmissionInput = z.infer<typeof reviewBillingSubmissionSchema>;

/** A platform administrator may correct a carried balance with an audited entry. */
export const createBillingAdjustmentSchema = z
  .object({
    workspaceId: uuid,
    direction: z.enum(["debit", "credit"]),
    amountMinor: z.number().int().positive().max(100_000_000),
    reasonCode: billingAuditReasonCodeSchema,
    idempotencyKey: z.string().trim().min(8).max(120),
  })
  .strict();

export type CreateBillingAdjustmentInput = z.infer<typeof createBillingAdjustmentSchema>;

export const billingAdminQuerySchema = z
  .object({
    status: z.enum(["all", "submitted", "under_review", "approved", "rejected", "flagged"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

/** The workspace id is supplied by the admin client for a narrow evidence lookup. */
export const billingEvidenceQuerySchema = z
  .object({
    workspaceId: uuid,
  })
  .strict();

/**
 * A platform admin releases a poisoned or disputed reference by naming the
 * submission, never by typing a raw fingerprint or a free-text reason.
 */
export const releaseBillingReferenceSchema = z
  .object({
    workspaceId: uuid,
    submissionId: uuid,
    reasonCode: z.enum(["duplicate_reported", "manual_correction", "other"]),
  })
  .strict();

export type ReleaseBillingReferenceInput = z.infer<typeof releaseBillingReferenceSchema>;
