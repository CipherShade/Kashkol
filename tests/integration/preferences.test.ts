import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb, getDb } from "@/lib/db/client";
import { getUserPreferences, saveUserPreference } from "@/modules/identity/preferences";
import { getCallerMembership } from "@/modules/tenancy/service";
import { createTestUser, deleteTestUser, ownerScope } from "./helpers";

afterAll(async () => {
  await disconnectDb();
});

describe("per-user interface preferences", () => {
  it("persists locale and theme across writes and reads", async () => {
    const user = await createTestUser("preferences");
    try {
      await saveUserPreference(user.id, { locale: "en", theme: "dark" });
      await expect(getUserPreferences(user.id)).resolves.toEqual({
        locale: "en",
        theme: "dark",
      });

      await saveUserPreference(user.id, { locale: "ar", theme: "system" });
      await expect(getUserPreferences(user.id)).resolves.toEqual({
        locale: "ar",
        theme: "system",
      });
    } finally {
      await getDb().userPreference.deleteMany({ where: { userId: user.id } });
      await deleteTestUser(user);
    }
  });

  it("falls back to the documented defaults when no row exists", async () => {
    const user = await createTestUser("no-preferences");
    try {
      await expect(getUserPreferences(user.id)).resolves.toEqual({
        locale: "ar",
        theme: "system",
      });
    } finally {
      await deleteTestUser(user);
    }
  });
});

describe("the caller's own membership", () => {
  it("returns the signed-in member without requiring a team grant", async () => {
    const membership = await getCallerMembership(ownerScope());
    expect(membership.role).toBe("owner");
    expect(membership.user.email).toContain("@");
    expect(membership.joinedAt).toBeInstanceOf(Date);
  });
});
