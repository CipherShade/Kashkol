import { describe, expect, it } from "vitest";
import { SeedGuardError, assertLocalSeedTarget } from "@/lib/config/seed-guard";

const local = {
  APP_ENV: "local",
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://app:secret@localhost:5433/kashkol_dev",
};

describe("development seed guard", () => {
  it("accepts a local loopback target", () => {
    expect(() => assertLocalSeedTarget(local)).not.toThrow();
    expect(() =>
      assertLocalSeedTarget({ ...local, DATABASE_URL: "postgresql://a:b@127.0.0.1:5433/db" }),
    ).not.toThrow();
  });

  it("refuses production and staging", () => {
    expect(() => assertLocalSeedTarget({ ...local, APP_ENV: "production" })).toThrow(
      SeedGuardError,
    );
    expect(() => assertLocalSeedTarget({ ...local, APP_ENV: "staging" })).toThrow(SeedGuardError);
    expect(() => assertLocalSeedTarget({ ...local, NODE_ENV: "production" })).toThrow(
      SeedGuardError,
    );
  });

  it("refuses a non-loopback host", () => {
    expect(() =>
      assertLocalSeedTarget({ ...local, DATABASE_URL: "postgresql://a:b@db.example.com:5432/db" }),
    ).toThrow(SeedGuardError);
  });

  it("refuses a missing or malformed URL", () => {
    expect(() => assertLocalSeedTarget({ ...local, DATABASE_URL: undefined })).toThrow(
      SeedGuardError,
    );
    expect(() => assertLocalSeedTarget({ ...local, DATABASE_URL: "not a url" })).toThrow(
      SeedGuardError,
    );
  });
});
