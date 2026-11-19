import { selectActiveMembership } from "@/modules/identity/active-workspace";
import { findActiveMemberships, findSessionWorkspaceSelection } from "@/modules/identity/repository";

/**
 * Resolve the active workspace for a user, preferring the session pointer.
 *
 * Prefer `requireStaffSession().scope.workspaceId` wherever a full scope is
 * available; this helper exists for the few pre-scope bootstrap call sites.
 */
export async function getWorkspaceIdForUser(
  userId: string,
  sessionId?: string,
): Promise<string | null> {
  const memberships = await findActiveMemberships(userId);
  const selected = sessionId ? await findSessionWorkspaceSelection(sessionId) : null;
  return selectActiveMembership(memberships, selected)?.workspaceId ?? null;
}
