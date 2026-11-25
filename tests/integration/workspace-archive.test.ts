import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { disconnectDb } from "@/lib/db/client";
import { withScope } from "@/lib/db/scope";
import { fixturesScope, createStudent, FIXTURES, FIXTURE_ASSISTANT } from "./helpers";
import type { Permission } from "@/modules/tenancy/types";
import { loadTenantRowsTx } from "@/modules/workspace-backup/repository";
import {
  WORKSPACE_ARCHIVE_FORMAT,
  WORKSPACE_ARCHIVE_SCHEMA_VERSION,
} from "@/modules/workspace-backup/schemas";
import {
  confirmWorkspaceRestore,
  previewWorkspaceRestore,
  processWorkspaceArchiveBatch,
  requestWorkspaceBackup,
} from "@/modules/workspace-backup/service";

afterAll(async () => {
  await disconnectDb();
});

function envelope(tables: Record<string, unknown[]>, workspaceId = FIXTURES) {
  return {
    format: WORKSPACE_ARCHIVE_FORMAT,
    schemaVersion: WORKSPACE_ARCHIVE_SCHEMA_VERSION,
    generatedAt: "2026-11-25T10:00:00.000Z",
    workspaceId,
    tables,
    fileObjectKeys: [],
  };
}

describe("F-P2-11 workspace backup and restore against PostgreSQL RLS", () => {
  it("rejects a non-owner before reading any archive", async () => {
    const scope = {
      ...fixturesScope(),
      role: "assistant" as const,
      actorUserId: FIXTURE_ASSISTANT,
      permissions: new Set<Permission>(),
    };
    const tables = await withScope(scope, (tx) => loadTenantRowsTx(tx, FIXTURES));
    await expect(
      previewWorkspaceRestore(scope, Buffer.from(JSON.stringify(envelope(tables)))),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("previews, confirms and restores the exact archived state with an appended audit", async () => {
    const scope = fixturesScope("Archive");
    const suffix = randomUUID().slice(0, 8);
    const group = await withScope(scope, (tx) =>
      tx.group.create({
        data: { workspaceId: FIXTURES, name: `Archive ${suffix}`, color: "indigo" },
      }),
    );
    await createStudent(FIXTURES, "Archive", suffix);

    const tables = await withScope(scope, (tx) => loadTenantRowsTx(tx, FIXTURES));
    const buffer = Buffer.from(JSON.stringify(envelope(tables)));
    const preview = await previewWorkspaceRestore(scope, buffer);
    expect(preview.applicable).toBe(true);
    expect(preview.uploadId).toBeTruthy();

    // Change the live record; the archive holds the earlier value.
    await withScope(scope, (tx) =>
      tx.group.update({ where: { id: group.id }, data: { name: `Changed ${suffix}` } }),
    );
    const changed = await withScope(scope, (tx) =>
      tx.group.findUnique({ where: { id: group.id }, select: { name: true } }),
    );
    expect(changed?.name).toBe(`Changed ${suffix}`);

    const job = await confirmWorkspaceRestore(
      scope,
      {
        uploadId: preview.uploadId as string,
        confirmation: "RESTORE",
        fingerprint: preview.fingerprint,
      },
      `archive-${suffix}`,
    );
    expect(job.status).toBe("queued");

    const results = await processWorkspaceArchiveBatch(FIXTURES, 5);
    const result = results.find((entry) => entry.jobId === job.id);
    expect(result, `results: ${JSON.stringify(results)}`).toMatchObject({
      status: "succeeded",
      failureCode: null,
    });

    const restored = await withScope(scope, (tx) =>
      tx.group.findUnique({ where: { id: group.id }, select: { name: true } }),
    );
    expect(restored?.name).toBe(`Archive ${suffix}`);
    const audits = await withScope(scope, (tx) =>
      tx.auditEvent.count({ where: { workspaceId: FIXTURES, action: "workspace.restored" } }),
    );
    expect(audits).toBeGreaterThan(0);
  });

  it("rejects an incompatible archive at pre-flight without staging it", async () => {
    const scope = fixturesScope("Archive");
    const tables = await withScope(scope, (tx) => loadTenantRowsTx(tx, FIXTURES));
    const buffer = Buffer.from(
      JSON.stringify({ ...envelope(tables), schemaVersion: "1999-01-01.1" }),
    );
    const preview = await previewWorkspaceRestore(scope, buffer);
    expect(preview.applicable).toBe(false);
    expect(preview.uploadId).toBeNull();
    expect(preview.issues).toContain("ARCHIVE_SCHEMA_INCOMPATIBLE");
  });

  it("queues an owner backup with an audit event in the same transaction", async () => {
    const scope = fixturesScope("Archive");
    const job = await requestWorkspaceBackup(scope, `backup-${randomUUID()}`);
    expect(job.status).toBe("queued");
    const stored = await withScope(scope, (tx) =>
      tx.workspaceArchiveJob.findUnique({
        where: { id: job.id },
        select: { kind: true, workspaceId: true },
      }),
    );
    expect(stored).toMatchObject({ kind: "backup", workspaceId: FIXTURES });
    const audits = await withScope(scope, (tx) =>
      tx.auditEvent.count({
        where: { workspaceId: FIXTURES, action: "workspace.export_requested", entityId: job.id },
      }),
    );
    expect(audits).toBe(1);
  });
});
