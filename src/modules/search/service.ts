import { AppError } from "@/lib/http/errors";
import { isAllowed, type Scope } from "@/modules/tenancy/types";
import { findSearchResults } from "./repository";
import { normalizeSearchTerm, type SearchQuery, type SearchResults } from "./schemas";

/**
 * Search is a read across two resources. A member needs read access to at
 * least one of them; each result type is included only when its own read
 * permission is held, so the endpoint never broadens a grant.
 */
export async function searchWorkspace(scope: Scope, query: SearchQuery): Promise<SearchResults> {
  const students = isAllowed(scope, "students", "read");
  const groups = isAllowed(scope, "grades", "read");

  if (!students && !groups) {
    throw new AppError("FORBIDDEN");
  }

  const normalizedTerm = normalizeSearchTerm(query.q);
  if (!normalizedTerm) {
    return { students: [], groups: [] };
  }

  return findSearchResults(scope, normalizedTerm, { students, groups });
}
