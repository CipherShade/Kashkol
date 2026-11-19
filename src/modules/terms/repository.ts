import type { Prisma } from "@/generated/prisma/client";
import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import type { TermView } from "./resolution";

type TermRow = {
  id: string;
  name: string;
  grade: string | null;
  startDate: Date;
  endDate: Date;
};

function toTermView(row: TermRow): TermView {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
  };
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function listTerms(scope: Pick<Scope, "workspaceId">): Promise<TermView[]> {
  return withScope(scope, async (tx) => {
    const rows = await tx.academicTerm.findMany({
      where: { workspaceId: scope.workspaceId },
      orderBy: [{ grade: "asc" }, { startDate: "asc" }, { id: "asc" }],
    });
    return rows.map(toTermView);
  });
}

export async function findTermById(
  scope: Pick<Scope, "workspaceId">,
  termId: string,
): Promise<TermView | null> {
  return withScope(scope, async (tx) => {
    const row = await tx.academicTerm.findFirst({
      where: { id: termId, workspaceId: scope.workspaceId },
    });
    return row ? toTermView(row) : null;
  });
}

export async function findAllTermsTx(
  tx: Prisma.TransactionClient,
  scope: Pick<Scope, "workspaceId">,
): Promise<TermView[]> {
  const rows = await tx.academicTerm.findMany({
    where: { workspaceId: scope.workspaceId },
  });
  return rows.map(toTermView);
}

export async function insertTermTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  data: { id: string; name: string; grade: string | null; startDate: string; endDate: string },
): Promise<TermView> {
  const row = await tx.academicTerm.create({
    data: {
      id: data.id,
      workspaceId: scope.workspaceId,
      name: data.name,
      grade: data.grade,
      startDate: dateOnly(data.startDate),
      endDate: dateOnly(data.endDate),
    },
  });
  return toTermView(row);
}

export async function updateTermTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  termId: string,
  data: { name: string; grade: string | null; startDate: string; endDate: string },
): Promise<TermView> {
  const row = await tx.academicTerm.update({
    where: { workspaceId_id: { workspaceId: scope.workspaceId, id: termId } },
    data: {
      name: data.name,
      grade: data.grade,
      startDate: dateOnly(data.startDate),
      endDate: dateOnly(data.endDate),
    },
  });
  return toTermView(row);
}

export async function deleteTermTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  termId: string,
): Promise<void> {
  await tx.academicTerm.delete({
    where: { workspaceId_id: { workspaceId: scope.workspaceId, id: termId } },
  });
}
