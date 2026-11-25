import { z } from "zod";

const uuid = z.string().uuid();

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
  sessionId: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const recordPaymentSchema = z
  .object({
    /** Required: every receipt belongs to a session. */
    sessionId: uuid,
    amount: egpAmount,
    method: z.enum(["cash", "transfer", "other"]),
    methodLabel: z.string().trim().min(1).max(80).optional(),
    paidOn: z.iso.date(),
    note: z.string().trim().max(1000).optional(),
    idempotencyKey: uuid,
  })
  .refine((value) => value.method !== "other" || Boolean(value.methodLabel), {
    path: ["methodLabel"],
    message: "customMethodRequired",
  });

export type PaymentQuery = z.infer<typeof paymentQuerySchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export function egpToMinorUnits(amount: string): number {
  const [whole, fraction = ""] = amount.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > 2_147_483_647n) throw new RangeError("EGP amount exceeds the supported range");
  return Number(minor);
}

export function minorUnitsToEgp(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor))
    throw new RangeError("Amount must be an integer number of piastres");
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}
