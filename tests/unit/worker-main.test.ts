import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerEnv, isRequiredMigrationApplied, runWorker, disconnectDb } = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  isRequiredMigrationApplied: vi.fn(),
  runWorker: vi.fn(),
  disconnectDb: vi.fn(),
}));

vi.mock("@/lib/config/env", () => ({ getServerEnv }));
vi.mock("@/lib/db/migration-gate", () => ({ isRequiredMigrationApplied }));
vi.mock("@/worker/runner", () => ({ runWorker }));
vi.mock("@/lib/db/client", () => ({ disconnectDb }));

import { main } from "@/worker/main";

beforeEach(() => {
  getServerEnv.mockReset();
  isRequiredMigrationApplied.mockReset();
  runWorker.mockReset();
  disconnectDb.mockReset();
});

describe("worker start-up gate", () => {
  it("refuses to drain when the required migration is not applied", async () => {
    getServerEnv.mockReturnValue({ REQUIRE_MIGRATIONS: true });
    isRequiredMigrationApplied.mockResolvedValue(false);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const code = await main();

    expect(code).toBe(1);
    expect(runWorker).not.toHaveBeenCalled();
    expect(disconnectDb).toHaveBeenCalledTimes(1);
  });

  it("skips the migration gate only when REQUIRE_MIGRATIONS is explicitly false", async () => {
    getServerEnv.mockReturnValue({ REQUIRE_MIGRATIONS: false });
    runWorker.mockResolvedValue(undefined);

    const code = await main();

    expect(code).toBe(0);
    expect(isRequiredMigrationApplied).not.toHaveBeenCalled();
    expect(runWorker).toHaveBeenCalledTimes(1);
  });

  it("drains and exits zero when the gate passes", async () => {
    getServerEnv.mockReturnValue({ REQUIRE_MIGRATIONS: true });
    isRequiredMigrationApplied.mockResolvedValue(true);
    runWorker.mockResolvedValue(undefined);

    const code = await main();

    expect(code).toBe(0);
    expect(runWorker).toHaveBeenCalledTimes(1);
    expect(disconnectDb).toHaveBeenCalledTimes(1);
  });

  it("reports a fatal configuration error and exits one instead of restarting silently", async () => {
    getServerEnv.mockImplementation(() => {
      throw new Error("Invalid server configuration: BETTER_AUTH_SECRET");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const code = await main();

    expect(code).toBe(1);
    expect(runWorker).not.toHaveBeenCalled();
    expect(disconnectDb).toHaveBeenCalledTimes(1);
  });
});
