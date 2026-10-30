import { z } from "zod";

const uuid = z.string().uuid();

export const createFollowUpSchema = z.object({
  studentId: uuid,
  ownerUserId: z.string().min(1).max(180).optional(),
  title: z.string().trim().min(1).max(160),
  note: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const resolveFollowUpSchema = z.object({
  outcome: z.enum(["contacted", "no_answer", "monitoring", "no_action", "other"]),
});

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
export type FollowUpOutcomeInput = z.infer<typeof resolveFollowUpSchema>;
