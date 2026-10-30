import { z } from "zod";
import { fieldErrorsFrom } from "@/modules/identity/schemas";
import { GRANTABLE_ACTIONS, PERMISSION_RESOURCES, permissionKey } from "./types";

export type LocaleCode = "ar" | "en";
export type ThemeCode = "light" | "dark" | "system";

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

const nameField = z
  .string()
  .trim()
  .min(2, "workspace.errors.nameRequired")
  .max(80, "workspace.errors.nameTooLong");

const teachingNameField = z
  .string()
  .trim()
  .min(2, "workspace.errors.teachingNameRequired")
  .max(80, "workspace.errors.teachingNameTooLong");

const optionalText = z
  .string()
  .trim()
  .max(80, "workspace.errors.textTooLong")
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const gradesField = z
  .array(z.string().trim().min(1).max(60))
  .max(12, "workspace.errors.tooManyGrades")
  .default([]);

const thresholdFields = {
  atRiskAfter: z.coerce
    .number()
    .int("workspace.errors.thresholdInteger")
    .min(1, "workspace.errors.thresholdRange")
    .max(9, "workspace.errors.thresholdRange"),
  inactiveAfter: z.coerce
    .number()
    .int("workspace.errors.thresholdInteger")
    .min(2, "workspace.errors.thresholdRange")
    .max(10, "workspace.errors.thresholdRange"),
};

const settingsFields = {
  locale: z.enum(["ar", "en"]).default("ar"),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  timezone: z
    .string()
    .trim()
    .min(1, "workspace.errors.timezoneInvalid")
    .refine(validTimezone, "workspace.errors.timezoneInvalid")
    .default("Africa/Cairo"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "EGP", "workspace.errors.currencyInvalid")
    .default("EGP"),
};

function thresholdRefinement(value: { atRiskAfter: number; inactiveAfter: number }) {
  return value.atRiskAfter < value.inactiveAfter;
}

export const createWorkspaceSchema = z
  .object({
    name: nameField,
    teachingName: teachingNameField,
    primarySubject: optionalText,
    gradesTaught: gradesField,
    ...thresholdFields,
    ...settingsFields,
  })
  .refine(thresholdRefinement, {
    path: ["inactiveAfter"],
    message: "workspace.errors.thresholdOrder",
  });

export const updateWorkspaceSchema = z
  .object({
    name: nameField,
    teachingName: teachingNameField,
    primarySubject: optionalText,
    gradesTaught: gradesField,
    ...thresholdFields,
    ...settingsFields,
  })
  .refine(thresholdRefinement, {
    path: ["inactiveAfter"],
    message: "workspace.errors.thresholdOrder",
  });

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

const emailField = z.string().trim().toLowerCase().pipe(z.email("team.errors.emailInvalid"));

export const permissionGrantSchema = z.object({
  resource: z.enum(PERMISSION_RESOURCES),
  action: z.enum(["read", "write"]),
}).superRefine(({ resource, action }, ctx) => {
  if (!GRANTABLE_ACTIONS[resource].includes(action)) {
    ctx.addIssue({
      code: "custom",
      path: ["action"],
      message: "errors.permissionNotGrantable",
    });
  }
});

export type PermissionGrantInput = z.infer<typeof permissionGrantSchema>;

export const inviteMemberSchema = z.object({
  email: emailField,
  grants: z.array(permissionGrantSchema).max(64).default([]),
});

export const updateMemberPermissionsSchema = z.object({
  grants: z.array(permissionGrantSchema).max(64),
});

export const invitationTokenSchema = z
  .string()
  .trim()
  .min(32, "team.errors.invitationInvalid")
  .max(128, "team.errors.invitationInvalid")
  .regex(/^[A-Za-z0-9_-]+$/, "team.errors.invitationInvalid");

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberPermissionsInput = z.infer<typeof updateMemberPermissionsSchema>;

/**
 * Keep only pairs the editor may offer. The input is advisory; the service
 * repeats the check before writing anything.
 */
export function grantableOnly(
  grants: ReadonlyArray<PermissionGrantInput>,
): PermissionGrantInput[] {
  const unique = new Map<string, PermissionGrantInput>();
  for (const grant of grants) {
    if (!GRANTABLE_ACTIONS[grant.resource]?.includes(grant.action)) continue;
    unique.set(permissionKey(grant.resource, grant.action), grant);
  }
  return [...unique.values()].sort((left, right) =>
    permissionKey(left.resource, left.action).localeCompare(
      permissionKey(right.resource, right.action),
    ),
  );
}

/** Parse a comma- or newline-separated grade list from a form field. */
export function parseGrades(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[,،\n]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export { fieldErrorsFrom };
