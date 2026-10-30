import { z } from "zod";

const uuid = z.string().uuid();
const fileScope = z.enum(["teacher_only", "groups", "students"]);

export const createMaterialSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).nullable().default(null),
    topic: z.string().trim().max(160).nullable().default(null),
    subjectId: uuid.nullable().default(null),
    scope: fileScope,
    groupIds: z.array(uuid).max(100).default([]),
    studentIds: z.array(uuid).max(500).default([]),
  })
  .refine((value) => new Set(value.groupIds).size === value.groupIds.length, {
    path: ["groupIds"],
    message: "duplicateGroups",
  })
  .refine((value) => new Set(value.studentIds).size === value.studentIds.length, {
    path: ["studentIds"],
    message: "duplicateStudents",
  })
  .refine(
    (value) =>
      (value.scope === "teacher_only" && !value.groupIds.length && !value.studentIds.length) ||
      (value.scope === "groups" && value.groupIds.length > 0 && !value.studentIds.length) ||
      (value.scope === "students" && value.studentIds.length > 0 && !value.groupIds.length),
    { path: ["scope"], message: "invalidScopeTargets" },
  );

export const updateMaterialSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  topic: z.string().trim().max(160).nullable().optional(),
  subjectId: uuid.nullable().optional(),
});

export const filesQuerySchema = z.object({
  archived: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  search: z.string().trim().max(160).optional(),
});

export const archiveMaterialSchema = z.object({ archived: z.boolean() });

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type FilesQuery = z.infer<typeof filesQuerySchema>;
