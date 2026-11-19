import { describe, expect, it } from "vitest";
import { selectActiveMembership } from "@/modules/identity/active-workspace";
import { switchWorkspaceSchema } from "@/modules/tenancy/schemas";

const memberships = [
  { workspaceId: "11111111-1111-4111-8111-111111111111" },
  { workspaceId: "22222222-2222-4222-8222-222222222222" },
];

describe("active workspace selection", () => {
  it("uses the deterministic first membership when no pointer is stored", () => {
    expect(selectActiveMembership(memberships, null)?.workspaceId).toBe(memberships[0]?.workspaceId);
  });

  it("uses a pointer while it still names an active membership", () => {
    expect(selectActiveMembership(memberships, memberships[1]?.workspaceId)?.workspaceId).toBe(
      memberships[1]?.workspaceId,
    );
  });

  it("ignores a stale pointer instead of selecting a workspace the user left", () => {
    expect(
      selectActiveMembership(memberships, "99999999-9999-4999-8999-999999999999")?.workspaceId,
    ).toBe(memberships[0]?.workspaceId);
  });

  it("returns nothing when the user has no memberships", () => {
    expect(selectActiveMembership([], memberships[0]?.workspaceId)).toBeUndefined();
  });
});

describe("workspace switch validation", () => {
  it("accepts a UUID target", () => {
    expect(switchWorkspaceSchema.parse({ workspaceId: memberships[1]?.workspaceId }).workspaceId).toBe(
      memberships[1]?.workspaceId,
    );
  });

  it("rejects a non-UUID or missing target", () => {
    expect(switchWorkspaceSchema.safeParse({ workspaceId: "not-a-uuid" }).success).toBe(false);
    expect(switchWorkspaceSchema.safeParse({}).success).toBe(false);
  });

  it("strips client-controlled source fields", () => {
    const parsed = switchWorkspaceSchema.parse({
      workspaceId: memberships[0]?.workspaceId,
      userId: "attacker",
      sessionId: "attacker",
      workspace_id: memberships[1]?.workspaceId,
    });
    expect(parsed).toEqual({ workspaceId: memberships[0]?.workspaceId });
  });
});
