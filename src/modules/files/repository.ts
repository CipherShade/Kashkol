import { withScope } from "@/lib/db/scope";
import { writeAuditEvent } from "@/modules/audit/service";
import type { Scope } from "@/modules/tenancy/types";
import type { FilesQuery } from "./schemas";

const materialInclude = {
  subject: { select: { id: true, name: true } },
  groupAccesses: { include: { group: { select: { id: true, name: true, archivedAt: true } } } },
  studentAccesses: {
    include: {
      student: {
        select: { id: true, firstName: true, lastName: true, archivedAt: true },
      },
    },
  },
} as const;

type MaterialScope = "teacher_only" | "groups" | "students";

function isMaterialScope(scope: string): scope is MaterialScope {
  return scope === "teacher_only" || scope === "groups" || scope === "students";
}

export async function listMaterialRows(scope: Scope, query: FilesQuery) {
  const rows = await withScope(scope, (tx) =>
    tx.file.findMany({
      where: {
        workspaceId: scope.workspaceId,
        deletedAt: null,
        archivedAt: query.archived ? { not: null } : null,
        // Form responses, homework submissions, and billing evidence belong to
        // their own surfaces and must never appear in the materials library.
        scope: { notIn: ["form_upload", "homework_submission", "billing_evidence"] },
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: "insensitive" } },
                { description: { contains: query.search, mode: "insensitive" } },
                { topic: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: materialInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
  );
  return rows.filter(
    (row): row is (typeof rows)[number] & { scope: MaterialScope } => isMaterialScope(row.scope),
  );
}

export async function findMaterial(scope: Scope, fileId: string) {
  return withScope(scope, (tx) =>
    tx.file.findFirst({
      where: {
        id: fileId,
        workspaceId: scope.workspaceId,
        deletedAt: null,
        scope: { notIn: ["form_upload", "billing_evidence"] },
      },
      include: materialInclude,
    }),
  );
}

/**
 * Billing evidence is deliberately hidden from the materials library and the
 * generic file routes. Its row is created by the billing evidence service only
 * after validation and a clean malware scan.
 */
export async function createBillingEvidenceFile(
  scope: Scope,
  input: {
    id: string;
    storageKey: string;
    sizeBytes: number;
    mime: string;
    requestId: string;
  },
) {
  return withScope(scope, async (tx) => {
    const file = await tx.file.create({
      data: {
        id: input.id,
        workspaceId: scope.workspaceId,
        scope: "billing_evidence",
        title: "Billing evidence",
        storageKey: input.storageKey,
        sizeBytes: input.sizeBytes,
        mime: input.mime,
        scanStatus: "clean",
        uploadedBy: scope.actorUserId,
      },
      select: { id: true, scanStatus: true },
    });
    await writeAuditEvent(tx, {
      workspaceId: scope.workspaceId,
      actorUserId: scope.actorUserId,
      actorDisplayName: scope.actorDisplayName,
      actorType: "user",
      entityType: "file",
      entityId: file.id,
      action: "file.billing_evidence_uploaded",
      diff: { scope: "billing_evidence", sizeBytes: input.sizeBytes, mime: input.mime },
      requestId: input.requestId,
    });
    return file;
  });
}

export async function getWorkspaceStorageUsage(scope: Scope) {
  return withScope(scope, async (tx) => {
    const result = await tx.file.aggregate({
      where: { workspaceId: scope.workspaceId, deletedAt: null },
      _sum: { sizeBytes: true },
    });
    return result._sum.sizeBytes ?? 0;
  });
}
