import { withScope } from "@/lib/db/scope";
import type { Scope } from "@/modules/tenancy/types";
import { SEARCH_RESULTS_PER_TYPE, type SearchResults } from "./schemas";

export async function findSearchResults(
  scope: Scope,
  normalizedTerm: string,
  include: { students: boolean; groups: boolean },
): Promise<SearchResults> {
  return withScope(scope, async (tx) => {
    const [students, groups] = await Promise.all([
      include.students
        ? tx.student.findMany({
            where: {
              workspaceId: scope.workspaceId,
              archivedAt: null,
              mergedIntoId: null,
              searchKey: { contains: normalizedTerm },
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              grade: true,
            },
            orderBy: [{ searchKey: "asc" }, { firstName: "asc" }, { id: "asc" }],
            take: SEARCH_RESULTS_PER_TYPE,
          })
        : Promise.resolve([]),
      include.groups
        ? tx.group.findMany({
            where: {
              workspaceId: scope.workspaceId,
              archivedAt: null,
              searchKey: { contains: normalizedTerm },
            },
            select: {
              id: true,
              name: true,
              grade: true,
              subject: { select: { name: true } },
            },
            orderBy: [{ searchKey: "asc" }, { id: "asc" }],
            take: SEARCH_RESULTS_PER_TYPE,
          })
        : Promise.resolve([]),
    ]);

    return {
      students,
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        grade: group.grade,
        subjectName: group.subject?.name ?? null,
      })),
    };
  });
}
