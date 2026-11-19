/**
 * Pure active-workspace selection rule (`F-P2-08`).
 *
 * The repository orders memberships deterministically. The server-session
 * pointer wins only while it still names one of those memberships, so a stale
 * pointer cannot select a workspace the user no longer belongs to.
 */
export function selectActiveMembership<T extends { workspaceId: string }>(
  memberships: readonly T[],
  selectedWorkspaceId: string | null | undefined,
): T | undefined {
  if (memberships.length === 0) return undefined;
  if (selectedWorkspaceId) {
    const selected = memberships.find((item) => item.workspaceId === selectedWorkspaceId);
    if (selected) return selected;
  }
  return memberships[0];
}
