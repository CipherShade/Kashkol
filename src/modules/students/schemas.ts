import { z } from "zod";

/**
 * Egyptian phone numbers:
 * - Local Egyptian mobile starts with 010, 011, 012, or 015 followed by 8 digits (11 digits total).
 * - E.164 Egyptian mobile: +2010..., +2011..., +2012..., +2015... followed by 8 digits (13 chars total with +).
 * - International numbers start with + followed by country code (7 to 15 digits).
 */
export const EGYPTIAN_MOBILE_PREFIXES = ["010", "011", "012", "015"] as const;

export function normalizePhoneNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Remove whitespace, dashes, parentheses, dots
  let cleaned = trimmed.replace(/[\s\-().]/g, "");

  // Convert Arabic-Indic numerals to Latin
  const arabicIndic = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  for (let i = 0; i < 10; i++) {
    cleaned = cleaned.replaceAll(arabicIndic[i], String(i));
  }

  // Handle leading "00" as "+"
  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }

  // Check Egyptian mobile starting with "010", "011", "012", "015"
  const localMatch = cleaned.match(/^0(1[0125]\d{8})$/);
  if (localMatch) {
    return `+20${localMatch[1]}`;
  }

  // Check Egyptian mobile starting with "2010...", "2011...", etc.
  const egyptWithoutPlus = cleaned.match(/^20(1[0125]\d{8})$/);
  if (egyptWithoutPlus) {
    return `+20${egyptWithoutPlus[1]}`;
  }

  // Check Egyptian mobile starting with "+2010...", etc.
  const egyptWithPlus = cleaned.match(/^\+20(1[0125]\d{8})$/);
  if (egyptWithPlus) {
    return `+20${egyptWithPlus[1]}`;
  }

  // International phone: must start with '+' and have 7-15 digits
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

export function isValidEgyptianOrInternationalPhone(raw: string | null | undefined): boolean {
  if (!raw || raw.trim() === "") return true;
  return normalizePhoneNumber(raw) !== null;
}

/**
 * Formula injection protection (ADR-0016).
 * Any cell starting with =, +, -, @, tab, or carriage return is prefixed with a single quote.
 */
export function sanitizeSpreadsheetFormula(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export const phoneSchema = z
  .string()
  .trim()
  .max(30, { message: "phoneTooLong" })
  .refine(
    (val) => val === "" || isValidEgyptianOrInternationalPhone(val),
    { message: "invalidPhoneFormat" },
  )
  .transform((val) => normalizePhoneNumber(val) ?? undefined)
  .optional()
  .nullable();

export const createStudentSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, { message: "firstNameRequired" })
    .max(60, { message: "firstNameTooLong" }),
  lastName: z
    .string()
    .trim()
    .min(1, { message: "lastNameRequired" })
    .max(60, { message: "lastNameTooLong" }),
  grade: z
    .string()
    .trim()
    .max(40, { message: "gradeTooLong" })
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  phone: phoneSchema,
  parentName: z
    .string()
    .trim()
    .max(100, { message: "parentNameTooLong" })
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  parentPhone: phoneSchema,
  groupIds: z.array(z.string().uuid({ message: "invalidGroupId" })).optional().default([]),
  note: z
    .string()
    .trim()
    .max(1000, { message: "noteTooLong" })
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  confirmDuplicate: z.boolean().optional().default(false),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z.object({
  id: z.string().uuid({ message: "invalidStudentId" }),
  firstName: z
    .string()
    .trim()
    .min(1, { message: "firstNameRequired" })
    .max(60, { message: "firstNameTooLong" }),
  lastName: z
    .string()
    .trim()
    .min(1, { message: "lastNameRequired" })
    .max(60, { message: "lastNameTooLong" }),
  grade: z
    .string()
    .trim()
    .max(40, { message: "gradeTooLong" })
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  phone: phoneSchema,
  parentName: z
    .string()
    .trim()
    .max(100, { message: "parentNameTooLong" })
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  parentPhone: phoneSchema,
  groupIds: z.array(z.string().uuid({ message: "invalidGroupId" })).optional(),
  note: z
    .string()
    .trim()
    .max(1000, { message: "noteTooLong" })
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  confirmDuplicate: z.boolean().optional().default(false),
});

export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const createStudentNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { message: "noteRequired" })
    .max(1000, { message: "noteTooLong" }),
});

export type CreateStudentNoteInput = z.infer<typeof createStudentNoteSchema>;

export const studentQuerySchema = z.object({
  search: z.string().trim().optional(),
  groupId: z.string().uuid().optional(),
  status: z.enum(["all", "active", "at_risk", "inactive", "archived"]).optional().default("all"),
  grade: z.string().trim().optional(),
  sortBy: z.enum(["name", "joinedAt", "attendanceRate", "quizAverage"]).optional().default("name"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  showArchived: z
    .union([z.boolean(), z.string().transform((v) => v === "true" || v === "1")])
    .optional()
    .default(false),
});

export type StudentQueryParams = z.infer<typeof studentQuerySchema>;

export const commitImportSchema = z.object({
  mode: z.enum(["all_or_nothing", "valid_only"]).default("all_or_nothing"),
  acknowledgeWarnings: z.boolean().optional().default(false),
  rows: z.array(
    z.object({
      rowNumber: z.number().int(),
      firstName: z.string().trim().min(1),
      lastName: z.string().trim().min(1),
      grade: z.string().trim().nullable().optional(),
       phone: phoneSchema,
      parentName: z.string().trim().nullable().optional(),
       parentPhone: phoneSchema,
      groupName: z.string().trim().nullable().optional(),
      action: z.enum(["create", "update", "skip"]),
      existingStudentId: z.string().uuid().nullable().optional(),
    }),
  ),
  groupMappings: z.record(
    z.string(),
    z.object({
      action: z.enum(["create", "map", "ignore"]),
      targetGroupId: z.string().uuid().nullable().optional(),
    }),
  ),
});

export type CommitImportInput = z.infer<typeof commitImportSchema>;

export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key) {
      if (!fields[key]) fields[key] = [];
      fields[key].push(issue.message);
    }
  }
  return fields;
}
