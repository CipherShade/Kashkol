import { withScope } from "@/lib/db/scope";
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
        // Public form uploads are respondent files; they belong to the forms
        // surface and must never appear in the learning-materials library.
        scope: { not: "form_upload" },
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
        scope: { not: "form_upload" },
      },
      include: materialInclude,
    }),
  );
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
