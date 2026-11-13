import { z } from "zod";

const uuid = z.string().uuid();
const date = z.iso.date();

const reportType = z.enum([
  "attendance",
  "enrollment",
  "academics",
  "homework",
  "payments",
  "sessionRevenue",
]);

export const reportQuerySchema = z
  .object({
    type: reportType,
    from: date.optional(),
    to: date.optional(),
    groupId: uuid.optional(),
    studentId: uuid.optional(),
    page: z.coerce.number().int().min(1).max(50).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "dateRangeInvalid",
  })
  .refine((value) => value.page * value.pageSize <= 5000, {
    path: ["pageSize"],
    message: "reportPageLimitExceeded",
  });

export const reportExportSchema = z
  .object({
    type: reportType,
    from: date.optional(),
    to: date.optional(),
    groupId: uuid.optional(),
    studentId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(5000).default(5000),
    locale: z.enum(["ar", "en"]).default("ar"),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "dateRangeInvalid",
  });

export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportExportQuery = z.infer<typeof reportExportSchema>;
