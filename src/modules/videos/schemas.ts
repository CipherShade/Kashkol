import { z } from "zod";
import { AppError } from "@/lib/http/errors";

export const videoScopeSchema = z.enum(["teacher_only", "groups", "students", "form_upload"]);
export const videoPublicationStatusSchema = z.enum(["draft", "published", "archived"]);

const uuidList = z.array(z.string().uuid()).max(100);

export const videosQuerySchema = z.object({
  groupId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  publicationStatus: videoPublicationStatusSchema.optional(),
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const createVideoLessonSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    topic: z.string().trim().max(120).nullable().optional(),
    subjectId: z.string().uuid().nullable().optional(),
    providerAssetId: z
      .string()
      .trim()
      .min(4)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/, "Invalid provider asset ID"),
    scope: videoScopeSchema,
    publicationStatus: z.enum(["draft", "published"]).default("draft"),
    groupIds: uuidList.default([]),
    studentIds: uuidList.default([]),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "groups" && value.groupIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["groupIds"],
        message: "At least one group is required when scope is groups",
      });
    }
    if (value.scope === "students" && value.studentIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["studentIds"],
        message: "At least one student is required when scope is students",
      });
    }
    if (
      value.scope === "teacher_only" &&
      (value.groupIds.length > 0 || value.studentIds.length > 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["scope"],
        message: "teacher_only video cannot have group or student targets",
      });
    }
  });

export const updateVideoLessonSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    topic: z.string().trim().max(120).nullable().optional(),
    subjectId: z.string().uuid().nullable().optional(),
    scope: videoScopeSchema.optional(),
    groupIds: uuidList.optional(),
    studentIds: uuidList.optional(),
    publicationStatus: videoPublicationStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields provided" });

export type VideosQuery = z.infer<typeof videosQuerySchema>;
export type CreateVideoLessonInput = z.infer<typeof createVideoLessonSchema>;
export type UpdateVideoLessonInput = z.infer<typeof updateVideoLessonSchema>;

export function parseVideoInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED");
  }
  return parsed.data;
}
