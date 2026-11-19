import { z } from "zod";

const name = z
  .string()
  .trim()
  .min(1, { message: "termNameRequired" })
  .max(120, { message: "termNameTooLong" });

// An absent or empty grade means the term applies workspace-wide. A non-empty
// grade overrides the workspace-wide term for that grade (F-P3-07 AC-1).
const grade = z
  .string()
  .trim()
  .max(40, { message: "termGradeTooLong" })
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

const startDate = z.iso.date();
const endDate = z.iso.date();

export const createTermSchema = z
  .object({ name, grade: grade.default(null), startDate, endDate })
  .refine((value) => value.startDate <= value.endDate, {
    path: ["endDate"],
    message: "termDateRangeInvalid",
  });

export const updateTermSchema = z
  .object({ name, grade: grade.default(null), startDate, endDate })
  .refine((value) => value.startDate <= value.endDate, {
    path: ["endDate"],
    message: "termDateRangeInvalid",
  });

export type TermInput = z.infer<typeof createTermSchema>;

export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!key) continue;
    if (!fields[key]) fields[key] = [];
    fields[key].push(issue.message);
  }
  return fields;
}
