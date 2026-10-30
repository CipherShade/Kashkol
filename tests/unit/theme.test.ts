import { describe, expect, it } from "vitest";
import {
  THEME_COOKIE,
  buildThemeScript,
  isThemePreference,
  resolveTheme,
} from "@/lib/theme";
import { preferenceSchema } from "@/modules/identity/schemas";
import { initialsFor, avatarToneFor } from "@/components/ui/avatar";

describe("theme resolution", () => {
  it("honours an explicit choice over the system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system preference only for system (or unset)", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("validates stored values", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("auto")).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });

  it("builds a pre-paint script that resolves before first paint", () => {
    const script = buildThemeScript("dark");
    expect(script).toContain('"dark"');
    expect(script).toContain("prefers-color-scheme");
    expect(script).toContain(THEME_COOKIE);
    expect(script).toContain("data-theme");
    expect(script).not.toContain("</script");
  });

  it("does not interpolate a value that could break out of the script", () => {
    const script = buildThemeScript('</script><script>alert(1)</script>' as never);
    expect(script).not.toContain("</script><script>alert(1)</script>");
  });
});

describe("preference schema", () => {
  it("accepts the supported locales and themes", () => {
    expect(preferenceSchema.parse({ locale: "ar", theme: "system" })).toEqual({
      locale: "ar",
      theme: "system",
    });
    expect(preferenceSchema.parse({ locale: "en", theme: "dark" }).locale).toBe("en");
  });

  it("rejects an unsupported locale or theme", () => {
    expect(preferenceSchema.safeParse({ locale: "fr", theme: "system" }).success).toBe(false);
    expect(preferenceSchema.safeParse({ locale: "ar", theme: "auto" }).success).toBe(false);
  });
});

describe("avatar identity", () => {
  it("derives initials from Latin and Arabic names", () => {
    expect(initialsFor("Mona Ahmed")).toBe("MA");
    expect(initialsFor("Mona")).toBe("M");
    expect(initialsFor("أحمد علي")).toBe("أع");
    expect(initialsFor("  ")).toBe("?");
  });

  it("assigns a deterministic tone in the documented range", () => {
    const first = avatarToneFor("Mona Ahmed");
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThanOrEqual(6);
    expect(avatarToneFor("Mona Ahmed")).toBe(first);
  });
});
