import { describe, expect, it } from "vitest";
import {
  BUILT_APP_PATHS,
  isAppPath,
  isBuiltAppPath,
  localeFromPath,
  normalizePath,
  stripLocale,
} from "@/lib/navigation/built-paths";

describe("production app-path guard", () => {
  it("recognises a built path with or without a locale", () => {
    expect(isBuiltAppPath("/app")).toBe(true);
    expect(isBuiltAppPath("/ar/app")).toBe(true);
    expect(isBuiltAppPath("/en/app/settings/")).toBe(true);
    expect(isBuiltAppPath("/ar/app/account?tab=1")).toBe(true);
    expect(isBuiltAppPath("/en/app/students")).toBe(true);
    expect(isBuiltAppPath("/ar/app/groups")).toBe(true);
  });

  it("recognises a built detail path but not a nested planned one", () => {
    expect(isBuiltAppPath("/en/app/students/student-1")).toBe(true);
    expect(isBuiltAppPath("/ar/app/groups/group-1?tab=students")).toBe(true);
    expect(isBuiltAppPath("/en/app/students/student-1/edit")).toBe(false);
    expect(isBuiltAppPath("/en/app/groups/group-1/sessions")).toBe(false);
  });

  it("treats a planned and an unknown module as not built", () => {
    expect(isBuiltAppPath("/ar/app/attendance")).toBe(false);
    expect(isBuiltAppPath("/en/app/settings/team")).toBe(false);
    expect(isBuiltAppPath("/en/app/not-a-module")).toBe(false);
  });

  it("only guards the application subtree", () => {
    expect(isAppPath("/en/app/students")).toBe(true);
    expect(isAppPath("/en/app")).toBe(true);
    expect(isAppPath("/en/sign-in")).toBe(false);
    expect(isAppPath("/en/applications")).toBe(false);
    expect(isAppPath("/healthz")).toBe(false);
  });

  it("strips a locale and a trailing slash deterministically", () => {
    expect(stripLocale("/ar/app/settings")).toBe("/app/settings");
    expect(stripLocale("/en")).toBe("/");
    expect(normalizePath("/ar/app/settings/")).toBe("/app/settings");
    expect(normalizePath("/app?x=1")).toBe("/app");
  });

  it("extracts a supported locale and rejects an unsupported one", () => {
    expect(localeFromPath("/ar/app")).toBe("ar");
    expect(localeFromPath("/en/app")).toBe("en");
    expect(localeFromPath("/fr/app")).toBeNull();
    expect(localeFromPath("/app")).toBeNull();
  });

  it("lists every built route root", () => {
    expect(BUILT_APP_PATHS).toEqual([
      "/app",
      "/app/settings",
      "/app/account",
      "/app/students",
      "/app/groups",
    ]);
  });
});
