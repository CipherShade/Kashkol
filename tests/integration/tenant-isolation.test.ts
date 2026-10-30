import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb, getDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { getReadiness } from "@/lib/health/readiness";
import { newRequestId } from "@/lib/http/request-id";
import { getWorkspaceOverview } from "@/modules/tenancy/service";

const NILE = "00000000-0000-4000-8000-000000000001";
const DELTA = "00000000-0000-4000-8000-000000000002";

afterAll(async () => {
  await disconnectDb();
});

describe("tenant isolation against PostgreSQL RLS", () => {
  it("returns no rows outside a scoped transaction", async () => {
    const workspaces = await getDb().workspace.findMany({ select: { id: true } });
    expect(workspaces).toHaveLength(0);
  });

  it("shows only the scoped workspace", async () => {
    const nile = await withScope({ workspaceId: NILE }, (tx) =>
      tx.workspace.findFirst({ where: { slug: "nile-academy" }, select: { id: true } }),
    );
    expect(nile?.id).toBe(NILE);

    const crossTenant = await withScope({ workspaceId: DELTA }, (tx) =>
      tx.workspace.findFirst({ where: { id: NILE }, select: { id: true } }),
    );
    expect(crossTenant).toBeNull();
  });

  it("shows only the scoped members", async () => {
    const nileMembers = await withScope({ workspaceId: NILE }, (tx) =>
      tx.workspaceMember.findMany({ select: { workspaceId: true } }),
    );
    expect(nileMembers).toHaveLength(2);
    expect(nileMembers.every((member) => member.workspaceId === NILE)).toBe(true);

    const deltaMembers = await withScope({ workspaceId: DELTA }, (tx) =>
      tx.workspaceMember.findMany({ select: { workspaceId: true } }),
    );
    expect(deltaMembers).toHaveLength(1);
    expect(deltaMembers.every((member) => member.workspaceId === DELTA)).toBe(true);
  });

  it("rejects a write into another tenant", async () => {
    const otherId = randomUUID();
    await expect(
      withScope({ workspaceId: NILE }, (tx) =>
        tx.workspace.create({
          data: {
            id: otherId,
            name: "Cross tenant",
            slug: `cross-${otherId}`,
            teachingName: "Cross tenant",
            gradesTaught: [],
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects a grant that points at another workspace's member", async () => {
    const deltaMember = "20000000-0000-4000-8000-000000000003";
    await expect(
      withScope({ workspaceId: NILE }, (tx) =>
        tx.permissionGrant.create({
          data: {
            workspaceId: NILE,
            memberId: deltaMember,
            resource: "students",
            action: "read",
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("keeps the audit log append-only for the application role", async () => {
    await expect(
      withScope({ workspaceId: NILE }, async (tx) => {
        const event = await tx.auditEvent.create({
          data: {
            workspaceId: NILE,
            actorDisplayName: "Isolation test",
            actorType: "system",
            entityType: "test",
            entityId: randomUUID(),
            action: "test.append_only",
            requestId: newRequestId(),
          },
        });
        await tx.auditEvent.update({
          where: { id: event.id },
          data: { action: "test.changed" },
        });
      }),
    ).rejects.toThrow();
  });

  it("reads a workspace through the tenancy service without exposing another", async () => {
    const ownerScope = {
      workspaceId: NILE,
      actorUserId: "10000000-0000-4000-8000-000000000001",
      actorDisplayName: "Owner",
      role: "owner" as const,
      permissions: new Set<never>(),
    };

    const overview = await getWorkspaceOverview(ownerScope);
    expect(overview.workspace.id).toBe(NILE);
    expect(overview.workspace.slug).toBe("nile-academy");
    expect(overview.settings.timezone).toBe("Africa/Cairo");
  });

  it("reports ready only when the expected migration is applied", async () => {
    const readiness = await getReadiness();
    expect(readiness.status).toBe("ready");
    expect(readiness.checks.config.state).toBe("ok");
    expect(readiness.checks.database.state).toBe("ok");
    expect(readiness.checks.migrations.state).toBe("ok");
  });
});
