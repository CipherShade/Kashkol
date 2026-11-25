import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Permission, Scope } from "@/modules/tenancy/types";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/db/scope", () => ({
  withScope: vi.fn(async (_scope: unknown, fn: (tx: unknown) => unknown) =>
    fn({ auditEvent: { findMany } }),
  ),
}));

import { listAuditEvents } from "@/modules/audit/service";

const workspaceId = "30000000-0000-4000-8000-000000000001";

function scope(role: "owner" | "assistant"): Scope {
  return {
    workspaceId,
    actorUserId: `${role}-1`,
    actorDisplayName: role,
    role,
    permissions: new Set<Permission>(["audit:read"]),
  };
}

describe("audit history money boundary (ADR-0041)", () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it("hides legacy payment events from an assistant with audit:read", async () => {
    await listAuditEvents(scope("assistant"));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId,
          entityType: { not: "payment" },
        },
      }),
    );
  });

  it("keeps the full history for the workspace owner", async () => {
    await listAuditEvents(scope("owner"));

    const query = findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(query.where).toEqual({ workspaceId });
  });
});
