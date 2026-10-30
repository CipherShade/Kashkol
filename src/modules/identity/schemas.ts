import { z } from "zod";

const emailField = z.string().trim().toLowerCase().pipe(z.email("auth.errors.emailInvalid"));

const passwordField = z
  .string()
  .min(10, "auth.errors.passwordTooShort")
  .max(128, "auth.errors.passwordTooLong");

export const signUpSchema = z
  .object({
    name: z.string().trim().min(2, "auth.errors.nameRequired").max(80, "auth.errors.nameTooLong"),
    email: emailField,
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "auth.errors.passwordMismatch",
  });

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "auth.errors.passwordRequired").max(128),
});

export const requestPasswordResetSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, "auth.errors.tokenInvalid").max(512),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "auth.errors.passwordMismatch",
  });

export const resendVerificationSchema = z.object({
  email: emailField,
});

/**
 * A per-user interface preference. It is stored on `user_preference`, never in
 * the workspace, so it follows the person across devices and workspaces.
 */
export const preferenceSchema = z.object({
  locale: z.enum(["ar", "en"]),
  theme: z.enum(["light", "dark", "system"]),
});

export type PreferenceInput = z.infer<typeof preferenceSchema>;

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Flatten a Zod result into the field → message-key shape the forms render. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const output: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "form";
    output[key] ??= [];
    output[key].push(issue.message);
  }
  return output;
}
