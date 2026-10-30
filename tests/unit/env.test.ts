import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/config/env";

const valid = {
  APP_ENV: "local",
  DATABASE_URL: "postgresql://app:secret@localhost:5433/kashkol_dev",
  BETTER_AUTH_SECRET: "x".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("server environment", () => {
  it("parses a complete local environment", () => {
    const env = parseServerEnv(valid);
    expect(env.APP_ENV).toBe("local");
    expect(env.REQUIRE_MIGRATIONS).toBe(true);
    expect(env.DIRECT_DATABASE_URL).toBeUndefined();
  });

  it("allows REQUIRE_MIGRATIONS=false", () => {
    expect(parseServerEnv({ ...valid, REQUIRE_MIGRATIONS: "false" }).REQUIRE_MIGRATIONS).toBe(
      false,
    );
  });

  it("reports only key names, never values", () => {
    const secret = "short";
    let message = "";
    try {
      parseServerEnv({ ...valid, BETTER_AUTH_SECRET: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("BETTER_AUTH_SECRET");
    expect(message).not.toContain(secret);
  });

  it("requires a database URL", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
  });

  it("requires private S3 storage and ClamAV outside local development", () => {
    const staging = { ...valid, APP_ENV: "staging", BETTER_AUTH_URL: "https://app.example.test" };
    expect(() => parseServerEnv(staging)).toThrow(/FILE_STORAGE_DRIVER/);
    expect(() =>
      parseServerEnv({
        ...staging,
        FILE_STORAGE_DRIVER: "s3",
        S3_BUCKET: "private-files",
        S3_REGION: "eu-west-1",
      }),
    ).toThrow(/CLAMAV_HOST/);
    expect(
      parseServerEnv({
        ...staging,
        FILE_STORAGE_DRIVER: "s3",
        S3_BUCKET: "private-files",
        S3_REGION: "eu-west-1",
        CLAMAV_HOST: "clamav.internal",
        REPORT_EXPORT_WORKER_TOKEN: "w".repeat(32),
      }).FILE_STORAGE_DRIVER,
    ).toBe("s3");
  });
});
