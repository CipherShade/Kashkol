import { describe, expect, it } from "vitest";
import { buildAuthOptions } from "@/lib/auth/auth-options";
import { parseServerEnv } from "@/lib/config/env";
import { normalizeTeacherPhone, phoneIsRequired } from "@/modules/identity/phone";
import { completePhoneSchema, signUpSchema } from "@/modules/identity/schemas";

const validSignUp = {
  name: "Teacher One",
  email: "teacher@kashkol.test",
  phone: "010 1234 5678",
  password: "Velvet-Harbour-92",
  confirmPassword: "Velvet-Harbour-92",
};

const localEnv = parseServerEnv({
  FILE_STORAGE_DRIVER: "local",
  DATABASE_URL: "postgresql://app:secret@localhost:5433/kashkol_dev",
  BETTER_AUTH_SECRET: "x".repeat(40),
  APP_ENV: "local",
  BETTER_AUTH_URL: "http://localhost:3000",
  EMAIL_TRANSPORT: "console",
});

describe("required teacher phone (ADR-0052)", () => {
  it("requires a phone for credential sign-up and stores it normalised", () => {
    const parsed = signUpSchema.safeParse(validSignUp);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.phone).toBe("+201012345678");

    const missing = signUpSchema.safeParse({ ...validSignUp, phone: "" });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(JSON.stringify(missing.error.issues)).toContain("auth.errors.phoneRequired");
    }
  });

  it("accepts Arabic-Indic digits and rejects invalid numbers", () => {
    expect(normalizeTeacherPhone("٠١٠ ١٢٣٤ ٥٦٧٨")).toBe("+201012345678");
    expect(normalizeTeacherPhone("01312345678")).toBeNull();
    expect(completePhoneSchema.safeParse({ phone: "01312345678" }).success).toBe(false);
  });

  it("grandfathers accounts created before the rollout cutoff", () => {
    expect(phoneIsRequired("2026-11-28T04:59:59.999Z")).toBe(false);
    expect(phoneIsRequired("2026-11-28T05:00:00.000Z")).toBe(true);
    expect(phoneIsRequired(null)).toBe(false);
  });

  it("enforces the phone on the public email sign-up hook but not on social registration", async () => {
    const options = buildAuthOptions(localEnv);
    const before = options.databaseHooks?.user?.create?.before;
    expect(before).toBeTypeOf("function");
    if (!before) return;

    const user = { id: "user-1", email: "teacher@kashkol.test", name: "Teacher One" };
    await expect(
      before(user as never, {
        path: "/sign-up/email",
        body: { ...validSignUp },
      } as never),
    ).resolves.not.toThrow();

    await expect(
      before(user as never, {
        path: "/sign-up/email",
        body: { name: "Teacher One", email: "teacher@kashkol.test", password: "x" },
      } as never),
    ).rejects.toMatchObject({ body: { code: "INVALID_TEACHER_PHONE" } });

    await expect(
      before(user as never, { path: "/callback/google", body: {} } as never),
    ).resolves.not.toThrow();
  });
});
