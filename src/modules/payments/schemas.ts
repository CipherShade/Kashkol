import { z } from "zod";

const uuid = z.string().uuid();
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine((value) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || Number(value.slice(0, 4)) >= 2000, {
    message: "feeDateTooOld",
  });
const egpAmount = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, "invalidEgpAmount")
  .refine((value) => {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return true;
    const [major, minor = ""] = value.split(".");
    return BigInt(major) * 100n + BigInt(minor.padEnd(2, "0")) <= 2_147_483_647n;
  }, "amountOutOfRange")
  .refine((value) => value !== "0" && !/^0(?:\.0{1,2})?$/.test(value), "amountMustBePositive");

export const paymentQuerySchema = z.object({
  studentId: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const recordPaymentSchema = z
  .object({
    studentId: uuid,
    amount: egpAmount,
    period: z.string().trim().max(80).optional(),
    purpose: z.string().trim().max(160).optional(),
    method: z.enum(["cash", "transfer", "other"]),
    methodLabel: z.string().trim().min(1).max(80).optional(),
    paidOn: z.iso.date(),
    referenceNumber: z.string().trim().max(120).optional(),
    note: z.string().trim().max(1000).optional(),
    idempotencyKey: uuid,
  })
  .refine((value) => Boolean(value.period || value.purpose), {
    path: ["purpose"],
    message: "periodOrPurposeRequired",
  })
  .refine((value) => value.method !== "other" || Boolean(value.methodLabel), {
    path: ["methodLabel"],
    message: "customMethodRequired",
  });

export const createAdjustmentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("discount"),
    studentId: uuid,
    paymentId: uuid.optional(),
    amount: egpAmount,
    paidOn: z.iso.date(),
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: uuid,
  }),
  z.object({
    kind: z.literal("refund"),
    studentId: uuid,
    paymentId: uuid,
    amount: egpAmount,
    paidOn: z.iso.date(),
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: uuid,
  }),
  z.object({
    kind: z.literal("correction"),
    studentId: uuid,
    paymentId: uuid.optional(),
    amount: egpAmount,
    direction: z.enum(["increase_due", "decrease_due"]),
    paidOn: z.iso.date(),
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: uuid,
  }),
]);

export const createFeeRuleSchema = z
  .object({
    studentId: uuid.optional(),
    groupId: uuid.optional(),
    amount: egpAmount,
    effectiveFrom: month,
    purpose: z.string().trim().min(1).max(160),
  })
  .refine((value) => Boolean(value.studentId) !== Boolean(value.groupId), {
    message: "chooseOneFeeTarget",
  });

export type PaymentQuery = z.infer<typeof paymentQuerySchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
export type CreateFeeRuleInput = z.infer<typeof createFeeRuleSchema>;

export function egpToMinorUnits(amount: string): number {
  const [whole, fraction = ""] = amount.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > 2_147_483_647n) throw new RangeError("EGP amount exceeds the supported range");
  return Number(minor);
}

export function minorUnitsToEgp(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError("Amount must be an integer number of piastres");
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}
