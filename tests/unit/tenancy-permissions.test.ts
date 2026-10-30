import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/http/errors";
import {
  assertGrantable,
  assertOwner,
  authorize,
  grantablePermissions,
  isAllowed,
  permissionKey,
  type Permission,
  type Scope,
} from "@/modules/tenancy/types";

const owner: Scope = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  actorUserId: "10000000-0000-4000-8000-000000000001",
  actorDisplayName: "Owner",
  role: "owner",
  permissions: new Set(),
};

const assistant: Scope = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  actorUserId: "10000000-0000-4000-8000-000000000002",
  actorDisplayName: "Assistant",
  role: "assistant",
  permissions: new Set<Permission>(["students:read", "students:write"]),
};

describe("tenancy permissions", () => {
  it("builds stable permission keys", () => {
    expect(permissionKey("students", "read")).toBe("students:read");
  });

  it("allows the owner everything", () => {
    expect(isAllowed(owner, "payments", "write")).toBe(true);
    expect(isAllowed(owner, "team", "write")).toBe(true);
  });

  it("allows only granted assistant permissions", () => {
    expect(isAllowed(assistant, "students", "read")).toBe(true);
    expect(isAllowed(assistant, "students", "write")).toBe(true);
    expect(isAllowed(assistant, "homework", "read")).toBe(false);
  });

  it("never lets an assistant manage the team, even with a grant row", () => {
    const overGranted: Scope = {
      ...assistant,
      permissions: new Set<Permission>(["team:write", "settings:write", "payments:write"]),
    };
    expect(isAllowed(overGranted, "team", "write")).toBe(false);
    expect(isAllowed(overGranted, "settings", "write")).toBe(true);
    expect(isAllowed(overGranted, "payments", "write")).toBe(true);
  });

  it("throws a typed FORBIDDEN error on denial", () => {
    expect(() => authorize(assistant, "homework", "write")).toThrow(AppError);
  });

  it("refuses owner-only operations to an assistant", () => {
    expect(() => assertOwner(assistant)).toThrow(AppError);
    expect(() => assertOwner(owner)).not.toThrow();
  });

  it("refuses to grant team write or audit write to anyone", () => {
    expect(() => assertGrantable("team", "write")).toThrow(AppError);
    expect(() => assertGrantable("audit", "write")).toThrow(AppError);
    expect(() => assertGrantable("settings", "write")).not.toThrow();
  });

  it("enforces every grantable resource/action pair independently", () => {
    const allPermissions = grantablePermissions();
    const fullyGrantedAssistant: Scope = {
      ...assistant,
      permissions: new Set(
        allPermissions.map(({ resource, action }) => permissionKey(resource, action)),
      ),
    };

    for (const resource of [
      "students",
      "grades",
      "groups",
      "sessions",
      "attendance",
      "homework",
      "files",
      "messages",
      "payments",
      "exports",
      "integrations",
      "settings",
      "team",
      "audit",
    ] as const) {
      for (const action of ["read", "write"] as const) {
        const grantable = allPermissions.some(
          (grant) => grant.resource === resource && grant.action === action,
        );
        expect(isAllowed(fullyGrantedAssistant, resource, action)).toBe(grantable);
      }
    }
    expect(isAllowed(assistant, "payments", "read")).toBe(false);
    expect(isAllowed(assistant, "team", "write")).toBe(false);
  });
});
